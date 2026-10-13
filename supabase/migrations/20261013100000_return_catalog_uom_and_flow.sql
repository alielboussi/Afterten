-- Return-specific UOM on catalog, one product/variant per return, delivery-loading list hygiene.

alter table public.products
  add column if not exists return_units_per_order numeric not null default 1,
  add column if not exists return_units_per_order_uom text not null default 'pcs';

alter table public.product_variants
  add column if not exists return_units_per_order numeric,
  add column if not exists return_units_per_order_uom text;

comment on column public.products.return_units_per_order is
  'Physical units per return qty line (returns flow), e.g. 25 pies per tray.';
comment on column public.products.return_units_per_order_uom is
  'Label for return qty × return_units_per_order, e.g. pcs, bottles.';

alter table public.outlet_returns
  add column if not exists catalog_line_id text,
  add column if not exists parent_product_id text,
  add column if not exists line_name text,
  add column if not exists line_uom text,
  add column if not exists return_qty numeric,
  add column if not exists return_units_per_order numeric,
  add column if not exists return_units_per_order_uom text,
  add column if not exists is_variant boolean not null default false;

create or replace function public.resolve_outlet_return_line(p_line_id text)
returns table (
  parent_product_id text,
  catalog_line_id text,
  line_name text,
  line_uom text,
  return_units_per_order numeric,
  return_units_per_order_uom text,
  is_variant boolean,
  qty_step numeric
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
    p.return_units_per_order,
    p.return_units_per_order_uom,
    false,
    p.qty_step
  from public.products p
  where lower(p.product_id) = lower(p_line_id)
    and p.active = true
    and not p.has_variants
  union all
  select
    v.product_id,
    v.variant_id,
    v.name,
    v.uom,
    coalesce(v.return_units_per_order, p.return_units_per_order),
    coalesce(nullif(trim(v.return_units_per_order_uom), ''), p.return_units_per_order_uom),
    true,
    v.qty_step
  from public.product_variants v
  join public.products p on p.product_id = v.product_id
  where lower(v.variant_id) = lower(p_line_id)
    and v.active = true
    and p.active = true
  limit 1;
$$;

revoke all on function public.resolve_outlet_return_line(text) from public;
grant execute on function public.resolve_outlet_return_line(text) to authenticated;

create or replace function public.list_outlet_return_catalog()
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
    return '[]'::jsonb;
  end if;

  select ap.outlet_id into v_outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app';

  if v_outlet_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(row order by row->>'sort_key')
      from (
        select jsonb_build_object(
          'line_id', p.product_id,
          'parent_product_id', p.product_id,
          'name', p.name,
          'line_uom', p.uom,
          'return_units_per_order', p.return_units_per_order,
          'return_units_per_order_uom', p.return_units_per_order_uom,
          'image_url', p.image_url,
          'qty_step', p.qty_step,
          'is_variant', false,
          'sort_key', lpad(p.sort_order::text, 8, '0') || '|' || p.name
        ) as row
        from public.products p
        where p.active = true
          and not p.has_variants
          and not public.is_rule_auto_added_product(p.product_id)
          and public.is_product_allowed_for_outlet(v_outlet_id, p.product_id)
        union all
        select jsonb_build_object(
          'line_id', v.variant_id,
          'parent_product_id', p.product_id,
          'name', v.name,
          'line_uom', v.uom,
          'return_units_per_order', coalesce(v.return_units_per_order, p.return_units_per_order),
          'return_units_per_order_uom',
            coalesce(nullif(trim(v.return_units_per_order_uom), ''), p.return_units_per_order_uom),
          'image_url', coalesce(nullif(trim(v.image_url), ''), nullif(trim(p.image_url), '')),
          'qty_step', v.qty_step,
          'is_variant', true,
          'sort_key', lpad(p.sort_order::text, 8, '0') || '|' || lpad(v.sort_order::text, 8, '0') || '|' || v.name
        ) as row
        from public.products p
        join public.product_variants v on v.product_id = p.product_id and v.active = true
        where p.active = true
          and p.has_variants
          and not public.is_rule_auto_added_product(p.product_id)
          and public.is_product_allowed_for_outlet(v_outlet_id, p.product_id)
      ) lines
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_outlet_return_catalog() from public;
grant execute on function public.list_outlet_return_catalog() to authenticated;

drop function if exists public.submit_outlet_return(uuid, uuid, text, text, text);

create or replace function public.submit_outlet_return(
  p_return_id uuid,
  p_outlet_employee_id uuid,
  p_employee_passcode text,
  p_employee_signature_path text,
  p_photo_path text,
  p_catalog_line_id text,
  p_return_qty numeric
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
  v_return_number text;
  v_emp_name text;
  v_passcode_hash text;
  v_return_id uuid;
  v_line record;
  v_qty numeric;
begin
  perform public.assert_not_paused();

  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  select outlet_id, outlet_name into v_outlet_id, v_outlet_name
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  if p_return_id is null then
    raise exception 'Return id is required.';
  end if;

  if p_outlet_employee_id is null then
    raise exception 'Select an outlet employee.';
  end if;

  if p_employee_passcode is null or length(trim(p_employee_passcode)) < 4 then
    raise exception 'Enter the employee passcode (at least 4 characters).';
  end if;

  if p_catalog_line_id is null or trim(p_catalog_line_id) = '' then
    raise exception 'Select a product for this return.';
  end if;

  v_qty := p_return_qty;
  if v_qty is null or v_qty <= 0 then
    raise exception 'Enter a return quantity greater than zero.';
  end if;

  select * into v_line
  from public.resolve_outlet_return_line(trim(p_catalog_line_id));

  if v_line.catalog_line_id is null then
    raise exception 'Product not found or inactive.';
  end if;

  if not public.is_product_allowed_for_outlet(v_outlet_id, v_line.parent_product_id) then
    raise exception 'This product is not allowed for your outlet.';
  end if;

  if v_line.qty_step is not null and v_line.qty_step > 0 then
    if abs((v_qty / v_line.qty_step) - round(v_qty / v_line.qty_step)) > 0.000001 then
      raise exception 'Quantity must be in steps of %.', v_line.qty_step;
    end if;
  end if;

  select e.display_name, e.passcode_hash
  into v_emp_name, v_passcode_hash
  from public.outlet_employees e
  where e.id = p_outlet_employee_id
    and e.outlet_id = v_outlet_id
    and e.active = true;

  if v_emp_name is null or v_passcode_hash is null then
    raise exception 'Employee not found or inactive.';
  end if;

  if crypt(trim(p_employee_passcode), v_passcode_hash) <> v_passcode_hash then
    raise exception 'Incorrect passcode.';
  end if;

  if p_employee_signature_path is null
     or trim(p_employee_signature_path) = ''
     or p_employee_signature_path not like ('returns/' || v_outlet_id || '/%') then
    raise exception 'A valid employee signature is required.';
  end if;

  if p_photo_path is null
     or trim(p_photo_path) = ''
     or p_photo_path not like ('returns/' || v_outlet_id || '/%') then
    raise exception 'A return photo is required.';
  end if;

  insert into public.outlet_return_number_counter (id, next_sequence)
  values (1, 1)
  on conflict (id) do nothing;

  update public.outlet_return_number_counter
  set next_sequence = next_sequence + 1
  where id = 1
  returning next_sequence - 1 into v_seq;

  v_return_number := lpad(v_seq::text, 10, '0');
  v_return_id := p_return_id;

  insert into public.outlet_returns (
    id,
    return_number,
    outlet_id,
    outlet_name,
    status,
    photo_path,
    employee_signature_path,
    employee_name,
    outlet_employee_id,
    employee_signed_at,
    catalog_line_id,
    parent_product_id,
    line_name,
    line_uom,
    return_qty,
    return_units_per_order,
    return_units_per_order_uom,
    is_variant
  ) values (
    v_return_id,
    v_return_number,
    v_outlet_id,
    v_outlet_name,
    'submitted',
    trim(p_photo_path),
    trim(p_employee_signature_path),
    trim(v_emp_name),
    p_outlet_employee_id,
    now(),
    v_line.catalog_line_id,
    v_line.parent_product_id,
    v_line.line_name,
    v_line.line_uom,
    v_qty,
    v_line.return_units_per_order,
    v_line.return_units_per_order_uom,
    v_line.is_variant
  );

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'status', 'submitted'
  );
end;
$$;

revoke all on function public.submit_outlet_return(uuid, uuid, text, text, text, text, numeric) from public;
grant execute on function public.submit_outlet_return(uuid, uuid, text, text, text, text, numeric) to authenticated;

drop function if exists public.list_outlet_returns_for_app();

create or replace function public.list_outlet_returns_for_app()
returns table (
  id uuid,
  return_number text,
  status public.outlet_return_status,
  employee_name text,
  created_at timestamptz,
  photo_path text,
  line_name text,
  line_uom text,
  return_qty numeric,
  return_units_per_order numeric,
  return_units_per_order_uom text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
begin
  if public.is_portal_admin() then
    return;
  end if;

  select ap.outlet_id into v_outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app';

  if v_outlet_id is null then
    return;
  end if;

  return query
  select
    r.id,
    r.return_number,
    r.status,
    r.employee_name,
    r.created_at,
    r.photo_path,
    r.line_name,
    r.line_uom,
    r.return_qty,
    r.return_units_per_order,
    r.return_units_per_order_uom
  from public.outlet_returns r
  where r.outlet_id = v_outlet_id
  order by r.created_at desc
  limit 200;
end;
$$;

revoke all on function public.list_outlet_returns_for_app() from public;
grant execute on function public.list_outlet_returns_for_app() to authenticated;

create or replace function public.get_outlet_return_detail(p_return_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
  v_outlet_id text;
begin
  if p_return_id is null then
    raise exception 'Return id required.';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if public.is_outlet_app_user() then
    select public.current_outlet_id() into v_outlet_id;
    if v_row.outlet_id is distinct from v_outlet_id then
      raise exception 'Return not found.';
    end if;
  elsif public.is_approved_supervisor() or public.is_portal_admin() then
    null;
  else
    raise exception 'Not authorized.';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'return_number', v_row.return_number,
    'outlet_id', v_row.outlet_id,
    'outlet_name', v_row.outlet_name,
    'status', v_row.status,
    'employee_name', v_row.employee_name,
    'photo_path', v_row.photo_path,
    'employee_signature_path', v_row.employee_signature_path,
    'pdf_path', v_row.pdf_path,
    'created_at', v_row.created_at,
    'supervisor_accepted_at', v_row.supervisor_accepted_at,
    'supervisor_rejected_at', v_row.supervisor_rejected_at,
    'catalog_line_id', v_row.catalog_line_id,
    'parent_product_id', v_row.parent_product_id,
    'line_name', v_row.line_name,
    'line_uom', v_row.line_uom,
    'return_qty', v_row.return_qty,
    'return_units_per_order', v_row.return_units_per_order,
    'return_units_per_order_uom', v_row.return_units_per_order_uom,
    'is_variant', v_row.is_variant
  );
end;
$$;

-- Delivery loading: only orders still awaiting load (not yet dispatched).
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
    and o.archived_at is null
    and (p_status is null or o.status = p_status)
    and (
      p_status is distinct from 'accepted'::public.outlet_order_status
      or (o.status = 'accepted' and o.loaded_at is null)
    )
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
  limit 150;
$$;

-- Outlet view orders: en route only (hide accepted-before-dispatch and completed).
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
        order by o.loaded_at desc nulls last, o.created_at desc
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status = 'loaded'
      limit 100
    ),
    '[]'::jsonb
  );
end;
$$;
