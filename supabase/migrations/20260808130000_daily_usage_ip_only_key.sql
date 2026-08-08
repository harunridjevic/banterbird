-- Patch: change identity_key to be IP-only (drop device_id from the key).
-- Adds ip_address column for ops visibility.
-- Recreates all SQL functions with the corrected key logic.
-- Safe to run even if the base migration already applied.

-- Add ip_address column if missing
alter table public.daily_usage
  add column if not exists ip_address text;

-- Recreate build_identity_key — IP only, device_id param kept for compat but ignored
create or replace function public.build_identity_key(
  p_ip text,
  p_device_id text default ''
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
      )
    )::bigint
  );
$$;

-- Recreate get_daily_image_count
create or replace function public.get_daily_image_count(
  p_ip text,
  p_device_id text default ''
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
  ikey := public.build_identity_key(p_ip);
  select coalesce(images_sent, 0) into cnt
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;
  return coalesce(cnt, 0);
end;
$$;

-- Recreate increment_daily_image_count
create or replace function public.increment_daily_image_count(
  p_ip text,
  p_device_id text default '',
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
  ikey  := public.build_identity_key(p_ip);
  today := (current_timestamp at time zone 'UTC')::date;

  insert into public.daily_usage (identity_key, ip_address, usage_date, images_sent, user_id)
  values (ikey, nullif(trim(p_ip), ''), today, 1, p_user_id)
  on conflict (identity_key, usage_date) do update
    set images_sent = public.daily_usage.images_sent + 1,
        ip_address  = coalesce(excluded.ip_address, public.daily_usage.ip_address),
        user_id     = coalesce(excluded.user_id, public.daily_usage.user_id),
        updated_at  = now()
  returning images_sent into new_cnt;

  return new_cnt;
end;
$$;

-- Recreate get_daily_gender_skips
create or replace function public.get_daily_gender_skips(
  p_ip text,
  p_device_id text default ''
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
  ikey := public.build_identity_key(p_ip);
  select coalesce(gender_skips, 0) into cnt
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;
  return coalesce(cnt, 0);
end;
$$;

-- Recreate increment_daily_gender_skips
create or replace function public.increment_daily_gender_skips(
  p_ip text,
  p_device_id text default '',
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
  ikey  := public.build_identity_key(p_ip);
  today := (current_timestamp at time zone 'UTC')::date;

  insert into public.daily_usage (identity_key, ip_address, usage_date, gender_skips, user_id)
  values (ikey, nullif(trim(p_ip), ''), today, 1, p_user_id)
  on conflict (identity_key, usage_date) do update
    set gender_skips = public.daily_usage.gender_skips + 1,
        ip_address   = coalesce(excluded.ip_address, public.daily_usage.ip_address),
        user_id      = coalesce(excluded.user_id, public.daily_usage.user_id),
        updated_at   = now()
  returning gender_skips into new_cnt;

  return new_cnt;
end;
$$;

-- Recreate get_daily_usage_counts
create or replace function public.get_daily_usage_counts(
  p_ip text,
  p_device_id text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ikey text;
  rec  public.daily_usage%rowtype;
begin
  ikey := public.build_identity_key(p_ip);
  select * into rec
  from public.daily_usage
  where identity_key = ikey
    and usage_date = (current_timestamp at time zone 'UTC')::date;

  return jsonb_build_object(
    'imagesSent',   coalesce(rec.images_sent, 0),
    'genderSkips',  coalesce(rec.gender_skips, 0)
  );
end;
$$;

grant execute on function public.build_identity_key(text, text) to service_role;
grant execute on function public.get_daily_image_count(text, text) to service_role;
grant execute on function public.increment_daily_image_count(text, text, uuid) to service_role;
grant execute on function public.get_daily_gender_skips(text, text) to service_role;
grant execute on function public.increment_daily_gender_skips(text, text, uuid) to service_role;
grant execute on function public.get_daily_usage_counts(text, text) to service_role;
