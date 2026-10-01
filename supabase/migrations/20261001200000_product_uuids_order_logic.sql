-- Product UUIDs (inventory API), qty constraints, and configurable auto-add order logic.

alter table public.products
  add column if not exists qty_step numeric(12, 3) not null default 1 check (qty_step > 0),
  add column if not exists min_order_qty numeric(12, 3) check (min_order_qty is null or min_order_qty >= 0),
  add column if not exists max_order_qty numeric(12, 3) check (max_order_qty is null or max_order_qty >= 0);

comment on column public.products.product_id is
  'External inventory API UUID (same value used for live stock sync).';

-- ---------------------------------------------------------------------------
-- Order logic: when trigger product is ordered, auto-add companion lines
-- ---------------------------------------------------------------------------
create table if not exists public.product_order_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  trigger_product_id text not null references public.products (product_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_order_rules_trigger_idx
  on public.product_order_rules (trigger_product_id, active, sort_order);

create table if not exists public.product_order_rule_additions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.product_order_rules (id) on delete cascade,
  added_product_id text not null references public.products (product_id) on delete cascade,
  qty_per_trigger_unit numeric(12, 3) not null check (qty_per_trigger_unit > 0),
  sort_order int not null default 0,
  unique (rule_id, added_product_id)
);

alter table public.product_order_rules enable row level security;
alter table public.product_order_rule_additions enable row level security;

create or replace function public.validate_product_order_qty(p_product_id text, p_qty numeric)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_step numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select qty_step, min_order_qty, max_order_qty, name
  into v
  from public.products
  where product_id = p_product_id and active = true;

  if not found then
    raise exception 'Unknown or inactive product: %', p_product_id;
  end if;

  v_step := v.qty_step;

  if v.min_order_qty is not null and p_qty < v.min_order_qty then
    raise exception 'Minimum order for % is %.', v.name, v.min_order_qty;
  end if;

  if v.max_order_qty is not null and p_qty > v.max_order_qty then
    raise exception 'Maximum order for % is %.', v.name, v.max_order_qty;
  end if;

  if mod(p_qty, v_step) <> 0 then
    raise exception 'Quantity for % must change in steps of %.', v.name, v_step;
  end if;
end;
$$;

create or replace function public.expand_order_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_item jsonb;
  v_pid text;
  v_qty numeric;
  v_rule record;
  v_add record;
  v_trigger_qty numeric;
  v_added numeric;
  v_pass int;
  v_changed boolean;
  v_key text;
  v_result jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := lower(trim(coalesce(v_item->>'product_id', '')));
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid = '' or v_qty <= 0 then
      continue;
    end if;
    v_map := v_map || jsonb_build_object(
      v_pid,
      coalesce((v_map->>v_pid)::numeric, 0) + v_qty
    );
  end loop;

  for v_pass in 1..8
  loop
    v_changed := false;
    for v_rule in
      select r.id, r.trigger_product_id
      from public.product_order_rules r
      where r.active = true
      order by r.sort_order, r.name
    loop
      v_trigger_qty := coalesce((v_map->>lower(v_rule.trigger_product_id))::numeric, 0);
      if v_trigger_qty <= 0 then
        continue;
      end if;

      for v_add in
        select a.added_product_id, a.qty_per_trigger_unit
        from public.product_order_rule_additions a
        where a.rule_id = v_rule.id
        order by a.sort_order
      loop
        v_added := v_trigger_qty * v_add.qty_per_trigger_unit;
        if v_added <= 0 then
          continue;
        end if;
        v_map := v_map || jsonb_build_object(
          lower(v_add.added_product_id),
          coalesce((v_map->>lower(v_add.added_product_id))::numeric, 0) + v_added
        );
        v_changed := true;
      end loop;
    end loop;
    exit when not v_changed;
  end loop;

  select coalesce(
    jsonb_agg(jsonb_build_object('product_id', k, 'qty', (v_map->>k)::numeric)),
    '[]'::jsonb
  )
  into v_result
  from jsonb_object_keys(v_map) as k;

  return v_result;
