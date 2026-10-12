-- Integration feeds: preserve outlet-placed line qty, dispatch time, signatures, received qty.

-- ---------------------------------------------------------------------------
-- Immutable snapshot of outlet-placed lines (before supervisor revision)
-- ---------------------------------------------------------------------------
create table if not exists public.outlet_order_placed_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.outlet_orders (id) on delete cascade,
  source_item_id uuid,
  product_id text not null,
  variant_key text not null default '',
  name text not null,
  uom text not null,
  unit_cost numeric(12, 2) not null default 0,
  qty numeric(12, 3) not null,
  units_per_order_unit numeric(12, 3) not null default 1,
  total_units numeric(12, 3) not null default 0,
  line_total numeric(12, 2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists outlet_order_placed_items_order_product_idx
  on public.outlet_order_placed_items (order_id, product_id, variant_key, sort_order);

create index if not exists outlet_order_placed_items_order_id_idx
  on public.outlet_order_placed_items (order_id);

alter table public.outlet_orders
  add column if not exists dispatched_at timestamptz,
  add column if not exists supervisor_dispatch_signature_path text;

alter table public.outlet_order_items
  add column if not exists qty_received numeric(12, 3);

comment on column public.outlet_order_placed_items.qty is
  'Qty when the outlet first placed the order (immutable after snapshot).';

-- ---------------------------------------------------------------------------
create or replace function public.ensure_order_placed_items_snapshot(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.outlet_order_placed_items where order_id = p_order_id) then
    return;
  end if;

  insert into public.outlet_order_placed_items (
    order_id,
    source_item_id,
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
  )
  select
    i.order_id,
    i.id,
    i.product_id,
    i.variant_key,
    i.name,
    i.uom,
    i.unit_cost,
    i.qty,
    i.units_per_order_unit,
    i.total_units,
    i.line_total,
    i.sort_order
  from public.outlet_order_items i
  where i.order_id = p_order_id;
end;
$$;

revoke all on function public.ensure_order_placed_items_snapshot(uuid) from public;
grant execute on function public.ensure_order_placed_items_snapshot(uuid) to service_role;

create or replace function public.trg_snapshot_placed_items_on_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'placed'::public.outlet_order_status
     and coalesce(new.grand_total, 0) > 0
     and (tg_op = 'UPDATE' or tg_op = 'INSERT')
  then
    perform public.ensure_order_placed_items_snapshot(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists outlet_orders_snapshot_placed_items on public.outlet_orders;
create trigger outlet_orders_snapshot_placed_items
  after insert or update of grand_total, status on public.outlet_orders
  for each row
  execute function public.trg_snapshot_placed_items_on_order_totals();

-- Backfill snapshots for existing orders (best-effort for orders never revised).
insert into public.outlet_order_placed_items (
  order_id, source_item_id, product_id, variant_key, name, uom, unit_cost,
  qty, units_per_order_unit, total_units, line_total, sort_order
)
select
  i.order_id, i.id, i.product_id, i.variant_key, i.name, i.uom, i.unit_cost,
  i.qty, i.units_per_order_unit, i.total_units, i.line_total, i.sort_order
from public.outlet_order_items i
where not exists (
  select 1 from public.outlet_order_placed_items p where p.order_id = i.order_id
);

-- Before supervisor replaces lines, snapshot outlet-placed qty (first delete wins).
create or replace function public.trg_snapshot_placed_lines_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_order_placed_items_snapshot(old.order_id);
  return old;
end;
$$;

drop trigger if exists outlet_order_items_snapshot_before_delete on public.outlet_order_items;
create trigger outlet_order_items_snapshot_before_delete
  before delete on public.outlet_order_items
  for each row
  execute function public.trg_snapshot_placed_lines_before_delete();

-- Driver handoff: record dispatch time + optional supervisor signature image path.
drop function if exists public.complete_driver_handoff(uuid, uuid, text);

create or replace function public.complete_driver_handoff(
  p_order_id uuid,
  p_driver_id uuid,
  p_driver_signature_path text,
  p_supervisor_signature_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.outlet_orders%rowtype;
  v_driver public.delivery_drivers%rowtype;
  v_now timestamptz := now();
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

  if p_supervisor_signature_path is not null
     and trim(p_supervisor_signature_path) <> ''
     and p_supervisor_signature_path not like ('signatures/' || v_order.outlet_id || '/%') then
    raise exception 'Invalid supervisor signature path.';
  end if;

  update public.outlet_orders
  set
    driver_id = p_driver_id,
    driver_name = trim(v_driver.name),
    driver_signature_path = trim(p_driver_signature_path),
    supervisor_dispatch_signature_path = nullif(trim(p_supervisor_signature_path), ''),
    loaded_at = v_now,
    dispatched_at = v_now,
    status = 'loaded',
    updated_at = v_now
  where id = p_order_id;

  perform public.dispatch_driver_loaded_notifications(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'loaded',
    'driver_name', v_driver.name,
    'dispatched_at', v_now
  );
end;
$$;

revoke all on function public.complete_driver_handoff(uuid, uuid, text, text) from public;
grant execute on function public.complete_driver_handoff(uuid, uuid, text, text) to authenticated;

-- Offloading: mark full receipt qty on confirmed lines.
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

  update public.outlet_order_items
  set qty_received = qty
  where order_id = p_order_id
    and id = any (coalesce(p_checked_item_ids, array[]::uuid[]));

  update public.outlet_orders
  set
    offloading_checklist_completed_at = now(),
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'ready_for_sign_off', true);
end;
$$;

-- Backfill dispatch time for loaded orders.
update public.outlet_orders
set dispatched_at = loaded_at
where dispatched_at is null
  and loaded_at is not null;
