-- Fix session time double-counting: credit elapsed intervals only, flush on leave.

create or replace function public.flush_online_seconds(
  p_user_id uuid,
  p_prev_seen timestamptz,
  p_now timestamptz default timezone('utc', now())
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
  v_today date := (p_now at time zone 'utc')::date;
begin
  if p_user_id is null or p_prev_seen is null then
    return;
  end if;

  v_delta := least(
    30,
    greatest(0, floor(extract(epoch from (p_now - p_prev_seen)))::int)
  );
  if v_delta <= 0 then
    return;
  end if;

  insert into public.user_daily_online_seconds (user_id, activity_date, seconds)
  values (p_user_id, v_today, v_delta)
  on conflict (user_id, activity_date) do update
    set seconds = public.user_daily_online_seconds.seconds + excluded.seconds;
end;
$$;

revoke all on function public.flush_online_seconds(uuid, timestamptz, timestamptz) from public;
revoke all on function public.flush_online_seconds(uuid, timestamptz, timestamptz) from anon;
revoke all on function public.flush_online_seconds(uuid, timestamptz, timestamptz) from authenticated;

create or replace function public.heartbeat_presence(p_is_ops boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
  v_now timestamptz := timezone('utc', now());
  v_ops boolean := coalesce(p_is_ops, false);
  v_prev_seen timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_seen_at
  into v_prev_seen
  from public.user_heartbeats
  where user_id = v_uid;

  -- Credit the completed interval since the previous heartbeat (not the in-flight one).
  if not v_ops and v_prev_seen is not null then
    perform public.flush_online_seconds(v_uid, v_prev_seen, v_now);
  end if;

  insert into public.user_heartbeats (user_id, last_seen_at, is_ops)
  values (v_uid, v_now, v_ops)
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        is_ops = excluded.is_ops;

  if v_ops then
    return;
  end if;

  insert into public.user_daily_activity (user_id, activity_date)
  values (v_uid, v_today)
  on conflict do nothing;
end;
$$;

revoke all on function public.heartbeat_presence(boolean) from public;
grant execute on function public.heartbeat_presence(boolean) to authenticated;

create or replace function public.leave_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prev_seen timestamptz;
  v_ops boolean;
  v_now timestamptz := timezone('utc', now());
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_seen_at, coalesce(is_ops, false)
  into v_prev_seen, v_ops
  from public.user_heartbeats
  where user_id = v_uid;

  if found and not v_ops then
    perform public.flush_online_seconds(v_uid, v_prev_seen, v_now);
  end if;

  delete from public.user_heartbeats
  where user_id = v_uid;
end;
$$;

revoke all on function public.leave_presence() from public;
grant execute on function public.leave_presence() to authenticated;

create or replace function public.ops_user_session_minutes(
  p_since timestamptz,
  p_except uuid default null
)
returns table(avg_minutes numeric, total_minutes numeric)
language sql
volatile
security definer
set search_path = public
as $$
  with stored as (
    select
      user_id,
      (sum(seconds)::numeric / 60.0) as stored_min
    from public.user_daily_online_seconds
    where activity_date >= (p_since at time zone 'utc')::date
      and user_id is distinct from p_except
    group by user_id
  ),
  -- Uncommitted seconds in the current heartbeat interval (not yet flushed).
  pending as (
    select
      user_id,
      (
        least(
          30,
          greatest(0, extract(epoch from (timezone('utc', now()) - last_seen_at)))
        )::numeric / 60.0
      ) as pending_min
    from public.user_heartbeats
    where last_seen_at >= timezone('utc', now()) - interval '2 minutes'
      and coalesce(is_ops, false) = false
      and user_id is distinct from p_except
  ),
  combined as (
    select
      coalesce(s.user_id, p.user_id) as user_id,
      coalesce(s.stored_min, 0) + coalesce(p.pending_min, 0) as total_min
    from stored s
    full outer join pending p using (user_id)
  )
  select
    round(avg(total_min)::numeric, 2),
    round(coalesce(sum(total_min), 0)::numeric, 2)
  from combined;
$$;

revoke all on function public.ops_user_session_minutes(timestamptz, uuid) from public;
revoke all on function public.ops_user_session_minutes(timestamptz, uuid) from anon;
revoke all on function public.ops_user_session_minutes(timestamptz, uuid) from authenticated;
grant execute on function public.ops_user_session_minutes(timestamptz, uuid) to service_role;
