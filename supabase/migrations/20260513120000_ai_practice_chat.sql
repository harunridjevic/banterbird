-- AI practice rooms: optional bot match when no human is available.
-- Human is always user_a; user_b is null for AI sessions.

alter table public.rooms
  add column if not exists is_ai_room boolean not null default false,
  add column if not exists bot_gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_bot_gender_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_bot_gender_check check (
        bot_gender is null
        or bot_gender in ('male', 'female')
      );
  end if;
end
$$;

alter table public.rooms
  alter column user_b drop not null;

alter table public.rooms
  drop constraint if exists rooms_different_users;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_participants_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_participants_check check (
        (is_ai_room = true and user_b is null)
        or (
          coalesce(is_ai_room, false) = false
          and user_b is not null
          and user_a <> user_b
        )
      );
  end if;
end
$$;

alter table public.messages
  add column if not exists is_from_ai boolean not null default false;

alter table public.messages
  alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_sender_ai_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_sender_ai_check check (
        (is_from_ai = true and user_id is null)
        or (coalesce(is_from_ai, false) = false and user_id is not null)
      );
  end if;
end
$$;

drop policy if exists "messages_select_if_room_member" on public.messages;

create policy "messages_select_if_room_member"
  on public.messages
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where
        r.id = messages.room_id
        and (
          r.user_a = auth.uid()
          or r.user_b = auth.uid()
        )
    )
  );

drop policy if exists "messages_insert_if_room_member" on public.messages;

create policy "messages_insert_if_room_member"
  on public.messages
  for insert
  with check (
    coalesce(is_from_ai, false) = false
    and auth.uid() = user_id
    and exists (
      select 1
      from public.rooms r
      where
        r.id = room_id
        and r.ended_at is null
        and (
          r.user_a = auth.uid()
          or r.user_b = auth.uid()
        )
    )
  );

create or replace function public.insert_ai_chat_message(p_room_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := trim(p_content);
  inserted_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trimmed is null or char_length(trimmed) = 0 then
    raise exception 'Empty message';
  end if;

  if char_length(trimmed) > 2000 then
    raise exception 'Message too long';
  end if;

  if not exists (
    select 1
    from public.rooms r
    where
      r.id = p_room_id
      and r.is_ai_room = true
      and r.ended_at is null
      and r.user_a = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.messages (room_id, user_id, content, is_from_ai)
  values (p_room_id, null, trimmed, true);

  get diagnostics inserted_count = row_count;
  if inserted_count <> 1 then
    raise exception 'Insert failed';
  end if;
end;
$$;

grant execute on function public.insert_ai_chat_message(uuid, text) to authenticated;

create or replace function public.try_match_ai_practice(p_self_gender text, p_wants_gender text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
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

  select r.id
  into rid
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if rid is not null then
    return rid;
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

grant execute on function public.try_match_ai_practice(text, text) to authenticated;
