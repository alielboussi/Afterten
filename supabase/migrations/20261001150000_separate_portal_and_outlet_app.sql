-- Portal admins: web dashboard only. Outlet staff: Expo app only (app_profiles).
-- A user in portal_admins must not read outlet data or call place_outlet_order.

create or replace function public.is_outlet_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles ap
    where ap.user_id = auth.uid()
      and ap.active = true
  )
  and not public.is_portal_admin();
$$;

revoke all on function public.is_outlet_app_user() from public;
grant execute on function public.is_outlet_app_user() to authenticated;

create or replace function public.current_outlet_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ap.outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and not public.is_portal_admin()
  limit 1;
$$;

drop policy if exists "profiles read own" on public.app_profiles;

create policy "profiles read own outlet user"
  on public.app_profiles for select
  using (auth.uid() = user_id and not public.is_portal_admin());

create or replace function public.place_outlet_order(
  p_employee_name text,
  p_employee_signature_path text,
  p_items jsonb
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
  v_order_number text;
  v_order_id uuid;
  v_grand numeric(12, 2) := 0;
  v_item jsonb;
  v_line_total numeric(12, 2);
  v_sort int := 0;
begin
  perform public.assert_not_paused();

  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only, not the outlet app.';
  end if;

  select outlet_id, outlet_name into v_outlet_id, v_outlet_name
  from public.app_profiles
  where user_id = auth.uid() and active = true;

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  if p_employee_name is null or length(trim(p_employee_name)) = 0 then
    raise exception 'Employee name is required.';
  end if;

  if p_employee_signature_path is null
     or p_employee_signature_path not like ('signatures/' || v_outlet_id || '/%') then
    raise exception 'Invalid employee signature path.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order line is required.';
  end if;

  insert into public.outlet_order_counters (outlet_id, next_sequence)
  values (v_outlet_id, 1)
  on conflict (outlet_id) do nothing;

  update public.outlet_order_counters
  set next_sequence = next_sequence + 1,
      updated_at = now()
  where outlet_id = v_outlet_id
  returning next_sequence - 1 into v_seq;

  v_order_number := upper(regexp_replace(v_outlet_name, '[^a-zA-Z0-9]', '', 'g'));
  if v_order_number = '' then v_order_number := 'OUTLET'; end if;
  v_order_number := v_order_number || '-' || lpad(v_seq::text, 10, '0');

  insert into public.outlet_orders (
    outlet_id, outlet_name, order_number, status,
    employee_name, employee_signature_path, employee_signed_at,
    grand_total
  ) values (
    v_outlet_id, v_outlet_name, v_order_number, 'placed',
    trim(p_employee_name), p_employee_signature_path, now(),
    0
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := round(
      (v_item->>'unit_cost')::numeric * (v_item->>'qty')::numeric,
      2
    );
    v_grand := v_grand + v_line_total;
    insert into public.outlet_order_items (
      order_id, product_id, variant_key, name, uom, unit_cost, qty, line_total, sort_order
    ) values (
      v_order_id,
      coalesce(v_item->>'product_id', 'line'),
      coalesce(v_item->>'variant_key', ''),
      v_item->>'name',
      coalesce(v_item->>'uom', 'pc'),
      (v_item->>'unit_cost')::numeric,
      (v_item->>'qty')::numeric,
      v_line_total,
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  update public.outlet_orders
  set grand_total = v_grand, updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'placed',
    'grand_total', v_grand
  );
end;
$$;
