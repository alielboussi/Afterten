-- Pre-check outlet employee passcode before signature (order / offloading UI).

create or replace function public.verify_outlet_employee_passcode(
  p_outlet_employee_id uuid,
  p_employee_passcode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_emp_name text;
  v_passcode_hash text;
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

  return jsonb_build_object('ok', true, 'display_name', trim(v_emp_name));
end;
$$;

revoke all on function public.verify_outlet_employee_passcode(uuid, text) from public;
grant execute on function public.verify_outlet_employee_passcode(uuid, text) to authenticated;
