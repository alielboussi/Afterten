-- Outlet product returns: photo + employee passcode + signature, supervisor accept/reject.

create type public.outlet_return_status as enum ('submitted', 'accepted', 'rejected');

create table if not exists public.outlet_return_number_counter (
  id int primary key default 1 check (id = 1),
  next_sequence bigint not null default 1
);

insert into public.outlet_return_number_counter (id, next_sequence)
values (1, 1)
on conflict (id) do nothing;

create table if not exists public.outlet_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null,
  outlet_id text not null references public.outlets (id),
  outlet_name text not null,
  status public.outlet_return_status not null default 'submitted',
  photo_path text not null,
  employee_signature_path text not null,
  employee_name text not null,
  outlet_employee_id uuid references public.outlet_employees (id) on delete set null,
  employee_signed_at timestamptz not null default now(),
  pdf_path text,
  supervisor_accepted_at timestamptz,
  supervisor_rejected_at timestamptz,
  supervisor_accepted_by uuid references auth.users (id) on delete set null,
  supervisor_rejected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlet_returns_return_number_uidx unique (return_number)
);

create index if not exists outlet_returns_outlet_created_idx
  on public.outlet_returns (outlet_id, created_at desc);

create index if not exists outlet_returns_status_created_idx
  on public.outlet_returns (status, created_at desc);

alter table public.outlet_returns enable row level security;

drop policy if exists "outlet returns read own" on public.outlet_returns;
create policy "outlet returns read own"
  on public.outlet_returns for select
  to authenticated
  using (
    public.is_outlet_app_user()
    and outlet_id = public.current_outlet_id()
  );

drop policy if exists "outlet returns supervisor read" on public.outlet_returns;
create policy "outlet returns supervisor read"
  on public.outlet_returns for select
  to authenticated
  using (public.is_approved_supervisor());

