-- Supervisors may only change qty or swap variants on lines already on the placed order.

create or replace function public.supervisor_placed_manual_parent_ids(p_order_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct parent_id order by parent_id),
    array[]::text[]
  )
  from (
    select lower(
      coalesce(
        nullif(trim(v_resolved.parent_product_id), ''),
        v_resolved.catalog_product_id
      )
    ) as parent_id
    from public.outlet_order_items i
    cross join lateral (
      select *
      from public.resolve_outlet_order_line(lower(i.product_id::text))
      limit 1
    ) v_resolved
    where i.order_id = p_order_id
      and not public.is_rule_auto_added_product(lower(i.product_id::text))
  ) s;
$$;

revoke all on function public.supervisor_placed_manual_parent_ids(uuid) from public;
grant execute on function public.supervisor_placed_manual_parent_ids(uuid) to authenticated;

create or replace function public.assert_supervisor_revision_manual_parents(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed text[];
  v_submitted text[];
  v_item jsonb;
  v_pid text;
  v_qty numeric;
  v_line record;
  v_parent text;
begin
  v_allowed := public.supervisor_placed_manual_parent_ids(p_order_id);

  if coalesce(array_length(v_allowed, 1), 0) = 0 then
    raise exception 'Order has no editable lines.';
  end if;

  v_submitted := array[]::text[];

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_pid := lower(trim(coalesce(v_item->>'product_id', '')));
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid = '' or v_qty <= 0 then
      continue;
    end if;

    if public.is_rule_auto_added_product(v_pid) then
      raise exception 'Auto-added products cannot be edited directly.';
    end if;

    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;
    if v_line is null then
      raise exception 'Unknown product: %', v_pid;
    end if;

    v_parent := lower(
      coalesce(nullif(trim(v_line.parent_product_id), ''), v_line.catalog_product_id)
    );
    v_submitted := array_append(v_submitted, v_parent);
  end loop;

  select coalesce(array_agg(distinct x order by x), array[]::text[])
  into v_submitted
  from unnest(v_submitted) as x;

  if v_submitted is distinct from v_allowed then
    raise exception 'Supervisors cannot add or remove order lines—only change quantity or variant.';
  end if;
end;
$$;

revoke all on function public.assert_supervisor_revision_manual_parents(uuid, jsonb) from public;
grant execute on function public.assert_supervisor_revision_manual_parents(uuid, jsonb) to authenticated;

drop function if exists public.preview_supervisor_order_revision(jsonb);

create or replace function public.preview_supervisor_order_revision(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_expanded jsonb;
  v_item jsonb;
  v_pid text;
  v_req_qty numeric;
  v_line record;
  v_grand numeric(12, 2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_units_per numeric;
  v_total_units numeric;
  v_line_total numeric(12, 2);
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order line is required.';
  end if;

  perform public.assert_supervisor_revision_manual_parents(p_order_id, p_items);

  v_expanded := public.expand_order_items(p_items);

  for v_item in select * from jsonb_array_elements(v_expanded)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);
    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;
    if v_line is null then
      raise exception 'Unknown product: %', v_pid;
    end if;

    v_units_per := coalesce(v_line.line_units_per_order_unit, 1);
    if v_units_per <= 0 then v_units_per := 1; end if;
    v_total_units := v_req_qty * v_units_per;
    v_line_total := round(v_line.line_unit_cost * v_req_qty, 2);
    v_grand := v_grand + v_line_total;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_line.catalog_product_id,
        'parent_product_id', v_line.parent_product_id,
        'is_variant', v_line.is_variant,
        'is_auto', public.is_rule_auto_added_product(v_line.catalog_product_id),
        'name', v_line.line_name,
        'qty', v_req_qty,
        'uom', v_line.line_uom,
        'unit_cost', v_line.line_unit_cost,
        'line_total', v_line_total,
        'units_per_order_unit', v_units_per,
        'total_units', v_total_units
      )
    );
  end loop;

  return jsonb_build_object('lines', v_lines, 'grand_total', v_grand);
end;
$$;

revoke all on function public.preview_supervisor_order_revision(uuid, jsonb) from public;
grant execute on function public.preview_supervisor_order_revision(uuid, jsonb) to authenticated;

create or replace function public.accept_supervisor_order(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.outlet_orders%rowtype;
  v_expanded jsonb;
  v_item jsonb;
  v_pid text;
  v_req_qty numeric;
  v_line record;
  v_grand numeric(12, 2) := 0;
  v_sort int := 0;
  v_units_per numeric;
  v_total_units numeric;
  v_line_total numeric(12, 2);
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'placed' then
    raise exception 'Only placed orders can be accepted.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order line is required.';
  end if;

  perform public.assert_supervisor_revision_manual_parents(p_order_id, p_items);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    if public.is_rule_auto_added_product(v_pid) then
      raise exception 'Auto-added products cannot be submitted directly.';
    end if;
    perform public.validate_product_order_qty(v_pid, coalesce((v_item->>'qty')::numeric, 0));
  end loop;

  v_expanded := public.expand_order_items(p_items);

  for v_item in select * from jsonb_array_elements(v_expanded)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);
    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;
    if v_line is null then
      raise exception 'Unknown product: %', v_pid;
    end if;
    if not public.is_product_allowed_for_outlet(v_order.outlet_id, v_line.parent_product_id) then
      raise exception 'Product % is not available for this outlet.', v_line.line_name;
    end if;
  end loop;

  delete from public.outlet_order_items where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(v_expanded)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);
    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;

    v_units_per := coalesce(v_line.line_units_per_order_unit, 1);
    if v_units_per <= 0 then v_units_per := 1; end if;
    v_total_units := v_req_qty * v_units_per;
    v_line_total := round(v_line.line_unit_cost * v_req_qty, 2);
    v_grand := v_grand + v_line_total;

    insert into public.outlet_order_items (
      order_id, product_id, variant_key, name, uom, unit_cost, qty,
      units_per_order_unit, total_units, line_total, sort_order
    ) values (
      p_order_id,
      v_line.catalog_product_id,
      case when v_line.is_variant then v_line.catalog_product_id else '' end,
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
  set
    status = 'accepted',
    grand_total = v_grand,
    supervisor_accepted_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'accepted',
    'grand_total', v_grand
  );
end;
$$;

revoke all on function public.accept_supervisor_order(uuid, jsonb) from public;
grant execute on function public.accept_supervisor_order(uuid, jsonb) to authenticated;
