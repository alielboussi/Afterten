-- Order PDF storage (A4 order summaries generated after place order).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-pdfs',
  'order-pdfs',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "order pdfs outlet read own" on storage.objects;
create policy "order pdfs outlet read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'order-pdfs'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "order pdfs portal admin read" on storage.objects;
create policy "order pdfs portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-pdfs' and public.is_portal_admin());

drop policy if exists "order pdfs supervisor read" on storage.objects;
create policy "order pdfs supervisor read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-pdfs' and public.is_approved_supervisor());

create or replace function public.get_outlet_order_pdf(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_pdf_path text;
  v_file_name text;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  select pdf_path into v_pdf_path
  from public.outlet_orders
  where id = p_order_id and outlet_id = v_outlet_id;

  if v_pdf_path is null or trim(v_pdf_path) = '' then
    return jsonb_build_object('ready', false);
  end if;

  v_file_name := regexp_replace(v_pdf_path, '^.+/', '');

  return jsonb_build_object(
    'ready', true,
    'pdf_path', v_pdf_path,
    'file_name', v_file_name
  );
end;
$$;

revoke all on function public.get_outlet_order_pdf(uuid) from public;
grant execute on function public.get_outlet_order_pdf(uuid) to authenticated;
