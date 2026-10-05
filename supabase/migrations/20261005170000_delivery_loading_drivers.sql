-- Delivery drivers, loading checklist, driver handoff PDF, status -> loaded.

create table if not exists public.delivery_drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_drivers_name_len check (char_length(trim(name)) >= 2)
);

create index if not exists delivery_drivers_active_sort_idx
  on public.delivery_drivers (active, sort_order, name);

alter table public.delivery_drivers enable row level security;

alter table public.outlet_orders
  add column if not exists loading_checklist_completed_at timestamptz,
  add column if not exists driver_id uuid references public.delivery_drivers (id),
  add column if not exists driver_signature_path text,
  add column if not exists loaded_at timestamptz,
  add column if not exists handoff_pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-signatures',
  'driver-signatures',
  false,
  2097152,
  array['image/webp', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-handoffs',
  'driver-handoffs',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "driver signatures supervisor insert" on storage.objects;
create policy "driver signatures supervisor insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-signatures'
    and public.is_approved_supervisor()
  );

drop policy if exists "driver signatures supervisor read" on storage.objects;
create policy "driver signatures supervisor read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-signatures'
    and public.is_approved_supervisor()
  );

drop policy if exists "driver handoffs outlet read own" on storage.objects;
create policy "driver handoffs outlet read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-handoffs'
    and public.is_outlet_app_user()
    and (storage.foldername(name))[1] = public.current_outlet_id()
  );

drop policy if exists "driver handoffs supervisor read" on storage.objects;
create policy "driver handoffs supervisor read"
  on storage.objects for select to authenticated
  using (bucket_id = 'driver-handoffs' and public.is_approved_supervisor());

drop policy if exists "driver handoffs service insert" on storage.objects;
create policy "driver handoffs service insert"
  on storage.objects for insert to service_role
  with check (bucket_id = 'driver-handoffs');

drop policy if exists "driver handoffs service update" on storage.objects;
create policy "driver handoffs service update"
  on storage.objects for update to service_role
  using (bucket_id = 'driver-handoffs');

create or replace function public.list_delivery_drivers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', d.id, 'name', d.name)
      order by d.sort_order, d.name
    ),
    '[]'::jsonb
  )
  from public.delivery_drivers d
  where d.active = true;
$$;

revoke all on function public.list_delivery_drivers() from public;
grant execute on function public.list_delivery_drivers() to authenticated;

drop function if exists public.list_supervisor_orders(text, text);

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
  order by o.created_at desc;
$$;

revoke all on function public.list_supervisor_orders(text, text) from public;
grant execute on function public.list_supervisor_orders(text, text) to authenticated;

create or replace function public.get_delivery_loading_order_detail(p_order_id uuid)
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
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor approval required.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'accepted' then
    raise exception 'Only accepted orders can be loaded.';
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

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_row.id,
        'product_id', lower(v_row.product_id::text),
        'parent_product_id', v_resolved.parent_product_id,
        'is_auto', public.is_rule_auto_added_product(lower(v_row.product_id::text)),
        'name', v_row.name,
        'qty', v_row.qty,
        'uom', v_row.uom
      )
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id,
    'outlet_id', v_order.outlet_id,
    'outlet_name', v_order.outlet_name,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'loading_checklist_completed_at', v_order.loading_checklist_completed_at,
    'loaded_at', v_order.loaded_at,
    'lines', v_lines
  );
end;
$$;

revoke all on function public.get_delivery_loading_order_detail(uuid) from public;
grant execute on function public.get_delivery_loading_order_detail(uuid) to authenticated;

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

revoke all on function public.confirm_delivery_loading_checklist(uuid, uuid[]) from public;
grant execute on function public.confirm_delivery_loading_checklist(uuid, uuid[]) to authenticated;

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

  perform public.dispatch_driver_handoff_pdf(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'loaded',
    'driver_name', v_driver.name
  );
end;
$$;

revoke all on function public.complete_driver_handoff(uuid, uuid, text) from public;
grant execute on function public.complete_driver_handoff(uuid, uuid, text) to authenticated;

alter table public.order_notify_config
  add column if not exists driver_handoff_pdf_webhook_url text;

update public.order_notify_config
set
  driver_handoff_pdf_webhook_url = 'https://aftertentransfers.app/api/webhooks/driver-handoff-pdf',
  updated_at = now()
where id = 'default';

create or replace function public.dispatch_driver_handoff_pdf(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select driver_handoff_pdf_webhook_url, webhook_secret
  into v_url, v_secret
  from public.order_notify_config
  where id = 'default';

  if v_url is null or trim(v_url) = '' then
    return;
  end if;

  perform net.http_post(
    url := trim(v_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-order-notify-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('order_id', p_order_id)
  );
end;
$$;

revoke all on function public.dispatch_driver_handoff_pdf(uuid) from public;

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
          'loaded_at', o.loaded_at,
          'approved_pdf_path', o.approved_pdf_path,
          'handoff_pdf_path', o.handoff_pdf_path
        )
        order by
          case when o.status = 'loaded' then 0 else 1 end,
          o.supervisor_accepted_at desc nulls last,
          o.created_at desc
      )
      from public.outlet_orders o
      where o.outlet_id = v_outlet_id
        and o.status in ('accepted', 'loaded', 'completed')
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
  v_row record;
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

  if v_order.status not in ('accepted', 'loaded', 'completed') then
    raise exception 'Order not available.';
  end if;

  for v_row in
    select i.name, i.qty, i.uom, i.line_total, i.product_id, i.sort_order
    from public.outlet_order_items i
    where i.order_id = p_order_id
    order by i.sort_order
  loop
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'name', v_row.name,
        'qty', v_row.qty,
        'uom', v_row.uom,
        'line_total', v_row.line_total,
        'is_auto', public.is_rule_auto_added_product(lower(v_row.product_id::text))
      )
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'outlet_name', v_order.outlet_name,
    'status', v_order.status,
    'employee_name', v_order.employee_name,
    'grand_total', v_order.grand_total,
    'created_at', v_order.created_at,
    'supervisor_accepted_at', v_order.supervisor_accepted_at,
    'loaded_at', v_order.loaded_at,
    'approved_pdf_path', v_order.approved_pdf_path,
    'handoff_pdf_path', v_order.handoff_pdf_path,
    'lines', v_lines
  );
end;
$$;

revoke all on function public.get_outlet_accepted_order_detail(uuid) from public;
grant execute on function public.get_outlet_accepted_order_detail(uuid) to authenticated;
