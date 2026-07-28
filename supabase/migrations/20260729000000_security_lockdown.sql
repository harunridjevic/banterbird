-- ============================================================
-- Security lockdown: deny-all RLS on internal tables,
-- tighten app_settings to service_role only.
-- ============================================================

-- ── error_logs ───────────────────────────────────────────────
-- Written only via server-side logError(). No client should
-- ever read or write this table directly.
alter table public.error_logs enable row level security;
drop policy if exists "error_logs_deny_all" on public.error_logs;
create policy "error_logs_deny_all"
  on public.error_logs
  for all
  using (false)
  with check (false);

-- ── user_reports ─────────────────────────────────────────────
-- Insertion happens via the submit_user_report() security-definer
-- RPC. No client needs direct table access to read reports.
drop policy if exists "users_insert_own_reports" on public.user_reports;
alter table public.user_reports enable row level security;
drop policy if exists "user_reports_deny_all" on public.user_reports;
create policy "user_reports_deny_all"
  on public.user_reports
  for all
  using (false)
  with check (false);

-- ── moderation_blocks ────────────────────────────────────────
-- Only ops/service role should read or write block rules.
alter table public.moderation_blocks enable row level security;
drop policy if exists "moderation_blocks_deny_all" on public.moderation_blocks;
create policy "moderation_blocks_deny_all"
  on public.moderation_blocks
  for all
  using (false)
  with check (false);

-- ── rate_limit_events ────────────────────────────────────────
-- Written only by the check_rate_limit() security-definer RPC.
alter table public.rate_limit_events enable row level security;
drop policy if exists "rate_limit_events_deny_all" on public.rate_limit_events;
create policy "rate_limit_events_deny_all"
  on public.rate_limit_events
  for all
  using (false)
  with check (false);

-- ── app_settings ─────────────────────────────────────────────
-- Drop the original authenticated-read policy that may still exist
-- from the v0.6 migration if 20260728100008 ran before it was seeded.
drop policy if exists "app_settings_read" on public.app_settings;
drop policy if exists "app_settings_service_read" on public.app_settings;
drop policy if exists "app_settings_service_write" on public.app_settings;

alter table public.app_settings enable row level security;
create policy "app_settings_service_read"
  on public.app_settings
  for select to service_role
  using (true);
create policy "app_settings_service_write"
  on public.app_settings
  for all to service_role
  using (true)
  with check (true);

-- ── ops_api_keys ─────────────────────────────────────────────
-- Already has RLS enabled with no policies (implicit deny).
-- Add explicit deny-all for clarity and future-proofing.
drop policy if exists "ops_api_keys_deny_all" on public.ops_api_keys;
create policy "ops_api_keys_deny_all"
  on public.ops_api_keys
  for all
  using (false)
  with check (false);
