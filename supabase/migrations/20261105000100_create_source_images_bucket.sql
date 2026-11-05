-- Private bucket for uploaded source images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-images',
  'source-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own source images" on storage.objects;
drop policy if exists "Users can read own source images" on storage.objects;
drop policy if exists "Users can delete own source images" on storage.objects;

create policy "Users can upload own source images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'source-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can read own source images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'source-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete own source images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'source-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
