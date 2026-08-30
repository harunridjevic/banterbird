-- Fix initial match instant-skip bug:
-- Preserve freshly created AI practice rooms (created within 45s) across concurrent try_match
-- and try_match_ai_practice polling calls during navigation.

create or replace function public.try_match(
  p_self_gender text default 'male',
  p_wants_gender text default 'any',
  p_blocked_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  partner_id uuid;
  partner_gender text;
  partner_wants_gender text;
  new_room_id uuid;
  existing_id uuid;
  existing_peer_id uuid;
  existing_peer_gender text;
  existing_self_gender text;
  existing_is_ai boolean;
  existing_created_at timestamptz;
  my_gender text := lower(trim(p_self_gender));
  wanted_gender text := lower(trim(p_wants_gender));
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_moderation_blocked(me, null, null) then
    raise exception 'Account restricted';
  end if;

  if my_gender not in ('male', 'female') then
    raise exception 'Invalid self gender';
  end if;

  if wanted_gender not in ('male', 'female', 'any') then
    raise exception 'Invalid wanted gender';
  end if;

  -- 1. Check if user already has an active, unended room
  select
    r.id,
    case when r.user_a = me then r.user_b else r.user_a end,
    case when r.user_a = me then r.user_b_gender else r.user_a_gender end,
    case when r.user_a = me then r.user_a_gender else r.user_b_gender end,
    coalesce(r.is_ai_room, false),
    r.created_at
  into existing_id, existing_peer_id, existing_peer_gender, existing_self_gender, existing_is_ai, existing_created_at
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if existing_id is not null then
    -- Fresh AI room: return it (client is navigating or in chat). Older AI rooms (> 45s): end for rematch.
    if existing_is_ai then
      if existing_created_at > timezone('utc', now()) - interval '45 seconds' then
        return existing_id;
      end if;
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = existing_id
        and ended_at is null;
      existing_id := null;
    elsif existing_peer_id is null then
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = existing_id
        and ended_at is null;
      existing_id := null;
    elsif existing_peer_id = any(coalesce(p_blocked_user_ids, '{}')) then
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = existing_id
        and ended_at is null;
      existing_id := null;
    elsif
      existing_self_gender = my_gender
      and (wanted_gender = 'any' or existing_peer_gender = wanted_gender)
    then
      -- Valid existing human room matching requirements
      return existing_id;
    else
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = existing_id
        and ended_at is null;
      existing_id := null;
    end if;
  end if;

  -- 2. Remove any stale queue entry for current user
  delete from public.match_queue where user_id = me;

  -- 3. Search for a compatible waiting human in match_queue
  select mq.user_id, mq.self_gender, mq.wants_gender
  into partner_id, partner_gender, partner_wants_gender
  from public.match_queue mq
  where
    mq.user_id <> me
    and not (mq.user_id = any(coalesce(p_blocked_user_ids, '{}')))
    and (wanted_gender = 'any' or mq.self_gender = wanted_gender)
    and (mq.wants_gender = 'any' or mq.wants_gender = my_gender)
  order by mq.joined_at asc
  limit 1
  for update
  skip locked;

  if partner_id is not null then
    -- Found a human partner! Remove partner from match_queue
    delete from public.match_queue where user_id = partner_id;

    -- Ensure any unended room for partner is closed
    update public.rooms
    set ended_at = timezone('utc', now())
    where (user_a = partner_id or user_b = partner_id)
      and ended_at is null;

    -- Create fresh human room
    insert into public.rooms (
      user_a,
      user_b,
      user_a_gender,
      user_b_gender,
      is_ai_room
    )
    values (
      case when me::text < partner_id::text then me else partner_id end,
      case when me::text < partner_id::text then partner_id else me end,
      case when me::text < partner_id::text then my_gender else partner_gender end,
      case when me::text < partner_id::text then partner_gender else my_gender end,
      false
    )
    returning id into new_room_id;

    return new_room_id;
  end if;

  -- 4. No human found yet: put user in match_queue
  insert into public.match_queue (user_id, self_gender, wants_gender, joined_at)
  values (me, my_gender, wanted_gender, timezone('utc', now()))
  on conflict (user_id) do update
    set
      joined_at = excluded.joined_at,
      self_gender = excluded.self_gender,
      wants_gender = excluded.wants_gender;

  return null;
end;
$$;

revoke all on function public.try_match(text, text, uuid[]) from public;
grant execute on function public.try_match(text, text, uuid[]) to authenticated;

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
  existing_is_ai boolean;
  existing_created_at timestamptz;
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

  -- 1. Check if user already has an active, unended HUMAN room
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

  -- 2. If we already have a fresh AI room, keep it (client is navigating / chatting)
  select
    r.id,
    coalesce(r.is_ai_room, false),
    r.created_at
  into rid, existing_is_ai, existing_created_at
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
    and (coalesce(r.is_ai_room, false) = true or r.user_b is null)
  order by r.created_at desc
  limit 1;

  if rid is not null and existing_is_ai and existing_created_at > timezone('utc', now()) - interval '45 seconds' then
    return rid;
  end if;

  -- 3. Only end stale AI / incomplete rooms (> 45s)
  update public.rooms
  set ended_at = timezone('utc', now())
  where (user_a = me or user_b = me)
    and ended_at is null
    and (coalesce(is_ai_room, false) = true or user_b is null)
    and created_at <= timezone('utc', now()) - interval '45 seconds';

  -- 4. Try to match with any available human waiting in the queue
  human_rid := public.try_match(my_gender, wanted_gender, coalesce(p_blocked_user_ids, '{}'));
  if human_rid is not null then
    return human_rid;
  end if;

  -- 5. No human available: clean up queue
  delete from public.match_queue
  where user_id = me;

  -- 6. Select bot gender
  if wanted_gender = 'any' then
    bot_g := case when random() < 0.5 then 'male' else 'female' end;
  elsif wanted_gender = 'male' then
    bot_g := 'male';
  else
    bot_g := 'female';
  end if;

  -- 7. Create new AI room
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
