-- Fix Supabase RPC ambiguity: ensure only one heartbeat_presence signature exists.
-- We keep the boolean-arg version (used to tag ops vs non-ops) and drop the legacy no-arg version.

drop function if exists public.heartbeat_presence();

-- Ensure expected grants exist for the boolean signature.
revoke all on function public.heartbeat_presence(boolean) from public;
grant execute on function public.heartbeat_presence(boolean) to authenticated;

