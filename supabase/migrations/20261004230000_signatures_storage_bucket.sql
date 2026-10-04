-- Private bucket for outlet employee/driver signatures (outlet app uploads).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signatures',
  'signatures',
  false,
  1048576,
  array['image/avif', 'image/webp', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "signatures outlet insert own folder" on storage.objects;
create policy "signatures outlet insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'signatures'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "signatures outlet read own folder" on storage.objects;
create policy "signatures outlet read own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'signatures'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "signatures portal admin read" on storage.objects;
create policy "signatures portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'signatures' and public.is_portal_admin());
