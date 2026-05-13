-- Internal analytics snapshot (callable only with service role from server).
-- Computes DAU, D1 (signup cohort), room/chat metrics, AI fallback rate.

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
  v_yesterday date := v_today - 1;
  v_dau_today bigint;
  v_dau_yesterday bigint;
  v_d1_signup numeric;
  v_avg_human_room_minutes numeric;
  v_skip_rate numeric;
  v_tt_first_human_median_sec numeric;
  v_avg_rooms_per_user numeric;
  v_convo_minutes_avg numeric;
  v_ai_fallback_rate numeric;
  v_total_rooms bigint;
  v_human_rooms bigint;
  v_ai_rooms bigint;
  v_human_ended bigint;
  v_skipped bigint;
  v_dau_series jsonb;
begin
  -- ---------- DAU (UTC): distinct users with room or human message activity that calendar day ----------
  with daily as (
    select distinct
      x.uid,
      x.d
    from (
      select user_a as uid, (created_at at time zone 'utc')::date as d
      from public.rooms
      where created_at >= v_since
      union all
      select user_b, (created_at at time zone 'utc')::date
      from public.rooms
      where user_b is not null
        and created_at >= v_since
      union all
      select user_id, (created_at at time zone 'utc')::date
      from public.messages
      where user_id is not null
        and created_at >= v_since
    ) x
  )
  select
    count(*) filter (where d = v_today),
    count(*) filter (where d = v_yesterday)
  into v_dau_today, v_dau_yesterday
  from daily;

  select coalesce(
    jsonb_agg(jsonb_build_object('date', d::text, 'dau', c) order by d),
    '[]'::jsonb
  )
  into v_dau_series
  from (
    select d, count(*)::bigint as c
    from (
      select distinct
        x.uid,
        x.d
      from (
        select user_a as uid, (created_at at time zone 'utc')::date as d
        from public.rooms
        where created_at >= v_since
        union all
        select user_b, (created_at at time zone 'utc')::date
        from public.rooms
        where user_b is not null
          and created_at >= v_since
        union all
        select user_id, (created_at at time zone 'utc')::date
        from public.messages
        where user_id is not null
          and created_at >= v_since
      ) x
    ) u
    group by d
  ) s;

  -- ---------- D1 retention (signup cohort): signed up day D, active any way on D+1 ----------
  with cohort as (
    select
      u.id,
      (u.created_at at time zone 'utc')::date as signup_d
    from auth.users u
    where u.created_at >= v_since
      and (u.created_at at time zone 'utc')::date <= v_today - 2
  ),
  next_day_active as (
    select c.id
    from cohort c
    where exists (
      select 1
      from (
        select user_id as uid, (created_at at time zone 'utc')::date as d
        from public.messages
        where user_id is not null
        union all
        select user_a, (created_at at time zone 'utc')::date
        from public.rooms
        union all
        select user_b, (created_at at time zone 'utc')::date
        from public.rooms
        where user_b is not null
      ) a
      where a.uid = c.id
        and a.d = c.signup_d + 1
    )
  )
  select
    case
      when (select count(*) from cohort) = 0 then null::numeric
      else round(
        (select count(*)::numeric from next_day_active)
        / nullif((select count(*)::numeric from cohort), 0),
        4
      )
    end
  into v_d1_signup;

  -- ---------- Room counts (created in window) ----------
  select
    count(*)::bigint,
    count(*) filter (where not coalesce(is_ai_room, false))::bigint,
    count(*) filter (where coalesce(is_ai_room, false))::bigint
  into v_total_rooms, v_human_rooms, v_ai_rooms
  from public.rooms
  where created_at >= v_since;

  v_ai_fallback_rate := case
    when coalesce(v_total_rooms, 0) = 0 then null::numeric
    else round(v_ai_rooms::numeric / v_total_rooms::numeric, 4)
  end;

  -- ---------- Avg human ended room lifetime (minutes) ----------
  select round(
    avg(extract(epoch from (ended_at - created_at)) / 60.0)::numeric,
    2
  )
  into v_avg_human_room_minutes
  from public.rooms r
  where r.created_at >= v_since
    and r.ended_at is not null
    and not coalesce(r.is_ai_room, false);

  -- ---------- Skip rate: ended human room, no human messages OR very short ----------
  with hm as (
    select room_id, count(*)::bigint as c
    from public.messages
    where user_id is not null
    group by room_id
  ),
  ended_human as (
    select r.id, r.created_at, r.ended_at, coalesce(hm.c, 0::bigint) as human_msgs
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
        or extract(epoch from (ended_at - created_at)) < 20
    )::bigint
  into v_human_ended, v_skipped
  from ended_human;

  v_skip_rate := case
    when coalesce(v_human_ended, 0) = 0 then null::numeric
    else round(v_skipped::numeric / v_human_ended::numeric, 4)
  end;

  -- ---------- Time to first human match (median seconds): signup -> first human room ----------
  with per_user_first as (
    select
      uid,
      min(first_at) as first_human_at
    from (
      select user_a as uid, min(created_at) as first_at
      from public.rooms
      where not coalesce(is_ai_room, false)
      group by user_a
      union all
      select user_b, min(created_at)
      from public.rooms
      where user_b is not null
        and not coalesce(is_ai_room, false)
      group by user_b
    ) z
    group by uid
  ),
  deltas as (
    select extract(epoch from (f.first_human_at - u.created_at))::numeric as sec
    from per_user_first f
    join auth.users u on u.id = f.uid
    where u.created_at >= v_since
      and f.first_human_at is not null
  )
  select round(percentile_cont(0.5) within group (order by sec)::numeric, 1)
  into v_tt_first_human_median_sec
  from deltas;

  -- ---------- Avg rooms per user (any room type) in window ----------
  with per_user as (
    select uid, count(distinct rid) as n
    from (
      select user_a as uid, id as rid
      from public.rooms
      where created_at >= v_since
      union all
      select user_b, id
      from public.rooms
      where user_b is not null
        and created_at >= v_since
    ) x
    group by uid
  )
  select round(avg(n)::numeric, 2)
  into v_avg_rooms_per_user
  from per_user;

  -- ---------- Avg conversation span (first human msg -> last msg) in human rooms, minutes ----------
  with bounds as (
    select
      m.room_id,
      min(m.created_at) as first_ts,
      max(m.created_at) as last_ts
    from public.messages m
    join public.rooms r on r.id = m.room_id
    where r.created_at >= v_since
      and not coalesce(r.is_ai_room, false)
    group by m.room_id
    having count(*) filter (where m.user_id is not null) > 0
  )
  select round(avg(extract(epoch from (last_ts - first_ts)) / 60.0)::numeric, 2)
  into v_convo_minutes_avg
  from bounds;

  return jsonb_build_object(
    'windowDays', v_days,
    'sinceUtc', v_since,
    'computedAtUtc', timezone('utc', now()),
    'dauTodayUtc', v_dau_today,
    'dauYesterdayUtc', v_dau_yesterday,
    'dauByDayUtc', coalesce(v_dau_series, '[]'::jsonb),
    'd1RetentionSignupCohort', v_d1_signup,
    'd1RetentionNote',
    'Share of users who signed up on or after since with signup date at least 2 UTC days ago, who had any activity on calendar day signup+1 (UTC).',
    'avgHumanEndedRoomMinutes', v_avg_human_room_minutes,
    'skipRateHumanEndedRooms', v_skip_rate,
    'skipRateNote',
    'Share of ended human-human rooms with no human messages or duration under 20s.',
    'timeToFirstHumanMatchMedianSeconds', v_tt_first_human_median_sec,
    'timeToFirstHumanMatchNote',
    'Among users who signed up in the window and have a human room: median seconds from auth.users.created_at to first human room created_at.',
    'avgRoomsPerUserInWindow', v_avg_rooms_per_user,
    'matchesPerSessionNote',
    'Average distinct rooms per user (user_a or user_b) with room created in the window.',
    'conversationDurationAvgMinutesHumanRooms', v_convo_minutes_avg,
    'conversationDurationNote',
    'Per human room (created in window): avg(last message - first message), all messages in room.',
    'aiFallbackRate', v_ai_fallback_rate,
    'aiFallbackNote',
    'Share of rooms created in the window where is_ai_room is true (practice bot when no human).',
    'totals', jsonb_build_object(
      'roomsCreated', v_total_rooms,
      'humanRooms', v_human_rooms,
      'aiRooms', v_ai_rooms,
      'humanEndedRooms', v_human_ended,
      'skippedLikeEndedRooms', v_skipped
    )
  );
end;
$$;

revoke all on function public.ops_analytics_snapshot(integer) from public;
revoke all on function public.ops_analytics_snapshot(integer) from anon;
revoke all on function public.ops_analytics_snapshot(integer) from authenticated;

grant execute on function public.ops_analytics_snapshot(integer) to service_role;
