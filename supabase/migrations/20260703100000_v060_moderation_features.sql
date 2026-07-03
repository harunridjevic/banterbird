-- v0.6.0: moderation, reports, rate limiting, error logging, app settings

-- Server-side app settings (ops-tunable, affects all users)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('rate_limiting', jsonb_build_object(
    'enabled', true,
    'maxMessagesPerMinute', 20,
    'maxMessagesPer10Seconds', 5,
    'maxRematchesPerMinute', 8,
    'blockDurationMinutes', 15
  )),
  ('age_gate', jsonb_build_object(
    'enabled', true,
    'minimumAge', 18
  ))
on conflict (key) do nothing;

-- User reports with chat transcript
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  room_id uuid,
  reason text not null,
  transcript jsonb not null default '[]'::jsonb,
  reporter_ip text,
  reporter_device_id text,
  reported_ip text,
  reported_device_id text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists user_reports_status_created_idx
  on public.user_reports (status, created_at desc);

-- Moderation blocks (IP, device, or user)
create table if not exists public.moderation_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null check (block_type in ('ip', 'device', 'user')),
  block_value text not null,
  reason text,
  created_by text default 'ops',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (block_type, block_value)
);

create index if not exists moderation_blocks_active_idx
  on public.moderation_blocks (block_type, block_value) where active = true;

-- Error logs for production debugging
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null default 'error' check (level in ('error', 'warn', 'info')),
  message text not null,
  stack text,
  metadata jsonb default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_idx
  on public.error_logs (created_at desc);

-- Rate limit event tracking
create table if not exists public.rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('message', 'rematch')),
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_user_type_time_idx
  on public.rate_limit_events (user_id, event_type, created_at desc);

-- Check if a user/IP/device is blocked
create or replace function public.is_moderation_blocked(
  p_user_id uuid default null,
  p_ip text default null,
  p_device_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderation_blocks b
    where b.active = true
      and (
        (b.block_type = 'user' and p_user_id is not null and b.block_value = p_user_id::text)
        or (b.block_type = 'ip' and p_ip is not null and b.block_value = p_ip)
        or (b.block_type = 'device' and p_device_id is not null and b.block_value = p_device_id)
      )
  );
$$;

-- Record rate limit event and return whether user exceeded limits
create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_event_type text,
  p_max_per_minute int,
  p_max_burst int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  count_minute int;
  count_burst int;
  blocked boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  blocked := public.is_moderation_blocked(p_user_id, null, null);
  if blocked then
    return jsonb_build_object('allowed', false, 'reason', 'blocked');
  end if;

  select count(*)::int into count_minute
  from public.rate_limit_events
  where user_id = p_user_id
    and event_type = p_event_type
    and created_at > now() - interval '1 minute';

  if count_minute >= p_max_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit', 'count', count_minute);
  end if;

  if p_max_burst is not null then
    select count(*)::int into count_burst
    from public.rate_limit_events
    where user_id = p_user_id
      and event_type = p_event_type
      and created_at > now() - interval '10 seconds';

    if count_burst >= p_max_burst then
      return jsonb_build_object('allowed', false, 'reason', 'burst_limit', 'count', count_burst);
    end if;
  end if;

  insert into public.rate_limit_events (user_id, event_type) values (p_user_id, p_event_type);

  return jsonb_build_object('allowed', true);
end;
$$;

-- Submit a user report
create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_room_id uuid,
  p_reason text,
  p_transcript jsonb,
  p_reporter_device_id text default null,
  p_reported_device_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  report_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_user_id,
    room_id,
    reason,
    transcript,
    reporter_device_id,
    reported_device_id
  ) values (
    me,
    p_reported_user_id,
    p_room_id,
    left(trim(p_reason), 500),
    coalesce(p_transcript, '[]'::jsonb),
    p_reporter_device_id,
    p_reported_device_id
  )
  returning id into report_id;

  return report_id;
end;
$$;

-- try_match with session block list support
create or replace function public.try_match(
  p_self_gender text default 'male',
  p_wants_gender text default 'any',
  p_blocked_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  partner_id uuid;
  partner_gender text;
  new_room_id uuid;
  existing_id uuid;
  existing_peer_gender text;
  existing_self_gender text;
  my_gender text := lower(trim(p_self_gender));
  wanted_gender text := lower(trim(p_wants_gender));
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_moderation_blocked(me, null, null) then
    raise exception 'Account restricted';
  end if;

  if my_gender not in ('male', 'female') then
    raise exception 'Invalid self gender';
  end if;

  if wanted_gender not in ('male', 'female', 'any') then
    raise exception 'Invalid wanted gender';
  end if;

  select
    r.id,
    case when r.user_a = me then r.user_b_gender else r.user_a_gender end,
    case when r.user_a = me then r.user_a_gender else r.user_b_gender end
  into existing_id, existing_peer_gender, existing_self_gender
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if existing_id is not null then
    if
      existing_self_gender = my_gender
      and (wanted_gender = 'any' or existing_peer_gender = wanted_gender)
    then
      return existing_id;
    end if;

    delete from public.rooms
    where id = existing_id and ended_at is null;
  end if;

  delete from public.match_queue where user_id = me;

  select mq.user_id, mq.self_gender
  into partner_id, partner_gender
  from public.match_queue mq
  where
    mq.user_id <> me
    and not (mq.user_id = any(coalesce(p_blocked_user_ids, '{}')))
    and (wanted_gender = 'any' or mq.self_gender = wanted_gender)
    and (mq.wants_gender = 'any' or mq.wants_gender = my_gender)
  order by mq.joined_at asc
  limit 1
  for update
  skip locked;

  if partner_id is not null then
    delete from public.match_queue where user_id = partner_id;

    insert into public.rooms (user_a, user_b, user_a_gender, user_b_gender)
    values (
      case when me::text < partner_id::text then me else partner_id end,
      case when me::text < partner_id::text then partner_id else me end,
      case when me::text < partner_id::text then my_gender else partner_gender end,
      case when me::text < partner_id::text then partner_gender else my_gender end
    )
    returning id into new_room_id;

    return new_room_id;
  end if;

  insert into public.match_queue (user_id, self_gender, wants_gender)
  values (me, my_gender, wanted_gender)
  on conflict (user_id) do update
    set
      joined_at = now(),
      self_gender = excluded.self_gender,
      wants_gender = excluded.wants_gender;

  return null;
end;
$$;

-- Cleanup old rate limit events (run via cron or on check)
create or replace function public.cleanup_rate_limit_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_events where created_at < now() - interval '2 hours';
$$;

-- RLS: app_settings readable by authenticated, writable only via service role
alter table public.app_settings enable row level security;
create policy "app_settings_read" on public.app_settings for select to authenticated using (true);

alter table public.user_reports enable row level security;
create policy "users_insert_own_reports" on public.user_reports
  for insert to authenticated with check (reporter_id = auth.uid());

alter table public.error_logs enable row level security;

grant execute on function public.is_moderation_blocked(uuid, text, text) to authenticated;
grant execute on function public.check_rate_limit(uuid, text, int, int) to authenticated;
grant execute on function public.submit_user_report(uuid, uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.try_match(text, text, uuid[]) to authenticated;
