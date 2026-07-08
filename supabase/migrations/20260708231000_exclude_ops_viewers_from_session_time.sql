-- Exclude active ops viewers from session-time metrics entirely.

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
  with ops_active as (
    select user_id
    from public.user_heartbeats
    where last_seen_at >= timezone('utc', now()) - interval '2 minutes'
      and coalesce(is_ops, false) = true
      and user_id is distinct from p_except
  ),
  stored as (
    select
      user_id,
      (sum(seconds)::numeric / 60.0) as stored_min
    from public.user_daily_online_seconds
    where activity_date >= (p_since at time zone 'utc')::date
      and user_id is distinct from p_except
      and user_id not in (select user_id from ops_active)
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
      and user_id not in (select user_id from ops_active)
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
