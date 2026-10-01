-- Afterten outlet orders (Supabase) — core schema + RLS + RPCs
-- Run in Supabase SQL Editor or: node scripts/supabase/apply-migration.mjs

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Outlets & profiles (links auth.users → outlet)
-- ---------------------------------------------------------------------------
create table if not exists public.outlets (
  id text primary key,
  name text not null,
  active boolean not null default true,
  uses_orders_app boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  outlet_id text not null references public.outlets (id),
  outlet_name text not null,
  roles text[] not null default array['branch']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_profiles_outlet_id_idx on public.app_profiles (outlet_id);

-- ---------------------------------------------------------------------------
-- Catalog (denormalized lines per outlet — good for ~50–200 lines/outlet)
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_lines (
  id text primary key,
  outlet_id text not null references public.outlets (id) on delete cascade,
  product_id text not null,
  variant_key text not null default '',
  name text not null,
  uom text not null default 'pc',
  unit_cost numeric(12, 2) not null default 0,
  image_url text,
  has_variations boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (outlet_id, product_id, variant_key)
);

create index if not exists catalog_lines_outlet_active_idx
  on public.catalog_lines (outlet_id, active, sort_order);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create type public.outlet_order_status as enum (
  'placed',
  'accepted',
  'loaded',
  'completed'
);

create table if not exists public.outlet_order_counters (
  outlet_id text primary key references public.outlets (id) on delete cascade,
  next_sequence bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.outlet_orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id text not null references public.outlets (id),
  outlet_name text not null,
  order_number text not null,
  status public.outlet_order_status not null default 'placed',
  employee_name text,
  employee_signature_path text,
  employee_signed_at timestamptz,
  driver_name text,
  driver_signature_path text,
  driver_signed_at timestamptz,
  grand_total numeric(12, 2) not null default 0,
  pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outlet_id, order_number)
);

create index if not exists outlet_orders_outlet_status_created_idx
  on public.outlet_orders (outlet_id, status, created_at desc);

create table if not exists public.outlet_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.outlet_orders (id) on delete cascade,
  product_id text not null,
  variant_key text not null default '',
  name text not null,
  uom text not null,
  unit_cost numeric(12, 2) not null,
  qty numeric(12, 3) not null,
  line_total numeric(12, 2) not null,
  sort_order int not null default 0
);

create index if not exists outlet_order_items_order_id_idx on public.outlet_order_items (order_id);

-- ---------------------------------------------------------------------------
-- Maintenance flag (soft pause — no GCP-style billing disable needed)
-- ---------------------------------------------------------------------------
create table if not exists public.system_config (
  id text primary key default 'default',
  operational_pause boolean not null default false,
  pause_message text not null default 'Afterten Orders is temporarily unavailable.',
  updated_at timestamptz not null default now()
);

insert into public.system_config (id) values ('default')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_outlet_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select outlet_id from public.app_profiles
  where user_id = auth.uid() and active = true
  limit 1;
$$;

create or replace function public.assert_not_paused()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  paused boolean;
  msg text;
begin
  select operational_pause, pause_message into paused, msg
  from public.system_config where id = 'default';
  if paused then
    raise exception '%', coalesce(nullif(trim(msg), ''), 'Afterten Orders is temporarily unavailable.');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.outlets enable row level security;
alter table public.app_profiles enable row level security;
alter table public.catalog_lines enable row level security;
alter table public.outlet_orders enable row level security;
alter table public.outlet_order_items enable row level security;
alter table public.system_config enable row level security;
alter table public.outlet_order_counters enable row level security;

create policy "profiles read own"
  on public.app_profiles for select
  using (auth.uid() = user_id);

create policy "outlets read own"
  on public.outlets for select
  using (id = public.current_outlet_id());

create policy "catalog read own outlet"
  on public.catalog_lines for select
  using (outlet_id = public.current_outlet_id() and active = true);

create policy "orders read own outlet"
  on public.outlet_orders for select
  using (outlet_id = public.current_outlet_id());

create policy "order items read own outlet"
  on public.outlet_order_items for select
  using (
    exists (
      select 1 from public.outlet_orders o
      where o.id = order_id and o.outlet_id = public.current_outlet_id()
    )
  );

create policy "system config read authenticated"
  on public.system_config for select
  to authenticated
  using (true);

-- Writes via RPC / service role only (no direct client inserts on orders)
-- ---------------------------------------------------------------------------
-- RPC: place order (atomic number + lines)
-- ---------------------------------------------------------------------------
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
begin
  perform public.assert_not_paused();

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
    v_line_total := round(
      (v_item->>'unit_cost')::numeric * (v_item->>'qty')::numeric,
      2
    );
    v_grand := v_grand + v_line_total;
    insert into public.outlet_order_items (
      order_id, product_id, variant_key, name, uom, unit_cost, qty, line_total, sort_order
    ) values (
      v_order_id,
      coalesce(v_item->>'product_id', 'line'),
      coalesce(v_item->>'variant_key', ''),
      v_item->>'name',
      coalesce(v_item->>'uom', 'pc'),
      (v_item->>'unit_cost')::numeric,
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
