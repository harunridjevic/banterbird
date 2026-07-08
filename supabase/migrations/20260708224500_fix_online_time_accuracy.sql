-- Fix inflated session time: fixed 30s per heartbeat + pending seconds in snapshot.

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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
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

  -- Client pings every 30s; always credit 30s (never inflate gaps after backgrounding).
  insert into public.user_daily_online_seconds (user_id, activity_date, seconds)
  values (v_uid, v_today, 30)
  on conflict (user_id, activity_date) do update
    set seconds = public.user_daily_online_seconds.seconds + 30;
end;
$$;

revoke all on function public.heartbeat_presence(boolean) from public;
grant execute on function public.heartbeat_presence(boolean) to authenticated;

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
