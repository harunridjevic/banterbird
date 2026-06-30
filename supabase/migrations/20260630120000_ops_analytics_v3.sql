-- Ops analytics v3: daily visit tracking, token/cost logging, bounce rate, total time.

-- =========================================================
-- DAILY USER ACTIVITY (for recurring-user detection)
-- =========================================================

create table if not exists public.user_daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  primary key (user_id, activity_date)
);

create index if not exists user_daily_activity_date_idx
  on public.user_daily_activity (activity_date);

alter table public.user_daily_activity enable row level security;

drop policy if exists "user_daily_activity_deny_all" on public.user_daily_activity;

create policy "user_daily_activity_deny_all"
  on public.user_daily_activity
  for all
  using (false)
  with check (false);

-- =========================================================
-- API USAGE: token + cost columns
-- =========================================================

alter table public.api_usage_logs
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists estimated_cost_usd numeric(12, 6);

-- =========================================================
-- HEARTBEAT: also record daily visit
-- =========================================================

create or replace function public.heartbeat_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_heartbeats (user_id, last_seen_at)
  values (v_uid, now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at;

  insert into public.user_daily_activity (user_id, activity_date)
  values (v_uid, v_today)
  on conflict do nothing;
end;
$$;

-- =========================================================
-- EXPANDED ANALYTICS SNAPSHOT (v3)
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
  v_unique_users bigint;
  v_avg_user_minutes numeric;
  v_total_user_minutes numeric;
  v_human_rooms bigint;
  v_ai_rooms bigint;
  v_total_rooms bigint;
  v_avg_human_room_min numeric;
  v_avg_ai_room_min numeric;
  v_online_now bigint;
  v_recurring_users bigint;
  v_bounce_rate numeric;
  v_bounced_rooms bigint;
  v_ended_human_rooms bigint;
  v_api_total bigint;
  v_api_errors bigint;
  v_api_avg_latency numeric;
  v_api_by_provider jsonb;
  v_api_input_tokens bigint;
  v_api_output_tokens bigint;
  v_api_total_tokens bigint;
  v_api_cost_usd numeric;
  v_api_users bigint;
  v_api_avg_tokens_per_user numeric;
  v_unique_series jsonb;
  v_rooms_series jsonb;
  v_api_series jsonb;
begin
  -- Distinct active users in window (rooms, messages, or app visits)
  with active_users as (
    select distinct uid
    from (
      select user_a as uid from public.rooms where created_at >= v_since
      union
      select user_b from public.rooms where user_b is not null and created_at >= v_since
      union
      select user_id from public.messages where user_id is not null and created_at >= v_since
      union
      select user_id from public.user_daily_activity
      where activity_date >= (v_since at time zone 'utc')::date
    ) x
  )
  select count(*)::bigint into v_unique_users from active_users;

  -- Per-user room time + aggregate stats
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
  select
    round(avg(total_min)::numeric, 1),
    round(coalesce(sum(total_min), 0)::numeric, 1)
  into v_avg_user_minutes, v_total_user_minutes
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

  -- Online now (heartbeat within last 2 minutes) — UI may override with live presence
  select count(*)::bigint
  into v_online_now
  from public.user_heartbeats
  where last_seen_at >= timezone('utc', now()) - interval '2 minutes';

  -- Recurring users: active on 2+ distinct UTC days (visits, rooms, or messages)
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
      union all
      select user_id, activity_date as d
      from public.user_daily_activity
      where activity_date >= (v_since at time zone 'utc')::date
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

  -- Bounce rate: ended human rooms with no human messages or very short duration
  with hm as (
    select room_id, count(*)::bigint as c
    from public.messages
    where user_id is not null
    group by room_id
  ),
  ended_human as (
    select
      r.id,
      r.created_at,
      r.ended_at,
      coalesce(hm.c, 0::bigint) as human_msgs
    from public.rooms r
    left join hm on hm.room_id = r.id
    where r.created_at >= v_since
      and r.ended_at is not null
      and not coalesce(r.is_ai_room, false)
  )
  select
    count(*)::bigint,
    count(*) filter (
      where human_msgs = 0
        or extract(epoch from (ended_at - created_at)) < 30
    )::bigint
  into v_ended_human_rooms, v_bounced_rooms
  from ended_human;

  v_bounce_rate := case
    when coalesce(v_ended_human_rooms, 0) = 0 then null::numeric
    else round(v_bounced_rooms::numeric / v_ended_human_rooms::numeric, 4)
  end;

  -- API usage totals
  select
    count(*)::bigint,
    count(*) filter (where not success)::bigint,
    round(avg(latency_ms) filter (where latency_ms is not null)::numeric, 0),
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint,
    round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4),
    count(distinct user_id) filter (where user_id is not null)::bigint
  into
    v_api_total,
    v_api_errors,
    v_api_avg_latency,
    v_api_input_tokens,
    v_api_output_tokens,
    v_api_total_tokens,
    v_api_cost_usd,
    v_api_users
  from public.api_usage_logs
  where created_at >= v_since;

  v_api_avg_tokens_per_user := case
    when coalesce(v_api_users, 0) = 0 then null::numeric
    else round(v_api_total_tokens::numeric / v_api_users::numeric, 1)
  end;

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
      union all
      select user_id, activity_date as d
      from public.user_daily_activity
      where activity_date >= (v_since at time zone 'utc')::date
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
    'totalUserSessionMinutes', coalesce(v_total_user_minutes, 0),
    'humanChats', coalesce(v_human_rooms, 0),
    'botChats', coalesce(v_ai_rooms, 0),
    'totalRooms', coalesce(v_total_rooms, 0),
    'avgHumanRoomMinutes', v_avg_human_room_min,
    'avgBotRoomMinutes', v_avg_ai_room_min,
    'onlineUsersNow', coalesce(v_online_now, 0),
    'recurringUsers', coalesce(v_recurring_users, 0),
    'bounceRate', v_bounce_rate,
    'bouncedRooms', coalesce(v_bounced_rooms, 0),
    'endedHumanRooms', coalesce(v_ended_human_rooms, 0),
    'apiUsage', jsonb_build_object(
      'totalCalls', coalesce(v_api_total, 0),
      'errorCalls', coalesce(v_api_errors, 0),
      'successRate', case
        when coalesce(v_api_total, 0) = 0 then null
        else round((v_api_total - v_api_errors)::numeric / v_api_total::numeric, 4)
      end,
      'avgLatencyMs', v_api_avg_latency,
      'byProvider', coalesce(v_api_by_provider, '{}'::jsonb),
      'totalInputTokens', coalesce(v_api_input_tokens, 0),
      'totalOutputTokens', coalesce(v_api_output_tokens, 0),
      'totalTokens', coalesce(v_api_total_tokens, 0),
      'estimatedCostUsd', coalesce(v_api_cost_usd, 0),
      'usersWithApiCalls', coalesce(v_api_users, 0),
      'avgTokensPerUser', v_api_avg_tokens_per_user
    ),
    'series', jsonb_build_object(
      'uniqueUsersByDay', coalesce(v_unique_series, '[]'::jsonb),
      'roomsByDay', coalesce(v_rooms_series, '[]'::jsonb),
      'apiCallsByDay', coalesce(v_api_series, '[]'::jsonb)
    )
  );
end;
$$;

-- =========================================================
-- RESET: include daily activity
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
  v_daily bigint;
begin
  select count(*)::bigint into v_messages from public.messages;
  select count(*)::bigint into v_rooms from public.rooms;
  select count(*)::bigint into v_queue from public.match_queue;
  select count(*)::bigint into v_api from public.api_usage_logs;
  select count(*)::bigint into v_heartbeats from public.user_heartbeats;
  select count(*)::bigint into v_daily from public.user_daily_activity;

  delete from public.messages;
  delete from public.rooms;
  delete from public.match_queue;
  delete from public.api_usage_logs;
  delete from public.user_heartbeats;
  delete from public.user_daily_activity;

  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'messages', v_messages,
      'rooms', v_rooms,
      'matchQueue', v_queue,
      'apiUsageLogs', v_api,
      'heartbeats', v_heartbeats,
      'dailyActivity', v_daily
    ),
    'resetAtUtc', timezone('utc', now())
  );
end;
$$;
