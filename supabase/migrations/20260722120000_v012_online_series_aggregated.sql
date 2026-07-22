-- v0.12.0: aggregated online-count series RPCs so the JS client never has to
-- paginate raw snapshot rows (avoids the 1000-row default limit).

-- =========================================================
-- Per-day aggregation (used by 7-day, 30-day, year views)
-- =========================================================
create or replace function public.ops_online_users_by_day(
  p_since timestamptz,
  p_until timestamptz default null
)
returns table (
  day        date,
  peak       integer,
  avg_count  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (recorded_at at time zone 'utc')::date             as day,
    max(online_count)::integer                          as peak,
    round(avg(online_count)::numeric, 1)                as avg_count
  from public.online_count_snapshots
  where recorded_at >= p_since
    and recorded_at <= coalesce(p_until, now() + interval '5 minutes')
  group by 1
  order by 1;
$$;

revoke all on function public.ops_online_users_by_day(timestamptz, timestamptz) from public;
revoke all on function public.ops_online_users_by_day(timestamptz, timestamptz) from anon;
revoke all on function public.ops_online_users_by_day(timestamptz, timestamptz) from authenticated;
grant execute on function public.ops_online_users_by_day(timestamptz, timestamptz) to service_role;

-- =========================================================
-- Per-hour aggregation (used by the "Today" view)
-- =========================================================
create or replace function public.ops_online_users_by_hour(
  p_since timestamptz,
  p_until timestamptz default null
)
returns table (
  hour_bucket timestamptz,
  peak        integer,
  avg_count   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('hour', recorded_at at time zone 'utc') as hour_bucket,
    max(online_count)::integer                          as peak,
    round(avg(online_count)::numeric, 1)                as avg_count
  from public.online_count_snapshots
  where recorded_at >= p_since
    and recorded_at <= coalesce(p_until, now() + interval '5 minutes')
  group by 1
  order by 1;
$$;

revoke all on function public.ops_online_users_by_hour(timestamptz, timestamptz) from public;
revoke all on function public.ops_online_users_by_hour(timestamptz, timestamptz) from anon;
revoke all on function public.ops_online_users_by_hour(timestamptz, timestamptz) from authenticated;
grant execute on function public.ops_online_users_by_hour(timestamptz, timestamptz) to service_role;
