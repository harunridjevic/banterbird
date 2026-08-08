-- Daily usage limits: image sends (1/day free) and gender-based match skips (10/day free)
-- Keyed by a composite of ip + device_id so both must match to be the same "identity".
-- Resets at UTC midnight each day.

create table if not exists public.daily_usage (
  id bigserial primary key,
  -- identity key: SHA-256 of (ip || ':' || device_id) or just ip when device_id absent
  identity_key text not null,
  -- the UTC date this row covers  (e.g. '2026-08-08')
  usage_date date not null default (current_date at time zone 'UTC'),
  -- number of images sent today
  images_sent int not null default 0,
  -- number of gender-based (male/female wants_gender) match attempts used today
  gender_skips int not null default 0,
  -- linked user_id if known (nullable — anonymous users won't have one)
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_key, usage_date)
);

create index if not exists daily_usage_identity_date_idx
  on public.daily_usage (identity_key, usage_date);

create index if not exists daily_usage_user_date_idx
  on public.daily_usage (user_id, usage_date)
  where user_id is not null;

-- RLS: only service role touches this table
alter table public.daily_usage enable row level security;

-- No client access — all reads/writes go through security-definer functions
-- (service role bypasses RLS automatically)

-- ── Helper: build the identity key ────────────────────────────────────────────
-- We concatenate ip and device_id so a VPN hop alone isn't enough to bypass.
-- Uses built-in hashtext() — no pgcrypto extension required.
create or replace function public.build_identity_key(
  p_ip text,
  p_device_id text
)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select to_hex(
    abs(
      hashtext(
        coalesce(nullif(trim(p_ip), ''), 'unknown')
          || ':'
          || coalesce(nullif(trim(p_device_id), ''), 'unknown')
      )
    )::bigint
  );
$$;

-- ── Check daily image usage ─────────────────────────────────────────────────
-- Returns the current image count for today.  Never inserts.
create or replace function public.get_daily_image_count(
  p_ip text,
  p_device_id text
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ikey text;
  cnt  int;
begin
  ikey := public.build_identity_key(p_ip, p_device_id);
  select coalesce(images_sent, 0) into cnt
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;
  return coalesce(cnt, 0);
end;
$$;

-- ── Increment daily image count (returns new count) ─────────────────────────
create or replace function public.increment_daily_image_count(
  p_ip text,
  p_device_id text,
  p_user_id uuid default null
)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ikey     text;
  new_cnt  int;
  today    date;
begin
  ikey  := public.build_identity_key(p_ip, p_device_id);
  today := (current_timestamp at time zone 'UTC')::date;

  insert into public.daily_usage (identity_key, usage_date, images_sent, user_id)
  values (ikey, today, 1, p_user_id)
  on conflict (identity_key, usage_date) do update
    set images_sent = public.daily_usage.images_sent + 1,
        user_id     = coalesce(excluded.user_id, public.daily_usage.user_id),
        updated_at  = now()
  returning images_sent into new_cnt;

  return new_cnt;
end;
$$;

-- ── Check daily gender-match skip count ────────────────────────────────────
create or replace function public.get_daily_gender_skips(
  p_ip text,
  p_device_id text
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ikey text;
  cnt  int;
begin
  ikey := public.build_identity_key(p_ip, p_device_id);
  select coalesce(gender_skips, 0) into cnt
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;
  return coalesce(cnt, 0);
end;
$$;

-- ── Increment daily gender-skip count (returns new count) ────────────────────
create or replace function public.increment_daily_gender_skips(
  p_ip text,
  p_device_id text,
  p_user_id uuid default null
)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ikey     text;
  new_cnt  int;
  today    date;
begin
  ikey  := public.build_identity_key(p_ip, p_device_id);
  today := (current_timestamp at time zone 'UTC')::date;

  insert into public.daily_usage (identity_key, usage_date, gender_skips, user_id)
  values (ikey, today, 1, p_user_id)
  on conflict (identity_key, usage_date) do update
    set gender_skips = public.daily_usage.gender_skips + 1,
        user_id      = coalesce(excluded.user_id, public.daily_usage.user_id),
        updated_at   = now()
  returning gender_skips into new_cnt;

  return new_cnt;
end;
$$;

-- ── Get both counts at once for the status endpoint ─────────────────────────
create or replace function public.get_daily_usage_counts(
  p_ip text,
  p_device_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ikey text;
  row  public.daily_usage%rowtype;
begin
  ikey := public.build_identity_key(p_ip, p_device_id);
  select * into row
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;

  return jsonb_build_object(
    'imagesSent',   coalesce(row.images_sent, 0),
    'genderSkips',  coalesce(row.gender_skips, 0)
  );
end;
$$;

-- ── VPN/proxy detection entries ─────────────────────────────────────────────
-- Ops can manually add IPs or CIDR ranges here to block VPN exits.
-- Automated VPN checks (ipqualityscore / ipapi) are handled server-side in code.
create table if not exists public.vpn_ip_blocks (
  id bigserial primary key,
  ip_or_cidr text not null unique,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists vpn_ip_blocks_ip_idx on public.vpn_ip_blocks (ip_or_cidr);

alter table public.vpn_ip_blocks enable row level security;

-- Grant execute on all usage functions to service_role
-- (service_role bypasses RLS but we still grant for explicitness)
grant execute on function public.build_identity_key(text, text) to service_role;
grant execute on function public.get_daily_image_count(text, text) to service_role;
grant execute on function public.increment_daily_image_count(text, text, uuid) to service_role;
grant execute on function public.get_daily_gender_skips(text, text) to service_role;
grant execute on function public.increment_daily_gender_skips(text, text, uuid) to service_role;
grant execute on function public.get_daily_usage_counts(text, text) to service_role;

-- Also allow anon/authenticated to call the getter functions via the API layer
-- (they never go through Supabase RPC directly — only via our Next.js routes)
-- Keep revoked from public for safety.
revoke all on function public.build_identity_key(text, text) from public, anon, authenticated;
revoke all on function public.get_daily_image_count(text, text) from public, anon, authenticated;
revoke all on function public.increment_daily_image_count(text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_daily_gender_skips(text, text) from public, anon, authenticated;
revoke all on function public.increment_daily_gender_skips(text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_daily_usage_counts(text, text) from public, anon, authenticated;
