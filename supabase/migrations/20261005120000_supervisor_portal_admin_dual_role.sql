-- Allow portal admins to register and use the supervisor app (e.g. same owner account
-- approves on web and tests supervisor mobile). Outlet app remains blocked for portal admins.

create or replace function public.is_supervisor_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supervisor_profiles sp
    where sp.user_id = auth.uid()
  );
$$;

create or replace function public.is_approved_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supervisor_profiles sp
    where sp.user_id = auth.uid()
      and sp.approved = true
  );
$$;

create or replace function public.register_supervisor_app_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.supervisor_profiles%rowtype;
begin
  select coalesce(auth.jwt()->>'email', '') into v_email;
  if v_email = '' then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if v_email is null or trim(v_email) = '' then
    raise exception 'Google account email is required.';
  end if;

  insert into public.supervisor_profiles (user_id, email, approved)
  values (auth.uid(), lower(trim(v_email)), false)
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'alias', v_row.alias,
    'approved', v_row.approved
  );
end;
$$;

create or replace function public.get_supervisor_app_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supervisor_profiles%rowtype;
begin
  select * into v_row
  from public.supervisor_profiles sp
  where sp.user_id = auth.uid();

  if v_row.user_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'alias', v_row.alias,
    'approved', v_row.approved
  );
end;
$$;
