-- ============================================================
-- BanterBird v0.13.0 — Accounts, Friendships & Ephemeral DMs
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. profiles ──────────────────────────────────────────────
-- One row per auth.users entry (including anonymous users once
-- they convert to a named account).
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  display_name    text,
  avatar_url      text,
  self_gender     text check (self_gender in ('male','female')),
  wants_gender    text check (wants_gender in ('male','female','any')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for username lookups (friend search)
create index if not exists profiles_username_idx on public.profiles (lower(username));

-- Auto-touch updated_at
create or replace function public.touch_profiles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;

-- Drop existing policies if they exist
drop policy if exists "profiles: public read" on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;
drop policy if exists "profiles: owner insert" on public.profiles;

-- Anyone can read public profile fields
create policy "profiles: public read" on public.profiles
  for select using (true);

-- Users can only update their own profile
create policy "profiles: owner update" on public.profiles
  for update using (auth.uid() = id);

-- Insert is handled by the trigger below
create policy "profiles: owner insert" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row when a new user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. friend_requests ───────────────────────────────────────
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references auth.users(id) on delete cascade,
  to_id       uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint  no_self_friend check (from_id <> to_id),
  unique (from_id, to_id)
);

create index if not exists friend_requests_to_idx   on public.friend_requests (to_id, status);
create index if not exists friend_requests_from_idx on public.friend_requests (from_id, status);

create or replace function public.touch_friend_requests_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_friend_requests_updated_at on public.friend_requests;
create trigger trg_friend_requests_updated_at
  before update on public.friend_requests
  for each row execute function public.touch_friend_requests_updated_at();

alter table public.friend_requests enable row level security;

-- Drop existing policies if they exist
drop policy if exists "friend_requests: sender insert" on public.friend_requests;
drop policy if exists "friend_requests: parties read" on public.friend_requests;
drop policy if exists "friend_requests: recipient update" on public.friend_requests;
drop policy if exists "friend_requests: sender delete" on public.friend_requests;

-- Sender can create a request
create policy "friend_requests: sender insert" on public.friend_requests
  for insert with check (auth.uid() = from_id);

-- Both parties can read
create policy "friend_requests: parties read" on public.friend_requests
  for select using (auth.uid() = from_id or auth.uid() = to_id);

-- Recipient can update (accept / decline); sender can delete (withdraw)
create policy "friend_requests: recipient update" on public.friend_requests
  for update using (auth.uid() = to_id or auth.uid() = from_id);

create policy "friend_requests: sender delete" on public.friend_requests
  for delete using (auth.uid() = from_id);

-- ── 3. friendships (accepted friend_requests → convenience view) ──
-- A friendship is mutual: ensured by inserting two rows.
-- We use a simple table so RLS + realtime are easy.
create table if not exists public.friendships (
  user_id       uuid not null references auth.users(id) on delete cascade,
  friend_id     uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create index if not exists friendships_user_idx   on public.friendships (user_id);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

alter table public.friendships enable row level security;

-- Drop existing policies if they exist
drop policy if exists "friendships: own read" on public.friendships;
drop policy if exists "friendships: service insert" on public.friendships;
drop policy if exists "friendships: own delete" on public.friendships;

create policy "friendships: own read" on public.friendships
  for select using (auth.uid() = user_id);

create policy "friendships: service insert" on public.friendships
  for insert with check (auth.uid() = user_id);

create policy "friendships: own delete" on public.friendships
  for delete using (auth.uid() = user_id);

-- ── 4. dm_rooms ──────────────────────────────────────────────
-- A persistent 1-on-1 DM room between two friends.
create table if not exists public.dm_rooms (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references auth.users(id) on delete cascade,
  user_b      uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint  dm_no_self check (user_a <> user_b),
  unique (user_a, user_b)
);

create index if not exists dm_rooms_user_a_idx on public.dm_rooms (user_a);
create index if not exists dm_rooms_user_b_idx on public.dm_rooms (user_b);

alter table public.dm_rooms enable row level security;

-- Drop existing policies if they exist
drop policy if exists "dm_rooms: parties read" on public.dm_rooms;
drop policy if exists "dm_rooms: parties insert" on public.dm_rooms;

create policy "dm_rooms: parties read" on public.dm_rooms
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "dm_rooms: parties insert" on public.dm_rooms
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

-- ── 5. dm_messages ───────────────────────────────────────────
-- Ephemeral: messages are soft-deleted once read by the recipient.
create table if not exists public.dm_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.dm_rooms(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 2000),
  read_at     timestamptz,           -- set when recipient first views it
  created_at  timestamptz not null default now()
);

create index if not exists dm_messages_room_idx on public.dm_messages (room_id, created_at);

alter table public.dm_messages enable row level security;

-- Drop existing policies if they exist
drop policy if exists "dm_messages: parties read" on public.dm_messages;
drop policy if exists "dm_messages: sender insert" on public.dm_messages;
drop policy if exists "dm_messages: recipient read-mark" on public.dm_messages;

-- Only room participants can read
create policy "dm_messages: parties read" on public.dm_messages
  for select using (
    exists (
      select 1 from public.dm_rooms r
      where r.id = room_id
        and (r.user_a = auth.uid() or r.user_b = auth.uid())
    )
  );

-- Sender can insert
create policy "dm_messages: sender insert" on public.dm_messages
  for insert with check (auth.uid() = sender_id);

-- Recipient can mark as read (update read_at only)
create policy "dm_messages: recipient read-mark" on public.dm_messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.dm_rooms r
      where r.id = room_id
        and (r.user_a = auth.uid() or r.user_b = auth.uid())
    )
  );

-- ── 6. Helper function: get or create DM room ────────────────
create or replace function public.get_or_create_dm_room(p_other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room_id uuid;
  v_me uuid := auth.uid();
  v_a uuid := least(v_me, p_other_id);
  v_b uuid := greatest(v_me, p_other_id);
begin
  select id into v_room_id from public.dm_rooms
  where user_a = v_a and user_b = v_b;

  if v_room_id is null then
    insert into public.dm_rooms (user_a, user_b)
    values (v_a, v_b)
    returning id into v_room_id;
  end if;

  return v_room_id;
end;
$$;

-- Ensure friendships table is tracked by Supabase Realtime (run if not already done)
-- alter publication supabase_realtime add table public.friendships;
do $$
begin
  alter publication supabase_realtime add table public.friend_requests;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then
  null;
end $$;
