-- Completed-order lists, status-filtered supervisor queries, phase-lock guards, indexes.

create index if not exists outlet_orders_status_created_idx
  on public.outlet_orders (status, created_at desc);

create index if not exists outlet_orders_outlet_status_loaded_idx
  on public.outlet_orders (outlet_id, status, loaded_at desc nulls last)
  where status in ('loaded', 'completed');

drop function if exists public.list_supervisor_orders(text, text);

create or replace function public.list_supervisor_orders(
  p_outlet_id text default null,
  p_query text default null,
  p_status public.outlet_order_status default null
)
returns table (
  order_id uuid,
  outlet_id text,
  outlet_name text,
  order_number text,
  status public.outlet_order_status,
  employee_name text,
  grand_total numeric,
  created_at timestamptz,
  loading_checklist_completed_at timestamptz,
  loaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.outlet_id,
    o.outlet_name,
    o.order_number,
    o.status,
    o.employee_name,
    o.grand_total,
    o.created_at,
    o.loading_checklist_completed_at,
    o.loaded_at
  from public.outlet_orders o
  where public.is_approved_supervisor()
    and (p_status is null or o.status = p_status)
    and (p_outlet_id is null or trim(p_outlet_id) = '' or o.outlet_id = trim(p_outlet_id))
    and (
      p_query is null
      or trim(p_query) = ''
      or o.order_number ilike ('%' || trim(p_query) || '%')
      or o.outlet_name ilike ('%' || trim(p_query) || '%')
      or coalesce(o.employee_name, '') ilike ('%' || trim(p_query) || '%')
      or o.grand_total::text ilike ('%' || trim(p_query) || '%')
      or to_char(o.created_at at time zone 'Africa/Lusaka', 'DD Mon YYYY') ilike ('%' || trim(p_query) || '%')
      or to_char(o.created_at at time zone 'Africa/Lusaka', 'YYYY-MM-DD') ilike ('%' || trim(p_query) || '%')
    )
  order by o.created_at desc
  limit 200;
$$;

revoke all on function public.list_supervisor_orders(text, text, public.outlet_order_status) from public;
grant execute on function public.list_supervisor_orders(text, text, public.outlet_order_status) to authenticated;

create or replace function public.list_supervisor_completed_orders(
  p_query text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(row_data)
      from (
        select jsonb_build_object(
          'order_id', o.id,
          'outlet_id', o.outlet_id,
          'outlet_name', o.outlet_name,
          'order_number', o.order_number,
          'grand_total', o.grand_total,
          'completed_at', o.completed_at
        ) as row_data
        from public.outlet_orders o
        where o.status = 'completed'
          and (
            p_query is null
            or trim(p_query) = ''
            or o.order_number ilike ('%' || trim(p_query) || '%')
            or o.outlet_name ilike ('%' || trim(p_query) || '%')
          )
        order by o.completed_at desc nulls last, o.created_at desc
        limit 150
      ) sub
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_supervisor_completed_orders(text) from public;
grant execute on function public.list_supervisor_completed_orders(text) to authenticated;

create or replace function public.list_outlet_completed_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
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

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'outlet_name', o.outlet_name,
          'grand_total', o.grand_total,
          'completed_at', o.completed_at
        )
        order by o.completed_at desc nulls last
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status = 'completed'
      limit 150
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_outlet_completed_orders() from public;
grant execute on function public.list_outlet_completed_orders() to authenticated;

-- View orders: in-flight only (not completed).
create or replace function public.list_outlet_accepted_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
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

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'outlet_name', o.outlet_name,
          'status', o.status,
          'employee_name', o.employee_name,
          'grand_total', o.grand_total,
          'created_at', o.created_at,
          'supervisor_accepted_at', o.supervisor_accepted_at,
          'loaded_at', o.loaded_at
        )
        order by
          case when o.status = 'loaded' then 0 else 1 end,
          o.supervisor_accepted_at desc nulls last,
          o.created_at desc
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status in ('accepted', 'loaded')
      limit 100
    ),
    '[]'::jsonb
  );
end;
$$;

-- Phase locks (no re-opening earlier steps).
create or replace function public.confirm_delivery_loading_checklist(
  p_order_id uuid,
  p_checked_item_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.outlet_orders%rowtype;
  v_expected int;
  v_checked int;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'accepted' then
    raise exception 'Only accepted orders can be loaded.';
  end if;

  if v_order.loading_checklist_completed_at is not null then
    raise exception 'Loading checklist is already confirmed and cannot be changed.';
  end if;

  select count(*)::int into v_expected
  from public.outlet_order_items
  where order_id = p_order_id;

  if v_expected = 0 then
    raise exception 'Order has no lines.';
  end if;

  select count(distinct c.id)::int into v_checked
  from unnest(coalesce(p_checked_item_ids, array[]::uuid[])) as cid(id)
  join public.outlet_order_items c on c.id = cid.id and c.order_id = p_order_id;

  if v_checked <> v_expected then
    raise exception 'There is an item not yet loaded';
  end if;

  update public.outlet_orders
  set
    loading_checklist_completed_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'ready_for_handoff', true);
end;
$$;

create or replace function public.confirm_outlet_offloading_checklist(
  p_order_id uuid,
  p_checked_item_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_order public.outlet_orders%rowtype;
  v_expected int;
  v_checked int;
begin
  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  select * into v_order
  from public.outlet_orders
  where id = p_order_id and outlet_id = v_outlet_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'loaded' then
    raise exception 'Order is not ready for offloading.';
  end if;

  if v_order.offloading_checklist_completed_at is not null then
    raise exception 'Receiving checklist is already confirmed and cannot be changed.';
  end if;

  select count(*)::int into v_expected
  from public.outlet_order_items
  where order_id = p_order_id;

  if v_expected = 0 then
    raise exception 'Order has no lines.';
  end if;

  select count(distinct c.id)::int into v_checked
  from unnest(coalesce(p_checked_item_ids, array[]::uuid[])) as cid(id)
  join public.outlet_order_items c on c.id = cid.id and c.order_id = p_order_id;

  if v_checked <> v_expected then
    raise exception 'There is an item not yet received';
  end if;

  update public.outlet_orders
  set
    offloading_checklist_completed_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'ready_for_sign_off', true);
end;
$$;

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
  v_order public.outlet_orders%rowtype;
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

  select * into v_order from public.outlet_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'placed' then
    raise exception 'Only placed orders can be revised.';
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

-- Deny direct client writes on orders (RPC-only lifecycle).
drop policy if exists "orders outlet update none" on public.outlet_orders;
create policy "orders outlet update none"
  on public.outlet_orders for update
  to authenticated
  using (false);

drop policy if exists "orders supervisor update none" on public.outlet_orders;
create policy "orders supervisor update none"
  on public.outlet_orders for update
  to authenticated
  using (false);

drop policy if exists "orders outlet insert none" on public.outlet_orders;
create policy "orders outlet insert none"
  on public.outlet_orders for insert
  to authenticated
  with check (false);

drop policy if exists "outlet order items client insert none" on public.outlet_order_items;
create policy "outlet order items client insert none"
  on public.outlet_order_items for insert
  to authenticated
  with check (false);

drop policy if exists "outlet order items client update none" on public.outlet_order_items;
create policy "outlet order items client update none"
  on public.outlet_order_items for update
  to authenticated
  using (false);

drop policy if exists "outlet order items client delete none" on public.outlet_order_items;
create policy "outlet order items client delete none"
  on public.outlet_order_items for delete
  to authenticated
  using (false);
