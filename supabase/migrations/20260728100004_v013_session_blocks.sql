-- ============================================================
-- BanterBird — session_blocks table
-- Stores skip blocks so try_match can exclude them for BOTH parties.
-- Unlike sessionStorage (client-only), these are visible server-side.
-- Blocks expire after 24 hours automatically.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.session_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  primary key (blocker_id, blocked_id)
);

create index if not exists session_blocks_blocker_idx on public.session_blocks (blocker_id, expires_at);
create index if not exists session_blocks_blocked_idx on public.session_blocks (blocked_id, expires_at);

alter table public.session_blocks enable row level security;

-- Users can manage their own blocks
create policy "session_blocks: own insert" on public.session_blocks
  for insert with check (auth.uid() = blocker_id);

create policy "session_blocks: own delete" on public.session_blocks
  for delete using (auth.uid() = blocker_id);

-- Service role can read all (for try_match)
create policy "session_blocks: own read" on public.session_blocks
  for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);

-- Cleanup old blocks (run periodically or via cron)
create or replace function public.cleanup_expired_session_blocks()
returns void language sql security definer as $$
  delete from public.session_blocks where expires_at < now();
$$;
