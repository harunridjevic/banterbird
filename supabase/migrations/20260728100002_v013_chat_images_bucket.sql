-- ============================================================
-- BanterBird v0.13.0 — Chat Images Storage Bucket
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Create public bucket for chat images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- Allow authenticated users to upload to their own folder
create policy "chat-images: auth upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-images');

-- Allow public read (bucket is public)
create policy "chat-images: public read"
  on storage.objects for select
  using (bucket_id = 'chat-images');

-- Allow users to delete their own uploads
create policy "chat-images: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-images' and owner = auth.uid());
