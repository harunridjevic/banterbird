-- Ops analytics v2: API usage logs, online heartbeats, expanded snapshot, test-data reset.

-- =========================================================
-- API USAGE LOGS
-- =========================================================

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  provider text,
  success boolean not null default true,
  latency_ms integer,
  room_id uuid references public.rooms (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists api_usage_logs_created_idx
  on public.api_usage_logs (created_at);

alter table public.api_usage_logs enable row level security;

drop policy if exists "api_usage_logs_deny_all" on public.api_usage_logs;

create policy "api_usage_logs_deny_all"
  on public.api_usage_logs
  for all
  using (false)
  with check (false);

-- =========================================================
-- ONLINE HEARTBEATS (server-side count for ops)
-- =========================================================

create table if not exists public.user_heartbeats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists user_heartbeats_last_seen_idx
  on public.user_heartbeats (last_seen_at);

alter table public.user_heartbeats enable row level security;

drop policy if exists "user_heartbeats_upsert_own" on public.user_heartbeats;

create policy "user_heartbeats_upsert_own"
  on public.user_heartbeats
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.heartbeat_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_heartbeats (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.heartbeat_presence() from public;
grant execute on function public.heartbeat_presence() to authenticated;

-- =========================================================
-- EXPANDED ANALYTICS SNAPSHOT
-- =========================================================

create or replace function public.ops_analytics_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := (timezone('utc', now()) - (v_days || ' days')::interval);
  v_today date := (timezone('utc', now()))::date;
  v_unique_users bigint;
  v_avg_user_minutes numeric;
  v_human_rooms bigint;
  v_ai_rooms bigint;
  v_total_rooms bigint;
  v_avg_human_room_min numeric;
  v_avg_ai_room_min numeric;
  v_online_now bigint;
  v_recurring_users bigint;
  v_api_total bigint;
  v_api_errors bigint;
  v_api_avg_latency numeric;
  v_api_by_provider jsonb;
  v_unique_series jsonb;
  v_rooms_series jsonb;
  v_api_series jsonb;
begin
  -- Distinct active users in window
  with active_users as (
    select distinct uid
    from (
      select user_a as uid from public.rooms where created_at >= v_since
      union
      select user_b from public.rooms where user_b is not null and created_at >= v_since
      union
      select user_id from public.messages where user_id is not null and created_at >= v_since
    ) x
  )
  select count(*)::bigint into v_unique_users from active_users;

  -- Avg total minutes per user (sum of room durations / distinct users)
  with user_room_time as (
    select
      uid,
      sum(
        extract(epoch from (coalesce(r.ended_at, timezone('utc', now())) - r.created_at)) / 60.0
      ) as total_min
    from (
      select user_a as uid, id, created_at, ended_at
      from public.rooms
      where created_at >= v_since
      union all
      select user_b, id, created_at, ended_at
      from public.rooms
      where user_b is not null and created_at >= v_since
    ) ur
    join public.rooms r on r.id = ur.id
    group by uid
  )
  select round(avg(total_min)::numeric, 1)
  into v_avg_user_minutes
  from user_room_time;

  -- Room counts
  select
    count(*)::bigint,
    count(*) filter (where not coalesce(is_ai_room, false))::bigint,
    count(*) filter (where coalesce(is_ai_room, false))::bigint
  into v_total_rooms, v_human_rooms, v_ai_rooms
  from public.rooms
  where created_at >= v_since;

  -- Avg room duration (human)
  select round(
    avg(extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_human_room_min
  from public.rooms
  where created_at >= v_since
    and not coalesce(is_ai_room, false);

  -- Avg room duration (bot)
  select round(
    avg(extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_ai_room_min
  from public.rooms
  where created_at >= v_since
    and coalesce(is_ai_room, false);

  -- Online now (heartbeat within last 2 minutes)
  select count(*)::bigint
  into v_online_now
  from public.user_heartbeats
  where last_seen_at >= timezone('utc', now()) - interval '2 minutes';

  -- Recurring users: active on 2+ distinct UTC days in window
  with daily_users as (
    select distinct uid, d
    from (
      select user_a as uid, (created_at at time zone 'utc')::date as d
      from public.rooms where created_at >= v_since
      union all
      select user_b, (created_at at time zone 'utc')::date
      from public.rooms where user_b is not null and created_at >= v_since
      union all
      select user_id, (created_at at time zone 'utc')::date
      from public.messages where user_id is not null and created_at >= v_since
    ) x
  ),
  user_day_counts as (
    select uid, count(distinct d) as days_active
    from daily_users
    group by uid
  )
  select count(*)::bigint
  into v_recurring_users
  from user_day_counts
  where days_active >= 2;

  -- API usage totals
  select
    count(*)::bigint,
    count(*) filter (where not success)::bigint,
    round(avg(latency_ms) filter (where latency_ms is not null)::numeric, 0)
  into v_api_total, v_api_errors, v_api_avg_latency
  from public.api_usage_logs
  where created_at >= v_since;

  select coalesce(
    jsonb_object_agg(provider, cnt),
    '{}'::jsonb
  )
  into v_api_by_provider
  from (
    select coalesce(provider, 'unknown') as provider, count(*)::bigint as cnt
    from public.api_usage_logs
    where created_at >= v_since
    group by coalesce(provider, 'unknown')
  ) p;

  -- Unique users by day series
  select coalesce(
    jsonb_agg(jsonb_build_object('date', d::text, 'value', c) order by d),
    '[]'::jsonb
  )
  into v_unique_series
  from (
    select d, count(distinct uid)::bigint as c
    from (
      select user_a as uid, (created_at at time zone 'utc')::date as d
      from public.rooms where created_at >= v_since
      union all
      select user_b, (created_at at time zone 'utc')::date
      from public.rooms where user_b is not null and created_at >= v_since
      union all
      select user_id, (created_at at time zone 'utc')::date
      from public.messages where user_id is not null and created_at >= v_since
    ) x
    group by d
  ) s;

  -- Rooms by day (human vs bot)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d::text,
        'human', human_cnt,
        'bot', bot_cnt,
        'total', human_cnt + bot_cnt
      ) order by d
    ),
    '[]'::jsonb
  )
  into v_rooms_series
  from (
    select
      (created_at at time zone 'utc')::date as d,
      count(*) filter (where not coalesce(is_ai_room, false))::bigint as human_cnt,
      count(*) filter (where coalesce(is_ai_room, false))::bigint as bot_cnt
    from public.rooms
    where created_at >= v_since
    group by (created_at at time zone 'utc')::date
  ) r;

  -- API calls by day
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d::text,
        'calls', total_cnt,
        'errors', err_cnt
      ) order by d
    ),
    '[]'::jsonb
  )
  into v_api_series
  from (
    select
      (created_at at time zone 'utc')::date as d,
      count(*)::bigint as total_cnt,
      count(*) filter (where not success)::bigint as err_cnt
    from public.api_usage_logs
    where created_at >= v_since
    group by (created_at at time zone 'utc')::date
  ) a;

  return jsonb_build_object(
    'windowDays', v_days,
    'sinceUtc', v_since,
    'computedAtUtc', timezone('utc', now()),
    'uniqueUsers', coalesce(v_unique_users, 0),
    'avgUserSessionMinutes', v_avg_user_minutes,
    'humanChats', coalesce(v_human_rooms, 0),
    'botChats', coalesce(v_ai_rooms, 0),
    'totalRooms', coalesce(v_total_rooms, 0),
    'avgHumanRoomMinutes', v_avg_human_room_min,
    'avgBotRoomMinutes', v_avg_ai_room_min,
    'onlineUsersNow', coalesce(v_online_now, 0),
    'recurringUsers', coalesce(v_recurring_users, 0),
    'apiUsage', jsonb_build_object(
      'totalCalls', coalesce(v_api_total, 0),
      'errorCalls', coalesce(v_api_errors, 0),
      'successRate', case
        when coalesce(v_api_total, 0) = 0 then null
        else round((v_api_total - v_api_errors)::numeric / v_api_total::numeric, 4)
      end,
      'avgLatencyMs', v_api_avg_latency,
      'byProvider', coalesce(v_api_by_provider, '{}'::jsonb)
    ),
    'series', jsonb_build_object(
      'uniqueUsersByDay', coalesce(v_unique_series, '[]'::jsonb),
      'roomsByDay', coalesce(v_rooms_series, '[]'::jsonb),
      'apiCallsByDay', coalesce(v_api_series, '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.ops_analytics_snapshot(integer) from public;
revoke all on function public.ops_analytics_snapshot(integer) from anon;
revoke all on function public.ops_analytics_snapshot(integer) from authenticated;
grant execute on function public.ops_analytics_snapshot(integer) to service_role;

-- =========================================================
-- RESET TEST DATA (service role only)
-- =========================================================

create or replace function public.ops_reset_test_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_messages bigint;
  v_rooms bigint;
  v_queue bigint;
  v_api bigint;
  v_heartbeats bigint;
begin
  select count(*)::bigint into v_messages from public.messages;
  select count(*)::bigint into v_rooms from public.rooms;
  select count(*)::bigint into v_queue from public.match_queue;
  select count(*)::bigint into v_api from public.api_usage_logs;
  select count(*)::bigint into v_heartbeats from public.user_heartbeats;

  delete from public.messages;
  delete from public.rooms;
  delete from public.match_queue;
  delete from public.api_usage_logs;
  delete from public.user_heartbeats;

  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'messages', v_messages,
      'rooms', v_rooms,
      'matchQueue', v_queue,
      'apiUsageLogs', v_api,
      'heartbeats', v_heartbeats
    ),
    'resetAtUtc', timezone('utc', now())
  );
end;
$$;

revoke all on function public.ops_reset_test_data() from public;
revoke all on function public.ops_reset_test_data() from anon;
revoke all on function public.ops_reset_test_data() from authenticated;
grant execute on function public.ops_reset_test_data() to service_role;
