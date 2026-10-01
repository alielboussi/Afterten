-- Per-outlet product visibility for the Expo catalog.

create table if not exists public.outlet_product_allowlist (
  outlet_id text not null references public.outlets (id) on delete cascade,
  product_id text not null references public.products (product_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (outlet_id, product_id)
);

create index if not exists outlet_product_allowlist_outlet_idx
  on public.outlet_product_allowlist (outlet_id);

alter table public.outlets
  add column if not exists use_product_allowlist boolean not null default false;

comment on column public.outlets.use_product_allowlist is
  'When true, only product_ids in outlet_product_allowlist are visible in the app (may be empty).';

alter table public.outlet_product_allowlist enable row level security;

-- Outlet app reads via list_outlet_products(); direct table access is service-role / RPC only.

create or replace function public.is_product_allowed_for_outlet(p_outlet_id text, p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce(o.use_product_allowlist, false)
    or exists (
      select 1
      from public.outlet_product_allowlist a
      where a.outlet_id = p_outlet_id
        and a.product_id = p_product_id
    )
  from public.outlets o
  where o.id = p_outlet_id;
$$;

revoke all on function public.is_product_allowed_for_outlet(text, text) from public;
grant execute on function public.is_product_allowed_for_outlet(text, text) to authenticated;

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
