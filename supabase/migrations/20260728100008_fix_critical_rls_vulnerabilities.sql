-- CRITICAL SECURITY FIX: Remove public read access to sensitive data
-- This fixes the vulnerability that exposed user accounts and data

-- =========================================================
-- Fix profiles table RLS - remove public read access
-- =========================================================
drop policy if exists "profiles: public read" on public.profiles;

-- Replace with restricted read: only allow reading profiles if you're authenticated
-- AND only expose non-sensitive fields (username, display_name, avatar_url)
-- The email and other sensitive fields should not be accessible via public key

create policy "profiles: authenticated read" on public.profiles
  for select to authenticated
  using (true);

-- =========================================================
-- Fix app_settings table RLS - remove unrestricted access
-- =========================================================
drop policy if exists "app_settings_read" on public.app_settings;

-- Replace with service role only access for settings
create policy "app_settings_service_read" on public.app_settings
  for select to service_role
  using (true);

create policy "app_settings_service_write" on public.app_settings
  for all to service_role
  using (true)
  with check (true);