-- Storage bucket "returns" (Returns)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'returns',
  'returns',
  false,
  10485760,
  array['application/pdf', 'image/webp', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "returns outlet insert own" on storage.objects;
create policy "returns outlet insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'returns'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "returns outlet read own" on storage.objects;
create policy "returns outlet read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'returns'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "returns supervisor read" on storage.objects;
create policy "returns supervisor read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'returns' and public.is_approved_supervisor());

drop policy if exists "returns portal admin read" on storage.objects;
create policy "returns portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'returns' and public.is_portal_admin());

create or replace function public.preview_outlet_return_number()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  if public.is_portal_admin() then
    return null;
  end if;

  if not public.is_outlet_app_user() then
    return null;
  end if;

  select c.next_sequence into v_seq
  from public.outlet_return_number_counter c
  where c.id = 1;

  if v_seq is null then
    v_seq := 1;
  end if;

  return lpad(v_seq::text, 10, '0');
end;
$$;

revoke all on function public.preview_outlet_return_number() from public;
grant execute on function public.preview_outlet_return_number() to authenticated;

create or replace function public.submit_outlet_return(
  p_return_id uuid,
  p_outlet_employee_id uuid,
  p_employee_passcode text,
  p_employee_signature_path text,
  p_photo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_outlet_name text;
  v_seq bigint;
  v_return_number text;
  v_emp_name text;
  v_passcode_hash text;
  v_return_id uuid;
begin
  perform public.assert_not_paused();

  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  select outlet_id, outlet_name into v_outlet_id, v_outlet_name
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  if p_return_id is null then
    raise exception 'Return id is required.';
  end if;

  if p_outlet_employee_id is null then
    raise exception 'Select an outlet employee.';
  end if;

  if p_employee_passcode is null or length(trim(p_employee_passcode)) < 4 then
    raise exception 'Enter the employee passcode (at least 4 characters).';
  end if;

  select e.display_name, e.passcode_hash
  into v_emp_name, v_passcode_hash
  from public.outlet_employees e
  where e.id = p_outlet_employee_id
    and e.outlet_id = v_outlet_id
    and e.active = true;

  if v_emp_name is null or v_passcode_hash is null then
    raise exception 'Employee not found or inactive.';
  end if;

  if crypt(trim(p_employee_passcode), v_passcode_hash) <> v_passcode_hash then
    raise exception 'Incorrect passcode.';
  end if;

  if p_employee_signature_path is null
     or trim(p_employee_signature_path) = ''
     or p_employee_signature_path not like ('returns/' || v_outlet_id || '/%') then
    raise exception 'A valid employee signature is required.';
  end if;

  if p_photo_path is null
     or trim(p_photo_path) = ''
     or p_photo_path not like ('returns/' || v_outlet_id || '/%') then
    raise exception 'A return photo is required.';
  end if;

  insert into public.outlet_return_number_counter (id, next_sequence)
  values (1, 1)
  on conflict (id) do nothing;

  update public.outlet_return_number_counter
  set next_sequence = next_sequence + 1
  where id = 1
  returning next_sequence - 1 into v_seq;

  v_return_number := lpad(v_seq::text, 10, '0');
  v_return_id := p_return_id;

  insert into public.outlet_returns (
    id,
    return_number,
    outlet_id,
    outlet_name,
    status,
    photo_path,
    employee_signature_path,
    employee_name,
    outlet_employee_id,
    employee_signed_at
  ) values (
    v_return_id,
    v_return_number,
    v_outlet_id,
    v_outlet_name,
    'submitted',
    trim(p_photo_path),
    trim(p_employee_signature_path),
    trim(v_emp_name),
    p_outlet_employee_id,
    now()
  );

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'status', 'submitted'
  );
end;
$$;

revoke all on function public.submit_outlet_return(uuid, uuid, text, text, text) from public;
grant execute on function public.submit_outlet_return(uuid, uuid, text, text, text) to authenticated;

create or replace function public.list_outlet_returns_for_app()
returns table (
  id uuid,
  return_number text,
  status public.outlet_return_status,
  employee_name text,
  created_at timestamptz,
  photo_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
begin
  if public.is_portal_admin() then
    return;
  end if;

  select ap.outlet_id into v_outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app';

  if v_outlet_id is null then
    return;
  end if;

  return query
  select
    r.id,
    r.return_number,
    r.status,
    r.employee_name,
    r.created_at,
    r.photo_path
  from public.outlet_returns r
  where r.outlet_id = v_outlet_id
  order by r.created_at desc
  limit 200;
end;
$$;

revoke all on function public.list_outlet_returns_for_app() from public;
grant execute on function public.list_outlet_returns_for_app() to authenticated;

create or replace function public.list_supervisor_returns(p_query text default null)
returns table (
  id uuid,
  return_number text,
  outlet_id text,
  outlet_name text,
  status public.outlet_return_status,
  employee_name text,
  created_at timestamptz,
  photo_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_needle text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor access only.';
  end if;

  return query
  select
    r.id,
    r.return_number,
    r.outlet_id,
    r.outlet_name,
    r.status,
    r.employee_name,
    r.created_at,
    r.photo_path
  from public.outlet_returns r
  where
    v_needle = ''
    or lower(r.return_number) like '%' || v_needle || '%'
    or lower(r.outlet_name) like '%' || v_needle || '%'
    or lower(r.outlet_id) like '%' || v_needle || '%'
    or lower(r.employee_name) like '%' || v_needle || '%'
  order by r.created_at desc
  limit 300;
end;
$$;

revoke all on function public.list_supervisor_returns(text) from public;
grant execute on function public.list_supervisor_returns(text) to authenticated;

create or replace function public.get_outlet_return_detail(p_return_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
  v_outlet_id text;
begin
  if p_return_id is null then
    raise exception 'Return id required.';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if public.is_outlet_app_user() then
    select public.current_outlet_id() into v_outlet_id;
    if v_row.outlet_id is distinct from v_outlet_id then
      raise exception 'Return not found.';
    end if;
  elsif public.is_approved_supervisor() or public.is_portal_admin() then
    null;
  else
    raise exception 'Not authorized.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'return_number', v_row.return_number,
    'outlet_id', v_row.outlet_id,
    'outlet_name', v_row.outlet_name,
    'status', v_row.status,
    'employee_name', v_row.employee_name,
    'photo_path', v_row.photo_path,
    'employee_signature_path', v_row.employee_signature_path,
    'pdf_path', v_row.pdf_path,
    'created_at', v_row.created_at,
    'supervisor_accepted_at', v_row.supervisor_accepted_at,
    'supervisor_rejected_at', v_row.supervisor_rejected_at
  );
end;
$$;

revoke all on function public.get_outlet_return_detail(uuid) from public;
grant execute on function public.get_outlet_return_detail(uuid) to authenticated;

create or replace function public.accept_supervisor_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor access only.';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id for update;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if v_row.status <> 'submitted' then
    raise exception 'Return is not awaiting decision.';
  end if;

  update public.outlet_returns
  set
    status = 'accepted',
    supervisor_accepted_at = now(),
    supervisor_accepted_by = auth.uid(),
    updated_at = now()
  where id = p_return_id;

  return jsonb_build_object('return_id', p_return_id, 'status', 'accepted');
end;
$$;

create or replace function public.reject_supervisor_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor access only.';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id for update;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if v_row.status <> 'submitted' then
    raise exception 'Return is not awaiting decision.';
  end if;

  update public.outlet_returns
  set
    status = 'rejected',
    supervisor_rejected_at = now(),
    supervisor_rejected_by = auth.uid(),
    updated_at = now()
  where id = p_return_id;

  return jsonb_build_object('return_id', p_return_id, 'status', 'rejected');
end;
$$;

revoke all on function public.accept_supervisor_return(uuid) from public;
grant execute on function public.accept_supervisor_return(uuid) to authenticated;

revoke all on function public.reject_supervisor_return(uuid) from public;
grant execute on function public.reject_supervisor_return(uuid) to authenticated;
