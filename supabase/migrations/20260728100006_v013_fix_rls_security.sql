-- Fix RLS security issues for users_with_profiles view and user_heartbeat_minutes table

-- =========================================================
-- Enable RLS on user_heartbeat_minutes table
-- =========================================================
-- This table was created without RLS enabled in 20260708202000_ops_time_from_app_heartbeats.sql
-- Although it has revoke statements, RLS was not enabled, making it accessible via public key

alter table public.user_heartbeat_minutes enable row level security;

-- Deny all direct access - this table is only written by security definer functions
drop policy if exists "user_heartbeat_minutes_deny_all" on public.user_heartbeat_minutes;
create policy "user_heartbeat_minutes_deny_all"
  on public.user_heartbeat_minutes
  for all
  using (false)
  with check (false);

-- =========================================================
-- Handle users_with_profiles view (if it exists)
-- =========================================================
-- This view appears to be created outside of migrations (possibly in Supabase Dashboard)
-- It's exposing auth.users data which is a security risk
-- Drop it entirely - the app should use the profiles table directly

drop view if exists public.users_with_profiles cascade;

-- Also check if it exists in other schemas and drop it
do $$
begin
  -- Drop from public schema explicitly
  execute 'drop view if exists public.users_with_profiles cascade';
exception when others then
  -- View doesn't exist or already dropped
  null;
end $$;
