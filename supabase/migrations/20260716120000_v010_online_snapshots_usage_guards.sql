-- v0.10.0: concurrent online snapshots + blocked-user usage helper.

create table if not exists public.online_count_snapshots (
  recorded_at timestamptz primary key,
  online_count integer not null check (online_count >= 0)
);

create index if not exists online_count_snapshots_recorded_idx
  on public.online_count_snapshots (recorded_at desc);

revoke all on table public.online_count_snapshots from public;
revoke all on table public.online_count_snapshots from anon;
revoke all on table public.online_count_snapshots from authenticated;

-- Record at most one concurrent-online sample per UTC minute (called from heartbeats).
create or replace function public.snapshot_online_count()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('minute', timezone('utc', now()));
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.user_heartbeats
  where last_seen_at > timezone('utc', now()) - interval '2 minutes'
    and coalesce(is_ops, false) = false;

  insert into public.online_count_snapshots (recorded_at, online_count)
  values (v_bucket, coalesce(v_count, 0))
  on conflict (recorded_at) do update
    set online_count = greatest(public.online_count_snapshots.online_count, excluded.online_count);
end;
$$;

revoke all on function public.snapshot_online_count() from public;
revoke all on function public.snapshot_online_count() from anon;
revoke all on function public.snapshot_online_count() from authenticated;
grant execute on function public.snapshot_online_count() to authenticated;
grant execute on function public.snapshot_online_count() to service_role;

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

  perform public.snapshot_online_count();
end;
$$;

revoke all on function public.heartbeat_presence(boolean) from public;
grant execute on function public.heartbeat_presence(boolean) to authenticated;

-- Usage stats for a blocked user id (API calls, rooms, session minutes).
create or replace function public.ops_blocked_user_usage(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_calls bigint;
  v_rooms bigint;
  v_minutes numeric;
begin
  if p_user_id is null then
    return jsonb_build_object('apiCalls', 0, 'rooms', 0, 'sessionMinutes', 0);
  end if;

  select count(*)::bigint
  into v_calls
  from public.api_usage_logs
  where user_id = p_user_id
    and provider in ('groq', 'gemini', 'openai');

  select count(*)::bigint
  into v_rooms
  from public.room_analytics_log
  where user_a = p_user_id or user_b = p_user_id;

  select round(coalesce(sum(seconds), 0)::numeric / 60.0, 1)
  into v_minutes
  from public.user_daily_online_seconds
  where user_id = p_user_id;

  return jsonb_build_object(
    'apiCalls', coalesce(v_calls, 0),
    'rooms', coalesce(v_rooms, 0),
    'sessionMinutes', coalesce(v_minutes, 0)
  );
end;
$$;

revoke all on function public.ops_blocked_user_usage(uuid) from public;
revoke all on function public.ops_blocked_user_usage(uuid) from anon;
revoke all on function public.ops_blocked_user_usage(uuid) from authenticated;
grant execute on function public.ops_blocked_user_usage(uuid) to service_role;
