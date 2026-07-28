-- ============================================================
-- BanterBird — allow system messages (user_id = null) in messages table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Make user_id nullable so system messages can be inserted with user_id = null
alter table public.messages
  alter column user_id drop not null;

-- The existing select policy already works for system messages — it checks
-- room membership, not user_id. Room participants see all messages including
-- system ones.

-- The existing insert policy (auth.uid() = user_id) still blocks null inserts
-- from regular clients, which is correct. The system-message API route uses
-- the service role client which bypasses RLS entirely.

-- Also relax the content length constraint to allow system message prefixes
alter table public.messages
  drop constraint if exists messages_content_len;

alter table public.messages
  add constraint messages_content_len check (
    char_length(content) <= 2000
    and char_length(trim(content)) > 0
  );
