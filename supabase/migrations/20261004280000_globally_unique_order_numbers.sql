-- Globally unique order numbers (outlet_id + sequence) and outlet-only order visibility.

alter table public.outlet_orders drop constraint if exists outlet_orders_outlet_id_order_number_key;

create unique index if not exists outlet_orders_order_number_global_uidx
  on public.outlet_orders (order_number);

create or replace function public.preview_outlet_order_number()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_seq bigint;
begin
  if public.is_portal_admin() then
    return null;
  end if;

  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    return null;
  end if;

  select c.next_sequence into v_seq
  from public.outlet_order_counters c
  where c.outlet_id = v_outlet_id;

  if v_seq is null then
    v_seq := 1;
  end if;

  return upper(v_outlet_id) || '-' || lpad(v_seq::text, 10, '0');
end;
$$;

-- Order number uses outlet_id prefix so numbers never collide across outlets.
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
  v_pid text;
  v_req_qty numeric;
  v_live_qty numeric;
  v_expanded jsonb;
  v_line record;
  v_allowlist_id text;
  v_units_per numeric;
  v_total_units numeric;
begin
  perform public.assert_not_paused();

  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only, not the outlet app.';
  end if;

  select outlet_id, outlet_name into v_outlet_id, v_outlet_name
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  if p_employee_name is null or length(trim(p_employee_name)) < 2 then
    raise exception 'A valid order placed by name is required (at least 2 characters).';
  end if;

  if p_employee_signature_path is null
     or trim(p_employee_signature_path) = ''
     or p_employee_signature_path not like ('signatures/' || v_outlet_id || '/%') then
    raise exception 'A valid employee signature is required.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order line is required.';
  end if;

  v_expanded := public.expand_order_items(p_items);

  for v_item in select * from jsonb_array_elements(v_expanded)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);

    perform public.validate_product_order_qty(v_pid, v_req_qty);

    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;
    if v_line is null then
      raise exception 'Unknown or inactive product: %', v_pid;
    end if;

    v_allowlist_id := v_line.parent_product_id;

    if not public.is_product_allowed_for_outlet(v_outlet_id, v_allowlist_id) then
      raise exception 'Product % is not available for this outlet.', v_line.line_name;
    end if;

    v_live_qty := public.resolve_live_product_qty(v_pid);
    if v_line.live_qty_gate_enabled and v_live_qty is not null then
      if v_live_qty <= 0 then
        raise exception 'Product % is out of stock.', v_line.line_name;
      end if;
      if v_req_qty > v_live_qty then
        raise exception 'Only % units available for %.', v_live_qty, v_line.line_name;
      end if;
    end if;
  end loop;

  insert into public.outlet_order_counters (outlet_id, next_sequence)
  values (v_outlet_id, 1)
  on conflict (outlet_id) do nothing;

  update public.outlet_order_counters
  set next_sequence = next_sequence + 1,
      updated_at = now()
  where outlet_id = v_outlet_id
  returning next_sequence - 1 into v_seq;

  v_order_number := upper(v_outlet_id) || '-' || lpad(v_seq::text, 10, '0');

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

  for v_item in select * from jsonb_array_elements(v_expanded)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);

    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;

    v_units_per := coalesce(v_line.line_units_per_order_unit, 1);
    if v_units_per <= 0 then
      v_units_per := 1;
    end if;
    v_total_units := v_req_qty * v_units_per;

    v_line_total := round(v_line.line_unit_cost * v_req_qty, 2);
    v_grand := v_grand + v_line_total;
    insert into public.outlet_order_items (
      order_id,
      product_id,
      variant_key,
      name,
      uom,
      unit_cost,
      qty,
      units_per_order_unit,
      total_units,
      line_total,
      sort_order
    ) values (
      v_order_id,
      v_line.catalog_product_id,
      case when v_line.is_variant then v_line.catalog_product_id else coalesce(v_item->>'variant_key', '') end,
      v_line.line_name,
      v_line.line_uom,
      v_line.line_unit_cost,
      v_req_qty,
      v_units_per,
      v_total_units,
      v_line_total,
      v_sort
    );
    v_sort := v_sort + 1;
  end loop;

  update public.outlet_orders
  set grand_total = v_grand, updated_at = now()
  where id = v_order_id;

  perform public.dispatch_outlet_order_notifications(v_order_id);

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'placed',
    'grand_total', v_grand,
    'expanded_items', v_expanded
  );
end;
$$;

comment on policy "orders read own outlet" on public.outlet_orders is
  'Outlet app users may only read orders for their own outlet_id (see current_outlet_id()).';