end;
$$;

revoke all on function public.expand_order_items(jsonb) from public;
grant execute on function public.expand_order_items(jsonb) to authenticated;

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
  max_order_qty numeric
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
      when not p.live_qty_gate_enabled then true
      when coalesce(l.qty, 0) > 0 then true
      else false
    end as orderable,
    p.qty_step,
    p.min_order_qty,
    p.max_order_qty
  from public.products p
  left join public.product_live_qty l on l.product_id = p.product_id
  where p.active = true
    and public.is_outlet_app_user()
    and public.is_product_allowed_for_outlet(public.current_outlet_id(), p.product_id)
  order by p.sort_order, p.name;
$$;

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
  v_prod record;
  v_expanded jsonb;
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

    select * into v_prod
    from public.products
    where product_id = v_pid and active = true;

    if not public.is_product_allowed_for_outlet(v_outlet_id, v_pid) then
      raise exception 'Product % is not available for this outlet.', v_prod.name;
    end if;

    v_live_qty := public.resolve_live_product_qty(v_pid);
    if v_prod.live_qty_gate_enabled and v_live_qty is not null then
      if v_live_qty <= 0 then
        raise exception 'Product % is out of stock (live qty %).', v_prod.name, v_live_qty;
      end if;
      if v_req_qty > v_live_qty then
        raise exception 'Requested qty % exceeds live stock % for %.', v_req_qty, v_live_qty, v_prod.name;
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

    select * into v_prod
    from public.products
    where product_id = v_pid and active = true;

    v_line_total := round(v_prod.unit_cost * (v_item->>'qty')::numeric, 2);
    v_grand := v_grand + v_line_total;
    insert into public.outlet_order_items (
      order_id, product_id, variant_key, name, uom, unit_cost, qty, line_total, sort_order
    ) values (
      v_order_id,
      v_prod.product_id,
      coalesce(v_item->>'variant_key', ''),
      v_prod.name,
      v_prod.uom,
      v_prod.unit_cost,
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

-- Seed catalog + shawarma tray → bread rule
insert into public.products (
  id,
  product_id,
  name,
  uom,
  unit_cost,
  qty_step,
  min_order_qty,
  max_order_qty,
  active,
  sort_order,
  updated_at
)
values
  (
    'c446a48f-7193-44c8-a828-d6888543de6f'::uuid,
    'c446a48f-7193-44c8-a828-d6888543de6f',
    'Chicken Shawarma Trays',
    'Trays',
    45,
    1,
    null,
    null,
    true,
    10,
    now()
  ),
  (
    '738dad70-1667-47a9-965d-29cf9b8376bf'::uuid,
    '738dad70-1667-47a9-965d-29cf9b8376bf',
    'Shawarma Bread',
    'Bags',
    0,
    1,
    null,
    null,
    true,
    20,
    now()
  )
on conflict (product_id) do update set
  name = excluded.name,
  uom = excluded.uom,
  unit_cost = excluded.unit_cost,
  qty_step = excluded.qty_step,
  updated_at = now();

insert into public.product_order_rules (id, name, description, trigger_product_id, sort_order, active)
values (
  'a1b2c3d4-e5f6-4789-a012-3456789abcde'::uuid,
  'Shawarma tray → bread bags',
  'Each Chicken Shawarma Tray ordered adds Shawarma Bread bags (4 bags per tray).',
  'c446a48f-7193-44c8-a828-d6888543de6f',
  10,
  true
)
on conflict (id) do nothing;

insert into public.product_order_rule_additions (rule_id, added_product_id, qty_per_trigger_unit, sort_order)
values (
  'a1b2c3d4-e5f6-4789-a012-3456789abcde'::uuid,
  '738dad70-1667-47a9-965d-29cf9b8376bf',
  4,
  0
)
on conflict (rule_id, added_product_id) do update set
  qty_per_trigger_unit = excluded.qty_per_trigger_unit;
