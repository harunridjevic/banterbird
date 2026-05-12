-- BanterBird: anonymous chat schema
-- Supabase Auth: enable Anonymous sign-ins in Dashboard
-- Safe to rerun multiple times

create extension if not exists "pgcrypto";

-- =========================================================
-- MATCH QUEUE
-- =========================================================

create table if not exists public.match_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.match_queue enable row level security;

drop policy if exists "match_queue_deny_all" on public.match_queue;

create policy "match_queue_deny_all"
  on public.match_queue
  for all
  using (false)
  with check (false);

-- =========================================================
-- ROOMS
-- =========================================================

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rooms_different_users check (user_a <> user_b)
);

create index if not exists rooms_user_a_active
  on public.rooms (user_a)
  where ended_at is null;

create index if not exists rooms_user_b_active
  on public.rooms (user_b)
  where ended_at is null;

alter table public.rooms enable row level security;

drop policy if exists "rooms_select_participant" on public.rooms;

create policy "rooms_select_participant"
  on public.rooms
  for select
  using (
    auth.uid() = user_a
    or auth.uid() = user_b
  );

-- =========================================================
-- MESSAGES
-- =========================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_content_len check (
    char_length(content) <= 2000
    and char_length(trim(content)) > 0
  )
);

create index if not exists messages_room_created
  on public.messages (room_id, created_at);

alter table public.messages enable row level security;

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
    auth.uid() = user_id
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

-- =========================================================
-- REALTIME
-- =========================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.rooms;
  exception
    when duplicate_object then null;
  end;
end
$$;

-- =========================================================
-- TRY MATCH FUNCTION
-- =========================================================

create or replace function public.try_match()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  partner_id uuid;
  new_room_id uuid;
  existing_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  -- Return existing active room if user already has one
  select r.id
  into existing_id
  from public.rooms r
  where
    (r.user_a = me or r.user_b = me)
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  -- Remove self from queue before matching
  delete from public.match_queue
  where user_id = me;

  -- Find waiting partner
  select mq.user_id
  into partner_id
  from public.match_queue mq
  where mq.user_id <> me
  order by mq.joined_at asc
  limit 1
  for update skip locked;

  if partner_id is not null then
    delete from public.match_queue
    where user_id = partner_id;

    insert into public.rooms (user_a, user_b)
    values (
      case
        when me::text < partner_id::text then me
        else partner_id
      end,
      case
        when me::text < partner_id::text then partner_id
        else me
      end
    )
    returning id into new_room_id;

    return new_room_id;
  end if;

  -- No partner found, join queue
  insert into public.match_queue (user_id)
  values (me)
  on conflict (user_id)
  do update set joined_at = now();

  return null;
end;
$$;

-- =========================================================
-- LEAVE MATCH QUEUE
-- =========================================================

create or replace function public.leave_match_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.match_queue
  where user_id = auth.uid();
end;
$$;

-- =========================================================
-- END ACTIVE ROOM
-- =========================================================

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

  update public.rooms r
  set ended_at = now()
  where
    r.id = p_room_id
    and r.ended_at is null
    and (
      r.user_a = auth.uid()
      or r.user_b = auth.uid()
    );
end;
$$;

-- =========================================================
-- GRANTS
-- =========================================================

grant usage on schema public to anon, authenticated;

grant execute on function public.try_match()
  to authenticated;

grant execute on function public.leave_match_queue()
  to authenticated;

grant execute on function public.end_active_room(uuid)
  to authenticated;

grant select on public.rooms
  to authenticated;

grant select, insert on public.messages
  to authenticated;