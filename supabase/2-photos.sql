-- Downtime, step 2: listing photos (run after 1-shop.sql). Safe to run more than once.
-- Creates a public Supabase Storage bucket, "listing-photos". Anyone can view a photo by its
-- address (that's how the storefront shows them); only shop staff can add or remove photos.
-- The app shrinks every photo on the phone first (longest side 1600 px, JPEG), so files stay small.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 2097152, array['image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Photos live under listings/<listing id>/<random name>.jpg
drop policy if exists "downtime: staff add photos" on storage.objects;
create policy "downtime: staff add photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = 'listings' and (select public.dt_is_staff()));

drop policy if exists "downtime: staff remove photos" on storage.objects;
create policy "downtime: staff remove photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (select public.dt_is_staff()));

-- Removing a photo needs to find it first, so staff can see the bucket's file list (the photos are public anyway)
drop policy if exists "downtime: staff list photos" on storage.objects;
create policy "downtime: staff list photos" on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and (select public.dt_is_staff()));

insert into public.dt_schema_log (script, version) values ('2-photos.sql', '0.1');
