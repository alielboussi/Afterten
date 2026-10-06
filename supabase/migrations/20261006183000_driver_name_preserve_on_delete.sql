-- Preserve driver names on orders when a delivery_drivers row is deleted; snapshot on handoff.

update public.outlet_orders o
set
  driver_name = trim(d.name),
  updated_at = now()
from public.delivery_drivers d
where o.driver_id = d.id
  and (o.driver_name is null or trim(o.driver_name) = '');

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
    driver_name = trim(v_driver.name),
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

create or replace function public.snapshot_driver_name_before_driver_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.outlet_orders
  set
    driver_name = coalesce(nullif(trim(driver_name), ''), trim(OLD.name)),
    updated_at = now()
  where driver_id = OLD.id;
  return OLD;
end;
$$;

drop trigger if exists delivery_drivers_before_delete_snapshot on public.delivery_drivers;
create trigger delivery_drivers_before_delete_snapshot
before delete on public.delivery_drivers
for each row
execute function public.snapshot_driver_name_before_driver_delete();

alter table public.outlet_orders drop constraint if exists outlet_orders_driver_id_fkey;

alter table public.outlet_orders
  add constraint outlet_orders_driver_id_fkey
  foreign key (driver_id) references public.delivery_drivers (id)
  on delete set null;

create or replace function public.list_outlet_offloading_orders()
returns table (
  order_id uuid,
  order_number text,
  outlet_name text,
  status text,
  grand_total numeric,
  loaded_at timestamptz,
  offloading_checklist_completed_at timestamptz,
  driver_name text
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
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  select ap.outlet_id into v_outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  return query
  select
    o.id,
    o.order_number::text,
    o.outlet_name::text,
    o.status::text,
    o.grand_total,
    o.loaded_at,
    o.offloading_checklist_completed_at,
    coalesce(nullif(trim(o.driver_name), ''), d.name, '')::text
  from public.outlet_orders o
  left join public.delivery_drivers d on d.id = o.driver_id
  where o.outlet_id = v_outlet_id
    and o.status = 'loaded'::public.outlet_order_status
  order by o.loaded_at desc nulls last, o.created_at desc;
end;
$$;

revoke all on function public.list_outlet_offloading_orders() from public;
grant execute on function public.list_outlet_offloading_orders() to authenticated;
