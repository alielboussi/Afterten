-- Offloader selection via outlet employee passcode; expose supervisor alias on offloading detail.

create or replace function public.get_outlet_offloading_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_order public.outlet_orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_row record;
  v_resolved record;
  v_parent_name text;
begin
  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  select * into v_order
  from public.outlet_orders
  where id = p_order_id and outlet_id = v_outlet_id;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'loaded' then
    raise exception 'Order is not ready for offloading.';
  end if;

  for v_row in
    select i.*
    from public.outlet_order_items i
    where i.order_id = p_order_id
    order by i.sort_order
  loop
    select * into v_resolved
    from public.resolve_outlet_order_line(lower(v_row.product_id::text))
    limit 1;

    v_parent_name := null;
    if v_resolved.parent_product_id is not null
       and lower(v_resolved.parent_product_id) <> lower(v_row.product_id::text) then
      select p.name into v_parent_name
      from public.products p
      where lower(p.product_id) = lower(v_resolved.parent_product_id)
      limit 1;
    end if;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_row.id,
        'product_id', lower(v_row.product_id::text),
        'parent_product_id', v_resolved.parent_product_id,
        'parent_name', v_parent_name,
        'is_variant', coalesce(v_resolved.is_variant, false),
        'is_auto', public.is_rule_auto_added_product(lower(v_row.product_id::text)),
        'name', v_row.name,
        'qty', v_row.qty,
        'uom', v_row.uom,
        'line_total', v_row.line_total,
        'sort_order', v_row.sort_order
      )
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id,
    'outlet_id', v_order.outlet_id,
    'outlet_name', v_order.outlet_name,
    'order_number', v_order.order_number,
    'grand_total', v_order.grand_total,
    'loaded_at', v_order.loaded_at,
    'offloading_checklist_completed_at', v_order.offloading_checklist_completed_at,
    'supervisor_accepted_alias', v_order.supervisor_accepted_alias,
    'lines', v_lines
  );
end;
$$;

drop function if exists public.complete_outlet_order(uuid, text, text);

create or replace function public.complete_outlet_order(
  p_order_id uuid,
  p_outlet_employee_id uuid,
  p_employee_passcode text,
  p_offloader_signature_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_order public.outlet_orders%rowtype;
  v_emp_name text;
  v_passcode_hash text;
begin
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

  select * into v_order
  from public.outlet_orders
  where id = p_order_id and outlet_id = v_outlet_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'loaded' then
    raise exception 'Order is not ready to complete.';
  end if;

  if v_order.offloading_checklist_completed_at is null then
    raise exception 'Confirm all items received first.';
  end if;

  if p_offloader_signature_path is null
     or trim(p_offloader_signature_path) = ''
     or p_offloader_signature_path not like ('signatures/' || v_outlet_id || '/%') then
    raise exception 'A valid receiver signature is required.';
  end if;

  update public.outlet_orders
  set
    status = 'completed',
    offloader_name = trim(v_emp_name),
    offloader_signature_path = trim(p_offloader_signature_path),
    offloader_signed_at = now(),
    completed_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'completed',
    'offloader_name', trim(v_emp_name)
  );
end;
$$;

revoke all on function public.complete_outlet_order(uuid, uuid, text, text) from public;
grant execute on function public.complete_outlet_order(uuid, uuid, text, text) to authenticated;
