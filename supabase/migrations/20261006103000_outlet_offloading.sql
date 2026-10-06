-- Outlet offloading (receive at branch), combined completed PDF bucket, stop mid-flow PDF webhooks.

alter table public.outlet_orders
  add column if not exists supervisor_accepted_alias text,
  add column if not exists offloading_checklist_completed_at timestamptz,
  add column if not exists offloader_name text,
  add column if not exists offloader_signature_path text,
  add column if not exists offloader_signed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'completed-orders',
  'completed-orders',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "completed orders outlet read own" on storage.objects;
create policy "completed orders outlet read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'completed-orders'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "completed orders supervisor read" on storage.objects;
create policy "completed orders supervisor read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'completed-orders' and public.is_approved_supervisor());

drop policy if exists "completed orders portal admin read" on storage.objects;
create policy "completed orders portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'completed-orders' and public.is_portal_admin());

-- Stop generating separate PDFs on accept / dispatch (single combined PDF at completion).
create or replace function public.dispatch_supervisor_approved_order_pdf(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

create or replace function public.dispatch_driver_handoff_pdf(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

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
  v_alias text;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select coalesce(
    nullif(trim(sp.alias), ''),
    nullif(trim(sp.email), ''),
    'Supervisor'
  )
  into v_alias
  from public.supervisor_profiles sp
  where sp.user_id = auth.uid();

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
    v_line_total := round(v_req_qty * coalesce(v_line.line_unit_cost, 0), 2);
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
    supervisor_accepted_alias = coalesce(v_alias, 'Supervisor'),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'accepted',
    'grand_total', v_grand
  );
end;
$$;

create or replace function public.complete_driver_handoff(
  p_order_id uuid,
  p_driver_id uuid,
  p_driver_signature_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.outlet_orders%rowtype;
  v_driver public.delivery_drivers%rowtype;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'accepted' then
    raise exception 'Order is not ready for driver handoff.';
  end if;

  if v_order.loading_checklist_completed_at is null then
    raise exception 'Complete the loading checklist first.';
  end if;

  select * into v_driver from public.delivery_drivers
  where id = p_driver_id and active = true;
  if not found then
    raise exception 'Driver not found.';
  end if;

  if p_driver_signature_path is null
     or trim(p_driver_signature_path) = ''
     or p_driver_signature_path not like ('driver-signatures/' || v_order.outlet_id || '/%') then
    raise exception 'A valid driver signature is required.';
  end if;

  update public.outlet_orders
  set
    driver_id = p_driver_id,
    driver_signature_path = trim(p_driver_signature_path),
    loaded_at = now(),
    status = 'loaded',
    updated_at = now()
  where id = p_order_id;

  perform public.dispatch_driver_loaded_notifications(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'loaded',
    'driver_name', v_driver.name
  );
end;
$$;

create or replace function public.list_outlet_offloading_orders()
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
          'grand_total', o.grand_total,
          'loaded_at', o.loaded_at,
          'offloading_checklist_completed_at', o.offloading_checklist_completed_at
        )
        order by o.loaded_at desc nulls last, o.created_at desc
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status = 'loaded'
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_outlet_offloading_orders() from public;
grant execute on function public.list_outlet_offloading_orders() to authenticated;

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
    'lines', v_lines
  );
end;
$$;

revoke all on function public.get_outlet_offloading_order_detail(uuid) from public;
grant execute on function public.get_outlet_offloading_order_detail(uuid) to authenticated;

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

revoke all on function public.confirm_outlet_offloading_checklist(uuid, uuid[]) from public;
grant execute on function public.confirm_outlet_offloading_checklist(uuid, uuid[]) to authenticated;

create or replace function public.complete_outlet_order(
  p_order_id uuid,
  p_offloader_name text,
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
  v_name text;
begin
  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  v_name := trim(coalesce(p_offloader_name, ''));
  if char_length(v_name) < 2 then
    raise exception 'Enter the receiver full name.';
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
    offloader_name = v_name,
    offloader_signature_path = trim(p_offloader_signature_path),
    offloader_signed_at = now(),
    completed_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'completed',
    'offloader_name', v_name
  );
end;
$$;

revoke all on function public.complete_outlet_order(uuid, text, text) from public;
grant execute on function public.complete_outlet_order(uuid, text, text) to authenticated;

create or replace function public.set_outlet_order_completed_pdf_path(
  p_order_id uuid,
  p_completed_pdf_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.outlet_orders
  set completed_pdf_path = p_completed_pdf_path, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.set_outlet_order_completed_pdf_path(uuid, text) from public;
grant execute on function public.set_outlet_order_completed_pdf_path(uuid, text) to service_role;
