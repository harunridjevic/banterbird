-- ============================================================
-- BanterBird v0.13.0 — Avatars Storage Bucket Policy
-- Run AFTER creating the "avatars" bucket in:
--   Supabase Dashboard → Storage → New bucket → name: "avatars" → Public: ON
-- ============================================================

-- Allow authenticated users to upload/update their own avatar
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Policy: anyone can read avatars (bucket is public, but explicit policy is good practice)
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Policy: authenticated users can upload to their own path (avatars/<user-id>.*)
create policy "avatars: owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'avatars'
    and starts_with(storage.filename(name), auth.uid()::text)
  );

-- Policy: users can update/replace their own avatar
create policy "avatars: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and starts_with(storage.filename(name), auth.uid()::text)
  );
