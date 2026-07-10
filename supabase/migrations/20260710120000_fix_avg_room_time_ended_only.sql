-- Fix avg room time: only count ended rooms (open rooms were inflating averages via now()).

-- Patch only the time-metrics section of the latest snapshot function.
create or replace function public.ops_analytics_snapshot(
  p_days integer default 30,
  p_calendar_today boolean default false,
  p_current_user_id uuid default null
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
  v_user_bounce_rate numeric;
  v_first_chat_users bigint;
  v_first_chat_ended_users bigint;
  v_first_chat_bounced_users bigint;
  v_first_chat_retained_users bigint;
  v_room_bounce_rate numeric;
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
    where uid is distinct from p_current_user_id
  )
  select count(*)::bigint into v_unique_users from active_users;

  -- App-wide time from accumulated online seconds (fractional minutes).
  with per_user_time as (
    select
      user_id,
      (sum(seconds)::numeric / 60.0) as total_min
    from public.user_daily_online_seconds
    where activity_date >= (v_since at time zone 'utc')::date
      and user_id is distinct from p_current_user_id
    group by user_id
  )
  select
    round(avg(total_min)::numeric, 2),
    round(coalesce(sum(total_min), 0)::numeric, 2)
  into v_avg_user_minutes, v_total_user_minutes
  from per_user_time;

  select
    count(*)::bigint,
    count(*) filter (where not coalesce(is_ai_room, false))::bigint,
    count(*) filter (where coalesce(is_ai_room, false))::bigint
  into v_total_rooms, v_human_rooms, v_ai_rooms
  from public.room_analytics_log
  where created_at >= v_since
    and user_a is distinct from p_current_user_id
    and (user_b is null or user_b is distinct from p_current_user_id);

  -- Only ended rooms — open rooms must not skew averages upward.
  select round(
    avg(extract(epoch from (ended_at - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_human_room_min
  from public.room_analytics_log
  where created_at >= v_since
    and ended_at is not null
    and not coalesce(is_ai_room, false)
    and user_a is distinct from p_current_user_id
    and (user_b is null or user_b is distinct from p_current_user_id);

  select round(
    avg(extract(epoch from (ended_at - created_at)) / 60.0)::numeric,
    1
  )
  into v_avg_ai_room_min
  from public.room_analytics_log
  where created_at >= v_since
    and ended_at is not null
    and coalesce(is_ai_room, false)
    and user_a is distinct from p_current_user_id;

  select count(*)::bigint
  into v_online_now
  from public.user_heartbeats
  where last_seen_at >= timezone('utc', now()) - interval '2 minutes'
    and coalesce(is_ops, false) = false
    and user_id is distinct from p_current_user_id;

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
    where uid is distinct from p_current_user_id
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
    and not coalesce(is_ai_room, false)
    and user_a is distinct from p_current_user_id
    and (user_b is null or user_b is distinct from p_current_user_id);

  v_room_bounce_rate := case
    when coalesce(v_ended_human_rooms, 0) = 0 then null::numeric
    else round(v_bounced_rooms::numeric / v_ended_human_rooms::numeric, 4)
  end;

  with user_room_events as (
    select user_a as uid, created_at, ended_at, room_id
    from public.room_analytics_log
    where user_a is distinct from p_current_user_id
    union all
    select user_b, created_at, ended_at, room_id
    from public.room_analytics_log
    where user_b is not null and user_b is distinct from p_current_user_id
  ),
  first_room as (
    select distinct on (uid)
      uid,
      created_at as first_at,
      room_id as first_room_id
    from user_room_events
    order by uid, created_at asc, room_id asc
  ),
  cohort as (
    select fr.uid, fr.first_at, fr.first_room_id
    from first_room fr
    where fr.first_at >= v_since
  ),
  ended_first as (
    select c.uid, c.first_at, c.first_room_id
    from cohort c
    inner join user_room_events e
      on e.uid = c.uid and e.room_id = c.first_room_id
    where e.ended_at is not null
  ),
  classified as (
    select
      ef.uid,
      exists (
        select 1
        from user_room_events e
        where e.uid = ef.uid
          and e.room_id <> ef.first_room_id
      ) as has_later_room
    from ended_first ef
  )
  select
    (select count(*)::bigint from cohort),
    (select count(*)::bigint from ended_first),
    coalesce((select count(*)::bigint from classified where not has_later_room), 0),
    coalesce((select count(*)::bigint from classified where has_later_room), 0)
  into
    v_first_chat_users,
    v_first_chat_ended_users,
    v_first_chat_bounced_users,
    v_first_chat_retained_users;

  v_user_bounce_rate := case
    when coalesce(v_first_chat_ended_users, 0) = 0 then null::numeric
    else round(v_first_chat_bounced_users::numeric / v_first_chat_ended_users::numeric, 4)
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
    count(distinct user_id) filter (where user_id is not null and user_id is distinct from p_current_user_id)::bigint
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
  where created_at >= v_since
    and (user_id is null or user_id is distinct from p_current_user_id);

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
    where uid is distinct from p_current_user_id
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
      and user_a is distinct from p_current_user_id
      and (user_b is null or user_b is distinct from p_current_user_id)
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
    'bounceRate', v_user_bounce_rate,
    'bouncedUsers', coalesce(v_first_chat_bounced_users, 0),
    'firstChatUsers', coalesce(v_first_chat_users, 0),
    'firstChatEndedUsers', coalesce(v_first_chat_ended_users, 0),
    'firstChatRetainedUsers', coalesce(v_first_chat_retained_users, 0),
    'roomBounceRate', v_room_bounce_rate,
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

revoke all on function public.ops_analytics_snapshot(integer, boolean, uuid) from public;
revoke all on function public.ops_analytics_snapshot(integer, boolean, uuid) from anon;
revoke all on function public.ops_analytics_snapshot(integer, boolean, uuid) from authenticated;
grant execute on function public.ops_analytics_snapshot(integer, boolean, uuid) to service_role;
