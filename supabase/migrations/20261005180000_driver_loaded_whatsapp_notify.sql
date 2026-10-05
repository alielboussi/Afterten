-- WhatsApp alert when supervisor dispatches (driver handoff complete).

alter table public.order_notify_config
  add column if not exists driver_loaded_webhook_url text;

update public.order_notify_config
set
  driver_loaded_webhook_url = 'https://aftertentransfers.app/api/webhooks/driver-order-loaded',
  updated_at = now()
where id = 'default';

create or replace function public.dispatch_driver_loaded_notifications(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select driver_loaded_webhook_url, webhook_secret
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

revoke all on function public.dispatch_driver_loaded_notifications(uuid) from public;

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
  perform public.dispatch_driver_loaded_notifications(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'loaded',
    'driver_name', v_driver.name
  );
end;
$$;

revoke all on function public.complete_driver_handoff(uuid, uuid, text) from public;
grant execute on function public.complete_driver_handoff(uuid, uuid, text) to authenticated;
