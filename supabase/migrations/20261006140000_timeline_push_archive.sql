-- Completed order timeline RPC, outlet push tokens, offload-ready webhook, archive support.

alter table public.outlet_orders
  add column if not exists archived_at timestamptz;

create index if not exists outlet_orders_completed_active_idx
  on public.outlet_orders (completed_at desc nulls last)
  where status = 'completed' and archived_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'completed-orders-archive',
  'completed-orders-archive',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "completed archive supervisor read" on storage.objects;
create policy "completed archive supervisor read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'completed-orders-archive' and public.is_approved_supervisor());

drop policy if exists "completed archive portal admin read" on storage.objects;
create policy "completed archive portal admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'completed-orders-archive' and public.is_portal_admin());

create table if not exists public.outlet_push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  outlet_id text not null references public.outlets (id),
  expo_push_token text not null,
  platform text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

create index if not exists outlet_push_tokens_outlet_active_idx
  on public.outlet_push_tokens (outlet_id, active)
  where active = true;

alter table public.outlet_push_tokens enable row level security;

drop policy if exists "outlet push tokens own" on public.outlet_push_tokens;
create policy "outlet push tokens own"
  on public.outlet_push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.register_outlet_push_token(
  p_expo_push_token text,
  p_platform text default null
)
returns jsonb
language plpgsql
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

  if p_expo_push_token is null or length(trim(p_expo_push_token)) < 8 then
    raise exception 'Invalid push token.';
  end if;

  insert into public.outlet_push_tokens (user_id, outlet_id, expo_push_token, platform, active)
  values (auth.uid(), v_outlet_id, trim(p_expo_push_token), nullif(trim(p_platform), ''), true)
  on conflict (user_id, expo_push_token) do update
  set outlet_id = excluded.outlet_id,
      platform = excluded.platform,
      active = true,
      updated_at = now();

  return jsonb_build_object('ok', true, 'outlet_id', v_outlet_id);
end;
$$;

revoke all on function public.register_outlet_push_token(text, text) from public;
grant execute on function public.register_outlet_push_token(text, text) to authenticated;

alter table public.order_notify_config
  add column if not exists outlet_offload_ready_webhook_url text;

update public.order_notify_config
set
  outlet_offload_ready_webhook_url = 'https://aftertentransfers.app/api/webhooks/outlet-order-ready-offload',
  updated_at = now()
where id = 'default';

create or replace function public.dispatch_outlet_offload_ready_push(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select outlet_offload_ready_webhook_url, webhook_secret
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

revoke all on function public.dispatch_outlet_offload_ready_push(uuid) from public;

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
  perform public.dispatch_outlet_offload_ready_push(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'loaded',
    'driver_name', v_driver.name
  );
end;
$$;

create or replace function public.get_completed_order_timeline(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_order public.outlet_orders%rowtype;
  v_driver_name text;
begin
  if public.is_approved_supervisor() then
    null;
  elsif public.is_outlet_app_user() then
    select outlet_id into v_outlet_id
    from public.app_profiles
    where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';
    if v_outlet_id is null then
      raise exception 'No outlet profile for this account.';
    end if;
  else
    raise exception 'Access denied.';
  end if;

  select * into v_order from public.outlet_orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'Order is not completed.';
  end if;

  if v_outlet_id is not null and v_order.outlet_id <> v_outlet_id then
    raise exception 'Order not found.';
  end if;

  select d.name into v_driver_name
  from public.delivery_drivers d
  where d.id = v_order.driver_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'outlet_name', v_order.outlet_name,
    'grand_total', v_order.grand_total,
    'placed_at', v_order.created_at,
    'placed_by', v_order.employee_name,
    'accepted_at', v_order.supervisor_accepted_at,
    'accepted_by', coalesce(v_order.supervisor_accepted_alias, 'Supervisor'),
    'dispatched_at', v_order.loaded_at,
    'dispatched_by', coalesce(v_driver_name, 'Driver'),
    'received_at', v_order.completed_at,
    'received_by', v_order.offloader_name
  );
end;
$$;

revoke all on function public.get_completed_order_timeline(uuid) from public;
grant execute on function public.get_completed_order_timeline(uuid) to authenticated;

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
      select jsonb_agg(row_data)
      from (
        select jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'outlet_name', o.outlet_name,
          'grand_total', o.grand_total,
          'completed_at', o.completed_at
        ) as row_data
        from public.outlet_orders o
        where o.outlet_id = v_outlet_id
          and o.status = 'completed'
          and o.archived_at is null
          and o.completed_at >= (now() - interval '90 days')
        order by o.completed_at desc nulls last
        limit 150
      ) sub
    ),
    '[]'::jsonb
  );
end;
$$;

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
          and o.archived_at is null
          and o.completed_at >= (now() - interval '90 days')
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

create or replace function public.archive_completed_orders_batch(p_limit int default 40)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_archived int := 0;
begin
  select coalesce(array_agg(id), array[]::uuid[])
  into v_ids
  from (
    select o.id
    from public.outlet_orders o
    where o.status = 'completed'
      and o.archived_at is null
      and o.completed_at < (now() - interval '90 days')
    order by o.completed_at asc
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) s;

  foreach v_id in array v_ids
  loop
    update public.outlet_orders
    set archived_at = now(), updated_at = now()
    where id = v_id;
    v_archived := v_archived + 1;
  end loop;

  return jsonb_build_object('archived_count', v_archived, 'order_ids', v_ids);
end;
$$;

revoke all on function public.archive_completed_orders_batch(int) from public;
grant execute on function public.archive_completed_orders_batch(int) to service_role;
