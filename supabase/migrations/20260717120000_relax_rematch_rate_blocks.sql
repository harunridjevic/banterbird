-- Stop auto-blocking users for rematch/skip throttling.
-- Skipping chats should only slow rematches, not create moderation blocks.
-- API abuse is handled separately via llm_overusage auto-blocks.

drop function if exists public.check_rate_limit(uuid, text, int, int, int);

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
    return jsonb_build_object('allowed', false, 'reason', 'blocked', 'blocked', true);
  end if;

  select count(*)::int into count_minute
  from public.rate_limit_events
  where user_id = p_user_id
    and event_type = p_event_type
    and created_at > now() - interval '1 minute';

  if count_minute >= p_max_per_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'count', count_minute,
      'blocked', false
    );
  end if;

  if p_max_burst is not null then
    select count(*)::int into count_burst
    from public.rate_limit_events
    where user_id = p_user_id
      and event_type = p_event_type
      and created_at > now() - interval '10 seconds';

    if count_burst >= p_max_burst then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'burst_limit',
        'count', count_burst,
        'blocked', false
      );
    end if;
  end if;

  insert into public.rate_limit_events (user_id, event_type) values (p_user_id, p_event_type);

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, int, int, int) from public;
grant execute on function public.check_rate_limit(uuid, text, int, int, int) to authenticated;
