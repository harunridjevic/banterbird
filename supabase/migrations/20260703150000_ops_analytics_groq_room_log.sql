-- Persist room metrics across instant-delete cleanup, add Groq to API analytics, fix test reset.

-- =========================================================
-- ROOM ANALYTICS LOG (survives room row deletion)
-- =========================================================

create table if not exists public.room_analytics_log (
  room_id uuid primary key,
  user_a uuid,
  user_b uuid,
  is_ai_room boolean not null default false,
  created_at timestamptz not null,
  ended_at timestamptz,
  human_message_count bigint not null default 0
);

create index if not exists room_analytics_log_created_idx
  on public.room_analytics_log (created_at);

alter table public.room_analytics_log enable row level security;

drop policy if exists "room_analytics_log_deny_all" on public.room_analytics_log;

create policy "room_analytics_log_deny_all"
  on public.room_analytics_log
  for all
  using (false)
  with check (false);

create or replace function public.room_analytics_log_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.room_analytics_log (room_id, user_a, user_b, is_ai_room, created_at)
  values (NEW.id, NEW.user_a, NEW.user_b, coalesce(NEW.is_ai_room, false), NEW.created_at)
  on conflict (room_id) do nothing;
  return NEW;
end;
$$;

create or replace function public.room_analytics_log_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_human_msgs bigint;
begin
  select count(*)::bigint into v_human_msgs
  from public.messages
  where room_id = OLD.id
    and coalesce(is_from_ai, false) = false
    and user_id is not null;

  update public.room_analytics_log
  set
    ended_at = timezone('utc', now()),
    human_message_count = v_human_msgs
  where room_id = OLD.id;

  if not found then
    insert into public.room_analytics_log (
      room_id, user_a, user_b, is_ai_room, created_at, ended_at, human_message_count
    )
    values (
      OLD.id,
      OLD.user_a,
      OLD.user_b,
      coalesce(OLD.is_ai_room, false),
      OLD.created_at,
      timezone('utc', now()),
      v_human_msgs
    );
  end if;

  return OLD;
end;
$$;

drop trigger if exists room_analytics_log_insert on public.rooms;
create trigger room_analytics_log_insert
  after insert on public.rooms
  for each row
  execute function public.room_analytics_log_on_insert();

drop trigger if exists room_analytics_log_delete on public.rooms;
create trigger room_analytics_log_delete
  before delete on public.rooms
  for each row
  execute function public.room_analytics_log_on_delete();

insert into public.room_analytics_log (room_id, user_a, user_b, is_ai_room, created_at, ended_at)
select id, user_a, user_b, coalesce(is_ai_room, false), created_at, ended_at
from public.rooms
on conflict (room_id) do nothing;

-- =========================================================
-- ANALYTICS SNAPSHOT: room log + Groq provider support
-- =========================================================

