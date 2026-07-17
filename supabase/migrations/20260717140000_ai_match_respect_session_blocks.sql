-- try_match_ai_practice must honor session block list (same as try_match).

drop function if exists public.try_match_ai_practice(text, text);

create or replace function public.try_match_ai_practice(
  p_self_gender text,
  p_wants_gender text,
  p_blocked_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
  existing_peer_id uuid;
  human_rid uuid;
  my_gender text := lower(trim(p_self_gender));
  wanted_gender text := lower(trim(p_wants_gender));
  bot_g text;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if my_gender not in ('male', 'female') then
    raise exception 'Invalid self gender';
  end if;

  if wanted_gender not in ('male', 'female', 'any') then
    raise exception 'Invalid wanted gender';
  end if;

  select
    r.id,
    case when r.user_a = me then r.user_b else r.user_a end
  into rid, existing_peer_id
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
    and coalesce(r.is_ai_room, false) = false
    and r.user_b is not null
  order by r.created_at desc
  limit 1;

  if rid is not null then
    if existing_peer_id = any(coalesce(p_blocked_user_ids, '{}')) then
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = rid
        and ended_at is null;
      rid := null;
    else
      return rid;
    end if;
  end if;

  update public.rooms
  set ended_at = timezone('utc', now())
  where (user_a = me or user_b = me)
    and ended_at is null
    and (coalesce(is_ai_room, false) = true or user_b is null);

  human_rid := public.try_match(my_gender, wanted_gender, coalesce(p_blocked_user_ids, '{}'));
  if human_rid is not null then
    return human_rid;
  end if;

  delete from public.match_queue
  where user_id = me;

  if wanted_gender = 'any' then
    bot_g := case when random() < 0.5 then 'male' else 'female' end;
  elsif wanted_gender = 'male' then
    bot_g := 'male';
  else
    bot_g := 'female';
  end if;

  insert into public.rooms (
    user_a,
    user_b,
    user_a_gender,
    user_b_gender,
    is_ai_room,
    bot_gender
  )
  values (me, null, my_gender, bot_g, true, bot_g)
  returning id into rid;

  return rid;
end;
$$;

revoke all on function public.try_match_ai_practice(text, text, uuid[]) from public;
grant execute on function public.try_match_ai_practice(text, text, uuid[]) to authenticated;
