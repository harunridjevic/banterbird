-- v0.11: stop try_match from killing a fresh AI room (match flicker race).
-- Concurrent poll try_match used to SET ended_at on an AI room the client just opened.

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
    -- Fresh AI room: return it (client is navigating). Older AI rooms: end for rematch.
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
      return existing_id;
    else
      update public.rooms
      set ended_at = timezone('utc', now())
      where id = existing_id
        and ended_at is null;
      existing_id := null;
    end if;
  end if;

  delete from public.match_queue where user_id = me;

  select mq.user_id, mq.self_gender
  into partner_id, partner_gender
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
    delete from public.match_queue where user_id = partner_id;

    insert into public.rooms (user_a, user_b, user_a_gender, user_b_gender)
    values (
      case when me::text < partner_id::text then me else partner_id end,
      case when me::text < partner_id::text then partner_id else me end,
      case when me::text < partner_id::text then my_gender else partner_gender end,
      case when me::text < partner_id::text then partner_gender else my_gender end
    )
    returning id into new_room_id;

    return new_room_id;
  end if;

  insert into public.match_queue (user_id, self_gender, wants_gender)
  values (me, my_gender, wanted_gender)
  on conflict (user_id) do update
    set
      joined_at = now(),
      self_gender = excluded.self_gender,
      wants_gender = excluded.wants_gender;

  return null;
end;
$$;

revoke all on function public.try_match(text, text, uuid[]) from public;
grant execute on function public.try_match(text, text, uuid[]) to authenticated;
