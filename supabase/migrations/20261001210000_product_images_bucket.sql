-- Public bucket for catalog product photos (portal admins upload; app + web read).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "product images portal admin insert" on storage.objects;
create policy "product images portal admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_portal_admin());

drop policy if exists "product images portal admin update" on storage.objects;
create policy "product images portal admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_portal_admin())
  with check (bucket_id = 'product-images' and public.is_portal_admin());

drop policy if exists "product images portal admin delete" on storage.objects;
create policy "product images portal admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_portal_admin());
