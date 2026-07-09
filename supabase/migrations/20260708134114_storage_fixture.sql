-- =============================================================================
-- P7 test-fixture storage buckets for @zeroin.earth/supabase-query.
-- Implements migration-plan manual step §8.6 (buckets + storage RLS policies).
--
-- Two buckets exercise both URL paths:
--   • public-assets — public bucket → useFileView / useFilePreview (getPublicUrl)
--   • user-files    — private bucket, owner-scoped RLS → useSignedUrl, download,
--                     and the upload/update/delete/list mutations under RLS.
--
-- Apply locally:  supabase db reset
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('public-assets', 'public-assets', true),
  ('user-files', 'user-files', false)
on conflict (id) do nothing;

-- public-assets: anyone can read (bucket is public); authenticated users may
-- upload so the URL tests have something to point at. Tighten per app.
create policy "public-assets read" on storage.objects
  for select using (bucket_id = 'public-assets');
create policy "public-assets insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'public-assets');

-- user-files: a user manages only their own objects. `owner` is set to the
-- uploader's uid automatically by the storage API, so `owner = auth.uid()`
-- gives per-user isolation (mirrors §8.6's "read own files" example, extended
-- to insert/update/delete).
create policy "user-files select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and owner = auth.uid());
create policy "user-files insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and owner = auth.uid());
create policy "user-files update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-files' and owner = auth.uid())
  with check (bucket_id = 'user-files' and owner = auth.uid());
create policy "user-files delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-files' and owner = auth.uid());
