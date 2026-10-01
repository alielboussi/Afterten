-- Hide order-logic auto-add SKUs from outlet catalog; product variants with own UUIDs.

alter table public.products
  add column if not exists has_variants boolean not null default false;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products (product_id) on delete cascade,
  variant_id text not null,
  name text not null,
  uom text not null default 'pc',
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  image_url text,
  sort_order int not null default 0,
  qty_step numeric(12, 3) not null default 1 check (qty_step > 0),
  min_order_qty numeric(12, 3) check (min_order_qty is null or min_order_qty >= 0),
  max_order_qty numeric(12, 3) check (max_order_qty is null or max_order_qty >= 0),
  active boolean not null default true,
  live_qty_gate_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_variant_id_unique unique (variant_id)
);

create index if not exists product_variants_product_idx on public.product_variants (product_id, active, sort_order);

comment on table public.product_variants is
  'Sellable SKUs under a parent product; variant_id is the inventory API UUID used on orders.';

alter table public.product_variants enable row level security;

create or replace function public.is_rule_auto_added_product(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.product_order_rule_additions a
    join public.product_order_rules r on r.id = a.rule_id and r.active = true
    where lower(a.added_product_id) = lower(p_product_id)
  );
$$;

create or replace function public.validate_product_order_qty(p_product_id text, p_qty numeric)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_step numeric;
  v_min numeric;
  v_max numeric;
  v_name text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select qty_step, min_order_qty, max_order_qty, name
  into v_step, v_min, v_max, v_name
  from public.products
  where lower(product_id) = lower(p_product_id) and active = true;

  if not found then
    select v.qty_step, v.min_order_qty, v.max_order_qty, v.name
    into v_step, v_min, v_max, v_name
    from public.product_variants v
    where lower(v.variant_id) = lower(p_product_id) and v.active = true;

    if not found then
      raise exception 'Unknown or inactive product: %', p_product_id;
    end if;
  end if;

  if v_min is not null and p_qty < v_min then
    raise exception 'Minimum order for % is %.', v_name, v_min;
  end if;

  if v_max is not null and p_qty > v_max then
    raise exception 'Maximum order for % is %.', v_name, v_max;
  end if;

  if mod(p_qty, v_step) <> 0 then
    raise exception 'Quantity for % must change in steps of %.', v_name, v_step;
  end if;
end;
$$;

create or replace function public.resolve_outlet_order_line(p_line_id text)
returns table (
  catalog_product_id text,
  parent_product_id text,
  line_name text,
  line_uom text,
  line_unit_cost numeric,
  live_qty_gate_enabled boolean,
  is_variant boolean
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
    false
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
    true
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
            'max_order_qty', v.max_order_qty
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

-- place_outlet_order: resolve variant lines + allowlist on parent product
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

    select * into v_line from public.resolve_outlet_order_line(v_pid) limit 1;

    v_line_total := round(v_line.line_unit_cost * (v_item->>'qty')::numeric, 2);
    v_grand := v_grand + v_line_total;
    insert into public.outlet_order_items (
      order_id, product_id, variant_key, name, uom, unit_cost, qty, line_total, sort_order
    ) values (
      v_order_id,
      v_line.catalog_product_id,
      case when v_line.is_variant then v_line.catalog_product_id else coalesce(v_item->>'variant_key', '') end,
      v_line.line_name,
      v_line.line_uom,
      v_line.line_unit_cost,
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
    'grand_total', v_grand,
    'expanded_items', v_expanded
  );
end;
$$;

revoke all on function public.place_outlet_order(text, text, jsonb) from public;
grant execute on function public.place_outlet_order(text, text, jsonb) to authenticated;
