-- Order UOM multiplier: qty ordered in UOM (e.g. trays) × units_per_order_unit = total pieces/units.

alter table public.products
  add column if not exists units_per_order_unit numeric(12, 3) not null default 1
  check (units_per_order_unit > 0);

alter table public.product_variants
  add column if not exists units_per_order_unit numeric(12, 3) not null default 1
  check (units_per_order_unit > 0);

comment on column public.products.units_per_order_unit is
  'Physical units per one ordered qty (e.g. 25 pieces per tray). Order qty stays in UOM; total_units = qty × this.';

comment on column public.product_variants.units_per_order_unit is
  'Same as products.units_per_order_unit for variant lines.';

alter table public.outlet_order_items
  add column if not exists units_per_order_unit numeric(12, 3) not null default 1
  check (units_per_order_unit > 0);

alter table public.outlet_order_items
  add column if not exists total_units numeric(12, 3) not null default 0;

comment on column public.outlet_order_items.qty is
  'Quantity in product UOM (e.g. trays).';

comment on column public.outlet_order_items.total_units is
  'qty × units_per_order_unit at order time (e.g. pieces).';

-- Backfill historical lines (assumed 1:1 before this column existed)
update public.outlet_order_items
set total_units = qty
where total_units = 0 and qty <> 0;

drop function if exists public.resolve_outlet_order_line(text);

create or replace function public.resolve_outlet_order_line(p_line_id text)
returns table (
  catalog_product_id text,
  parent_product_id text,
  line_name text,
  line_uom text,
  line_unit_cost numeric,
  live_qty_gate_enabled boolean,
  is_variant boolean,
  line_units_per_order_unit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.product_id,
    p.product_id,
    p.name,
    p.uom,
    p.unit_cost,
    p.live_qty_gate_enabled,
    false,
    p.units_per_order_unit
  from public.products p
  where lower(p.product_id) = lower(p_line_id) and p.active = true
  union all
  select
    v.variant_id,
    v.product_id,
    v.name,
    v.uom,
    v.unit_cost,
    v.live_qty_gate_enabled,
    true,
    v.units_per_order_unit
  from public.product_variants v
  where lower(v.variant_id) = lower(p_line_id) and v.active = true
  limit 1;
$$;

drop function if exists public.list_outlet_products();

create or replace function public.list_outlet_products()
returns table (
  product_id text,
  name text,
  uom text,
  unit_cost numeric,
  image_url text,
  live_qty_gate_enabled boolean,
  live_qty numeric,
  orderable boolean,
  qty_step numeric,
  min_order_qty numeric,
  max_order_qty numeric,
  units_per_order_unit numeric,
  has_variants boolean,
  variants jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.product_id,
    p.name,
    p.uom,
    p.unit_cost,
    p.image_url,
    p.live_qty_gate_enabled,
    case
      when p.live_qty_gate_enabled then coalesce(l.qty, 0)
      else null
    end as live_qty,
    case
      when p.has_variants then true
      when not p.live_qty_gate_enabled then true
      when coalesce(l.qty, 0) > 0 then true
      else false
    end as orderable,
    p.qty_step,
    p.min_order_qty,
    p.max_order_qty,
    p.units_per_order_unit,
    p.has_variants,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'variant_id', v.variant_id,
            'name', v.name,
            'uom', v.uom,
            'unit_cost', v.unit_cost,
            'image_url', v.image_url,
            'live_qty_gate_enabled', v.live_qty_gate_enabled,
            'live_qty',
              case
                when v.live_qty_gate_enabled then coalesce(vl.qty, 0)
                else null
              end,
            'orderable',
              case
                when not v.live_qty_gate_enabled then true
                when coalesce(vl.qty, 0) > 0 then true
                else false
              end,
            'qty_step', v.qty_step,
            'min_order_qty', v.min_order_qty,
            'max_order_qty', v.max_order_qty,
            'units_per_order_unit', v.units_per_order_unit
          )
          order by v.sort_order, v.name
        )
        from public.product_variants v
        left join public.product_live_qty vl on vl.product_id = v.variant_id
        where v.product_id = p.product_id and v.active = true
      ),
      '[]'::jsonb
    ) as variants
  from public.products p
  left join public.product_live_qty l on l.product_id = p.product_id
  where p.active = true
    and public.is_outlet_app_user()
    and public.is_product_allowed_for_outlet(public.current_outlet_id(), p.product_id)
    and not public.is_rule_auto_added_product(p.product_id)
  order by p.sort_order, p.name;
$$;

revoke all on function public.list_outlet_products() from public;
grant execute on function public.list_outlet_products() to authenticated;

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
        raise exception 'Product % is out of stock (live qty %).', v_line.line_name, v_live_qty;
      end if;
      if v_req_qty > v_live_qty then
        raise exception 'Requested qty % exceeds live stock % for %.', v_req_qty, v_live_qty, v_line.line_name;
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

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'placed',
    'grand_total', v_grand,
    'expanded_items', v_expanded
  );
end;
$$;

revoke all on function public.place_outlet_order(text, text, jsonb) from public;
grant execute on function public.place_outlet_order(text, text, jsonb) to authenticated;
