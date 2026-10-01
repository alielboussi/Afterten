-- Global product catalog for outlet ordering + optional live-qty gates (external API later).

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  name text not null,
  uom text not null default 'pc',
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  image_url text,
  active boolean not null default true,
  live_qty_gate_enabled boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_product_id_key unique (product_id)
);

create index if not exists products_active_sort_idx
  on public.products (active, sort_order, name);

comment on column public.products.live_qty_gate_enabled is
  'When true, orders use product_live_qty (synced from external API). When false, qty gate is skipped (testing).';

-- Filled by external inventory API / edge job (not used until gates are enabled).
create table if not exists public.product_live_qty (
  product_id text primary key references public.products (product_id) on delete cascade,
  qty numeric(12, 3) not null default 0,
  source text not null default 'external_api',
  synced_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.product_live_qty enable row level security;

create policy "products read for outlet app"
  on public.products for select
  to authenticated
  using (active = true and public.is_outlet_app_user());

create policy "product live qty read for outlet app"
  on public.product_live_qty for select
  to authenticated
  using (
    public.is_outlet_app_user()
    and exists (
      select 1
      from public.products p
      where p.product_id = product_live_qty.product_id
        and p.active = true
        and p.live_qty_gate_enabled = true
    )
  );

-- NULL = gate off or not applicable; numeric = live qty when gate on.
create or replace function public.resolve_live_product_qty(p_product_id text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gate boolean;
  v_qty numeric;
begin
  select live_qty_gate_enabled
  into v_gate
  from public.products
  where product_id = p_product_id
    and active = true;

  if not found or not v_gate then
    return null;
  end if;

  select qty into v_qty from public.product_live_qty where product_id = p_product_id;
  if not found then
    return 0;
  end if;
  return v_qty;
end;
$$;

revoke all on function public.resolve_live_product_qty(text) from public;
grant execute on function public.resolve_live_product_qty(text) to authenticated;

create or replace function public.list_outlet_products()
returns table (
  product_id text,
  name text,
  uom text,
  unit_cost numeric,
  image_url text,
  live_qty_gate_enabled boolean,
  live_qty numeric,
  orderable boolean
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
    end as orderable
  from public.products p
  left join public.product_live_qty l on l.product_id = p.product_id
  where p.active = true
    and public.is_outlet_app_user()
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
  v_prod record;
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := coalesce(v_item->>'product_id', '');
    v_req_qty := coalesce((v_item->>'qty')::numeric, 0);

    if v_pid = '' or v_req_qty <= 0 then
      raise exception 'Each line needs a product_id and qty > 0.';
    end if;

    select * into v_prod
    from public.products
    where product_id = v_pid and active = true;

    if not found then
      raise exception 'Unknown or inactive product: %', v_pid;
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod
    from public.products
    where product_id = coalesce(v_item->>'product_id', '') and active = true;

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
    'grand_total', v_grand
  );
end;
$$;

grant execute on function public.place_outlet_order(text, text, jsonb) to authenticated;
