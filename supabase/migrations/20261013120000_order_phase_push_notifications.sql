-- Phase push notifications (outlet + supervisor) via portal /api/webhooks/phase-push.

alter table public.order_notify_config
  add column if not exists phase_push_webhook_url text;

update public.order_notify_config
set
  phase_push_webhook_url = 'https://aftertentransfers.app/api/webhooks/phase-push',
  updated_at = now()
where id = 'default';

create or replace function public.dispatch_phase_push(
  p_event text,
  p_order_id uuid default null,
  p_return_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_event is null or trim(p_event) = '' then
    return;
  end if;

  select phase_push_webhook_url, webhook_secret
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
    body := jsonb_build_object(
      'event', trim(p_event),
      'order_id', p_order_id,
      'return_id', p_return_id
    )
  );
end;
$$;

revoke all on function public.dispatch_phase_push(text, uuid, uuid) from public;

create or replace function public.trg_outlet_orders_phase_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'accepted'::public.outlet_order_status
       and old.status = 'placed'::public.outlet_order_status then
      perform public.dispatch_phase_push('outlet_order_accepted', new.id, null);
    elsif new.status = 'loaded'::public.outlet_order_status
       and old.status = 'accepted'::public.outlet_order_status then
      perform public.dispatch_outlet_offload_ready_push(new.id);
      perform public.dispatch_phase_push('supervisor_order_dispatched', new.id, null);
    elsif new.status = 'completed'::public.outlet_order_status
       and old.status = 'loaded'::public.outlet_order_status then
      perform public.dispatch_phase_push('supervisor_order_completed', new.id, null);
    end if;
  end if;

  if old.loading_checklist_completed_at is null
     and new.loading_checklist_completed_at is not null then
    perform public.dispatch_phase_push('supervisor_loading_checklist_done', new.id, null);
  end if;

  if old.offloading_checklist_completed_at is null
     and new.offloading_checklist_completed_at is not null then
    perform public.dispatch_phase_push('supervisor_offloading_checklist_done', new.id, null);
  end if;

  return new;
end;
$$;

drop trigger if exists outlet_orders_phase_push on public.outlet_orders;
create trigger outlet_orders_phase_push
  after update on public.outlet_orders
  for each row
  execute function public.trg_outlet_orders_phase_push();

create or replace function public.trg_outlet_returns_phase_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'submitted'::public.outlet_return_status then
    perform public.dispatch_phase_push('supervisor_return_submitted', null, new.id);
  elsif tg_op = 'UPDATE'
    and old.status = 'submitted'::public.outlet_return_status
    and new.status in ('accepted'::public.outlet_return_status, 'rejected'::public.outlet_return_status) then
    perform public.dispatch_phase_push('outlet_return_decided', null, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists outlet_returns_phase_push on public.outlet_returns;
create trigger outlet_returns_phase_push
  after insert or update on public.outlet_returns
  for each row
  execute function public.trg_outlet_returns_phase_push();
