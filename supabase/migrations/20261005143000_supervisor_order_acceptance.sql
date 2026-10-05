-- Supervisor order review/acceptance, approved PDF bucket, outlet view of accepted orders.

alter table public.outlet_orders
  add column if not exists supervisor_accepted_at timestamptz,
  add column if not exists approved_pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'approved-orders',
  'approved-orders',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "approved orders outlet read own" on storage.objects;
create policy "approved orders outlet read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'approved-orders'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "approved orders supervisor read" on storage.objects;
create policy "approved orders supervisor read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'approved-orders' and public.is_approved_supervisor());

drop policy if exists "approved orders portal admin read" on storage.objects;
create policy "approved orders portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'approved-orders' and public.is_portal_admin());

create or replace function public.list_product_variants_for_supervisor(p_parent_product_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', lower(v.variant_id::text),
        'name', v.name,
        'uom', v.uom,
        'unit_cost', v.unit_cost
      )
      order by v.sort_order nulls last, v.name
    ),
    '[]'::jsonb
  )
  from public.product_variants v
  join public.products p on p.product_id = v.product_id
  where public.is_approved_supervisor()
    and lower(p.product_id) = lower(trim(p_parent_product_id))
    and p.active = true
    and v.active = true;
$$;

revoke all on function public.list_product_variants_for_supervisor(text) from public;
grant execute on function public.list_product_variants_for_supervisor(text) to authenticated;

create or replace function public.preview_supervisor_order_revision(p_items jsonb)
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := lower(coalesce(v_item->>'product_id', ''));
    if public.is_rule_auto_added_product(v_pid) then
      raise exception 'Auto-added products cannot be edited directly.';
    end if;
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

revoke all on function public.preview_supervisor_order_revision(jsonb) from public;
grant execute on function public.preview_supervisor_order_revision(jsonb) to authenticated;

create or replace function public.get_supervisor_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.outlet_orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_row record;
  v_resolved record;
  v_variants jsonb;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
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

    v_variants := '[]'::jsonb;
    if coalesce(v_resolved.is_variant, false) or (
      v_resolved.parent_product_id is not null
      and exists (
        select 1 from public.products p
        where lower(p.product_id) = lower(v_resolved.parent_product_id)
          and p.has_variants = true
      )
    ) then
      v_variants := public.list_product_variants_for_supervisor(v_resolved.parent_product_id);
    end if;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_row.id,
        'product_id', lower(v_row.product_id::text),
        'parent_product_id', v_resolved.parent_product_id,
        'is_variant', coalesce(v_resolved.is_variant, false),
        'is_auto', public.is_rule_auto_added_product(lower(v_row.product_id::text)),
        'name', v_row.name,
        'qty', v_row.qty,
        'uom', v_row.uom,
        'unit_cost', v_row.unit_cost,
        'line_total', v_row.line_total,
        'units_per_order_unit', v_row.units_per_order_unit,
        'total_units', v_row.total_units,
        'variants', v_variants
      )
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id,
    'outlet_id', v_order.outlet_id,
    'outlet_name', v_order.outlet_name,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'employee_name', v_order.employee_name,
    'grand_total', v_order.grand_total,
    'created_at', v_order.created_at,
    'approved_pdf_path', v_order.approved_pdf_path,
    'lines', v_lines
  );
end;
$$;

revoke all on function public.get_supervisor_order_detail(uuid) from public;
grant execute on function public.get_supervisor_order_detail(uuid) to authenticated;

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
          'approved_pdf_path', o.approved_pdf_path
        )
        order by o.supervisor_accepted_at desc nulls last, o.created_at desc
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status = 'accepted'
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_outlet_accepted_orders() from public;
grant execute on function public.list_outlet_accepted_orders() to authenticated;

create or replace function public.get_outlet_accepted_order_detail(p_order_id uuid)
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
begin
  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  select * into v_order
  from public.outlet_orders
  where id = p_order_id and outlet_id = v_outlet_id and status = 'accepted';

  if not found then
    raise exception 'Order not found.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', i.name,
        'qty', i.qty,
        'uom', i.uom,
        'line_total', i.line_total,
        'is_auto', public.is_rule_auto_added_product(lower(i.product_id::text))
      )
      order by i.sort_order
    ),
    '[]'::jsonb
  ) into v_lines
  from public.outlet_order_items i
  where i.order_id = p_order_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'outlet_name', v_order.outlet_name,
    'employee_name', v_order.employee_name,
    'grand_total', v_order.grand_total,
    'created_at', v_order.created_at,
    'supervisor_accepted_at', v_order.supervisor_accepted_at,
    'approved_pdf_path', v_order.approved_pdf_path,
    'lines', v_lines
  );
end;
$$;

revoke all on function public.get_outlet_accepted_order_detail(uuid) from public;
grant execute on function public.get_outlet_accepted_order_detail(uuid) to authenticated;

create or replace function public.set_outlet_order_approved_pdf_path(
  p_order_id uuid,
  p_approved_pdf_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Admin only.';
  end if;
  update public.outlet_orders
  set approved_pdf_path = p_approved_pdf_path, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.set_outlet_order_approved_pdf_path(uuid, text) from public;
grant execute on function public.set_outlet_order_approved_pdf_path(uuid, text) to service_role;