create or replace function public.ops_analytics_snapshot(
  p_days integer default 30,
  p_calendar_today boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := case
    when coalesce(p_calendar_today, false) then
      date_trunc('day', timezone('utc', now()))
    else
      timezone('utc', now()) - (v_days || ' days')::interval
  end;
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
  v_api_cost_series jsonb;
begin
  with active_users as (
    select distinct uid
    from (
      select user_a as uid from public.room_analytics_log where created_at >= v_since
      union
      select user_b from public.room_analytics_log where user_b is not null and created_at >= v_since
      union
      select user_id from public.messages where user_id is not null and created_at >= v_since
      union
      select user_id from public.user_daily_activity
      where activity_date >= (v_since at time zone 'utc')::date
    ) x
  )
  select count(*)::bigint into v_unique_users from active_users;

  with user_room_time as (
    select uid, sum(duration_min) as total_min
    from (
      select
        user_a as uid,
        extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0 as duration_min
      from public.room_analytics_log
      where created_at >= v_since
      union all
      select
        user_b,
        extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0
      from public.room_analytics_log
      where user_b is not null and created_at >= v_since
    ) ur
    group by uid
  )
  select
    round(avg(total_min)::numeric, 1),
    round(coalesce(sum(total_min), 0)::numeric, 1)
  into v_avg_user_minutes, v_total_user_minutes
  from user_room_time;

  select
    count(*)::bigint,
    count(*) filter (where not coalesce(is_ai_room, false))::bigint,
    count(*) filter (where coalesce(is_ai_room, false))::bigint
  into v_total_rooms, v_human_rooms, v_ai_rooms
  from public.room_analytics_log
  where created_at >= v_since;

  select round(
    avg(extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_human_room_min
  from public.room_analytics_log
  where created_at >= v_since
    and not coalesce(is_ai_room, false);

  select round(
    avg(extract(epoch from (coalesce(ended_at, timezone('utc', now())) - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_ai_room_min
  from public.room_analytics_log
  where created_at >= v_since
    and coalesce(is_ai_room, false);

  select count(*)::bigint
  into v_online_now
  from public.user_heartbeats
  where last_seen_at >= timezone('utc', now()) - interval '2 minutes';

  with daily_users as (
    select distinct uid, d
    from (
      select user_a as uid, (created_at at time zone 'utc')::date as d
      from public.room_analytics_log where created_at >= v_since
      union all
      select user_b, (created_at at time zone 'utc')::date
      from public.room_analytics_log where user_b is not null and created_at >= v_since
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

  select
    count(*)::bigint,
    count(*) filter (
      where human_message_count = 0
        or extract(epoch from (ended_at - created_at)) < 30
    )::bigint
  into v_ended_human_rooms, v_bounced_rooms
  from public.room_analytics_log
  where created_at >= v_since
    and ended_at is not null
    and not coalesce(is_ai_room, false);

  v_bounce_rate := case
    when coalesce(v_ended_human_rooms, 0) = 0 then null::numeric
    else round(v_bounced_rooms::numeric / v_ended_human_rooms::numeric, 4)
  end;

  select
    count(*)::bigint,
    count(*) filter (
      where not success and provider in ('groq', 'gemini', 'openai')
    )::bigint,
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

  select coalesce(
    jsonb_agg(jsonb_build_object('date', d::text, 'value', c) order by d),
    '[]'::jsonb
  )
  into v_unique_series
  from (
    select d, count(distinct uid)::bigint as c
    from (
      select user_a as uid, (created_at at time zone 'utc')::date as d
      from public.room_analytics_log where created_at >= v_since
      union all
      select user_b, (created_at at time zone 'utc')::date
      from public.room_analytics_log where user_b is not null and created_at >= v_since
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
    from public.room_analytics_log
    where created_at >= v_since
    group by (created_at at time zone 'utc')::date
  ) r;

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
      count(*) filter (
        where not success and provider in ('groq', 'gemini', 'openai')
      )::bigint as err_cnt
    from public.api_usage_logs
    where created_at >= v_since
    group by (created_at at time zone 'utc')::date
  ) a;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d::text,
        'costUsd', cost_usd,
        'tokens', token_cnt
      ) order by d
    ),
    '[]'::jsonb
  )
  into v_api_cost_series
  from (
    select
      (created_at at time zone 'utc')::date as d,
      round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4) as cost_usd,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::bigint as token_cnt
    from public.api_usage_logs
    where created_at >= v_since
      and provider in ('groq', 'gemini', 'openai')
    group by (created_at at time zone 'utc')::date
  ) c;

  return jsonb_build_object(
    'windowDays', v_days,
    'calendarToday', coalesce(p_calendar_today, false),
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
      'apiCallsByDay', coalesce(v_api_series, '[]'::jsonb),
      'apiCostByDay', coalesce(v_api_cost_series, '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.ops_analytics_snapshot(integer, boolean) from public;
revoke all on function public.ops_analytics_snapshot(integer, boolean) from anon;
revoke all on function public.ops_analytics_snapshot(integer, boolean) from authenticated;
grant execute on function public.ops_analytics_snapshot(integer, boolean) to service_role;

-- =========================================================
-- TEST DATA RESET (Supabase requires WHERE on DELETE)
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
  v_rate bigint;
  v_errors bigint;
  v_reports bigint;
  v_room_log bigint;
begin
  select count(*)::bigint into v_messages from public.messages;
  select count(*)::bigint into v_rooms from public.rooms;
  select count(*)::bigint into v_queue from public.match_queue;
  select count(*)::bigint into v_api from public.api_usage_logs;
  select count(*)::bigint into v_heartbeats from public.user_heartbeats;
  select count(*)::bigint into v_daily from public.user_daily_activity;
  select count(*)::bigint into v_rate from public.rate_limit_events;
  select count(*)::bigint into v_errors from public.error_logs;
  select count(*)::bigint into v_reports from public.user_reports;
  select count(*)::bigint into v_room_log from public.room_analytics_log;

  delete from public.messages where true;
  delete from public.rooms where true;
  delete from public.match_queue where true;
  delete from public.api_usage_logs where true;
  delete from public.user_heartbeats where true;
  delete from public.user_daily_activity where true;
  delete from public.rate_limit_events where true;
  delete from public.error_logs where true;
  delete from public.user_reports where true;
  delete from public.moderation_blocks where true;
  delete from public.room_analytics_log where true;

  return jsonb_build_object(
    'deleted', jsonb_build_object(
      'messages', v_messages,
      'rooms', v_rooms,
      'matchQueue', v_queue,
      'apiUsageLogs', v_api,
      'heartbeats', v_heartbeats,
      'dailyActivity', v_daily,
      'rateLimitEvents', v_rate,
      'errorLogs', v_errors,
      'userReports', v_reports,
      'roomAnalyticsLog', v_room_log
    ),
    'resetAtUtc', timezone('utc', now())
  );
end;
$$;

revoke all on function public.ops_reset_test_data() from public;
revoke all on function public.ops_reset_test_data() from anon;
revoke all on function public.ops_reset_test_data() from authenticated;
grant execute on function public.ops_reset_test_data() to service_role;
