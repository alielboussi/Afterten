-- Supervisor mobile app: pending approval + read all outlet orders when approved.

create table if not exists public.supervisor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  alias text,
  approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_profiles_alias_len check (
    alias is null or char_length(trim(alias)) between 1 and 48
  )
);

create index if not exists supervisor_profiles_approved_idx
  on public.supervisor_profiles (approved, created_at desc);

alter table public.supervisor_profiles enable row level security;

create or replace function public.is_supervisor_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supervisor_profiles sp
    where sp.user_id = auth.uid()
  )
  and not public.is_portal_admin();
$$;

create or replace function public.is_approved_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supervisor_profiles sp
    where sp.user_id = auth.uid()
      and sp.approved = true
  )
  and not public.is_portal_admin();
$$;

revoke all on function public.is_supervisor_app_user() from public;
grant execute on function public.is_supervisor_app_user() to authenticated;
revoke all on function public.is_approved_supervisor() from public;
grant execute on function public.is_approved_supervisor() to authenticated;

create policy "supervisor read own profile"
  on public.supervisor_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "orders read approved supervisors"
  on public.outlet_orders for select
  to authenticated
  using (public.is_approved_supervisor());

create policy "order items read approved supervisors"
  on public.outlet_order_items for select
  to authenticated
  using (
    public.is_approved_supervisor()
    and exists (
      select 1 from public.outlet_orders o
      where o.id = order_id
    )
  );

create or replace function public.register_supervisor_app_user()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.supervisor_profiles%rowtype;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard, not the supervisor app.';
  end if;

  select coalesce(auth.jwt()->>'email', '') into v_email;
  if v_email = '' then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if v_email is null or trim(v_email) = '' then
    raise exception 'Google account email is required.';
  end if;

  insert into public.supervisor_profiles (user_id, email, approved)
  values (auth.uid(), lower(trim(v_email)), false)
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'alias', v_row.alias,
    'approved', v_row.approved
  );
end;
$$;

revoke all on function public.register_supervisor_app_user() from public;
grant execute on function public.register_supervisor_app_user() to authenticated;

create or replace function public.get_supervisor_app_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.supervisor_profiles%rowtype;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard, not the supervisor app.';
  end if;

  select * into v_row
  from public.supervisor_profiles sp
  where sp.user_id = auth.uid();

  if v_row.user_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'alias', v_row.alias,
    'approved', v_row.approved
  );
end;
$$;

revoke all on function public.get_supervisor_app_profile() from public;
grant execute on function public.get_supervisor_app_profile() to authenticated;

create or replace function public.list_outlets_for_supervisor()
returns table (outlet_id text, outlet_name text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name
  from public.outlets o
  where o.active = true
    and public.is_approved_supervisor()
  order by o.name;
$$;

revoke all on function public.list_outlets_for_supervisor() from public;
grant execute on function public.list_outlets_for_supervisor() to authenticated;

create or replace function public.list_supervisor_orders(
  p_outlet_id text default null,
  p_query text default null
)
returns table (
  order_id uuid,
  outlet_id text,
  outlet_name text,
  order_number text,
  status public.outlet_order_status,
  employee_name text,
  grand_total numeric,
  created_at timestamptz
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
    o.created_at
  from public.outlet_orders o
  where public.is_approved_supervisor()
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
  limit 300;
$$;

revoke all on function public.list_supervisor_orders(text, text) from public;
grant execute on function public.list_supervisor_orders(text, text) to authenticated;

-- Stricter employee name on place order (signature path already required).
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
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  if p_employee_name is null or length(trim(p_employee_name)) < 2 then
    raise exception 'A valid order placed by name is required (at least 2 characters).';
  end if;

  if p_employee_signature_path is null
     or trim(p_employee_signature_path) = ''
     or p_employee_signature_path not like ('signatures/' || v_outlet_id || '/%') then
    raise exception 'A valid employee signature is required.';
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
        raise exception 'Product % is out of stock.', v_line.line_name;
      end if;
      if v_req_qty > v_live_qty then
        raise exception 'Only % units available for %.', v_live_qty, v_line.line_name;
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
