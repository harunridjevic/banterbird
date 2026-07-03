-- Fix ops reset (Supabase requires WHERE on DELETE) + auto-block spammers + expiry on blocks

alter table public.moderation_blocks
  add column if not exists expires_at timestamptz;

drop function if exists public.check_rate_limit(uuid, text, int, int);

create or replace function public.is_moderation_blocked(
  p_user_id uuid default null,
  p_ip text default null,
  p_device_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderation_blocks b
    where b.active = true
      and (b.expires_at is null or b.expires_at > now())
      and (
        (b.block_type = 'user' and p_user_id is not null and b.block_value = p_user_id::text)
        or (b.block_type = 'ip' and p_ip is not null and b.block_value = p_ip)
        or (b.block_type = 'device' and p_device_id is not null and b.block_value = p_device_id)
      )
  );
$$;

create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_event_type text,
  p_max_per_minute int,
  p_max_burst int default null,
  p_block_minutes int default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  count_minute int;
  count_burst int;
  blocked boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  blocked := public.is_moderation_blocked(p_user_id, null, null);
  if blocked then
    return jsonb_build_object('allowed', false, 'reason', 'blocked');
  end if;

  select count(*)::int into count_minute
  from public.rate_limit_events
  where user_id = p_user_id
    and event_type = p_event_type
    and created_at > now() - interval '1 minute';

  if count_minute >= p_max_per_minute then
    if p_block_minutes > 0 then
      insert into public.moderation_blocks (block_type, block_value, reason, active, expires_at, created_by)
      values (
        'user',
        p_user_id::text,
        'Automatic block: rate limit exceeded (' || p_event_type || ')',
        true,
        now() + make_interval(mins => p_block_minutes),
        'rate_limit'
      )
      on conflict (block_type, block_value) do update
        set active = true,
            reason = excluded.reason,
            expires_at = excluded.expires_at,
            created_by = 'rate_limit';
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'rate_limit', 'count', count_minute, 'blocked', true);
  end if;

  if p_max_burst is not null then
    select count(*)::int into count_burst
    from public.rate_limit_events
    where user_id = p_user_id
      and event_type = p_event_type
      and created_at > now() - interval '10 seconds';

    if count_burst >= p_max_burst then
      if p_block_minutes > 0 then
        insert into public.moderation_blocks (block_type, block_value, reason, active, expires_at, created_by)
        values (
          'user',
          p_user_id::text,
          'Automatic block: message burst limit exceeded',
          true,
          now() + make_interval(mins => p_block_minutes),
          'rate_limit'
        )
        on conflict (block_type, block_value) do update
          set active = true,
              reason = excluded.reason,
              expires_at = excluded.expires_at,
              created_by = 'rate_limit';
      end if;
      return jsonb_build_object('allowed', false, 'reason', 'burst_limit', 'count', count_burst, 'blocked', true);
    end if;
  end if;

  insert into public.rate_limit_events (user_id, event_type) values (p_user_id, p_event_type);

  return jsonb_build_object('allowed', true);
end;
$$;

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
      'userReports', v_reports
    ),
    'resetAtUtc', timezone('utc', now())
  );
end;
$$;

grant execute on function public.check_rate_limit(uuid, text, int, int, int) to authenticated;
