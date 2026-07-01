-- End chats by deleting the room immediately (messages cascade).
-- Peers are notified via realtime DELETE on public.rooms.

create or replace function public.end_active_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.rooms r
  where
    r.id = p_room_id
    and (
      r.user_a = auth.uid()
      or r.user_b = auth.uid()
    );
end;
$$;

create or replace function public.end_user_active_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.rooms r
  where
    r.ended_at is null
    and (
      r.user_a = auth.uid()
      or r.user_b = auth.uid()
    );
end;
$$;

-- Safety net: purge any ended rows that slipped through (e.g. legacy data).
create or replace function public.cleanup_old_rooms()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rooms
  where ended_at is not null;
$$;

-- Close stale room when preferences change during rematch.
create or replace function public.try_match(p_self_gender text default 'male', p_wants_gender text default 'any')
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
  existing_peer_gender text;
  existing_self_gender text;
  my_gender text := lower(trim(p_self_gender));
  wanted_gender text := lower(trim(p_wants_gender));
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
    case when r.user_a = me then r.user_b_gender else r.user_a_gender end,
    case when r.user_a = me then r.user_a_gender else r.user_b_gender end
  into existing_id, existing_peer_gender, existing_self_gender
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if existing_id is not null then
    if
      existing_self_gender = my_gender
      and (wanted_gender = 'any' or existing_peer_gender = wanted_gender)
    then
      return existing_id;
    end if;

    delete from public.rooms
    where id = existing_id and ended_at is null;
  end if;

  delete from public.match_queue where user_id = me;

  select mq.user_id, mq.self_gender
  into partner_id, partner_gender
  from public.match_queue mq
  where
    mq.user_id <> me
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

grant execute on function public.end_active_room(uuid) to authenticated;
grant execute on function public.end_user_active_rooms() to authenticated;
grant execute on function public.try_match(text, text) to authenticated;
