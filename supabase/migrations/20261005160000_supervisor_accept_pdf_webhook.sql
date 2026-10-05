-- PDF buckets: explicit service_role write (some deployments need this for admin uploads).
-- Supervisor accept PDF + outlet place-order PDF use service role via the portal.

drop policy if exists "order pdfs service insert" on storage.objects;
create policy "order pdfs service insert"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'order-pdfs');

drop policy if exists "order pdfs service update" on storage.objects;
create policy "order pdfs service update"
  on storage.objects for update
  to service_role
  using (bucket_id = 'order-pdfs');

drop policy if exists "approved orders service insert" on storage.objects;
create policy "approved orders service insert"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'approved-orders');

drop policy if exists "approved orders service update" on storage.objects;
create policy "approved orders service update"
  on storage.objects for update
  to service_role
  using (bucket_id = 'approved-orders');

alter table public.order_notify_config
  add column if not exists approved_pdf_webhook_url text;

update public.order_notify_config
set
  approved_pdf_webhook_url = 'https://aftertentransfers.app/api/webhooks/supervisor-order-accepted',
  updated_at = now()
where id = 'default';

create or replace function public.dispatch_supervisor_approved_order_pdf(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select approved_pdf_webhook_url, webhook_secret
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

revoke all on function public.dispatch_supervisor_approved_order_pdf(uuid) from public;

-- Regenerate accept_supervisor_order (includes dispatch from 20261005150000 + PDF webhook).
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

  perform public.assert_supervisor_revision_manual_parents(p_order_id, p_items);

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

  perform public.dispatch_supervisor_approved_order_pdf(p_order_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'accepted',
    'grand_total', v_grand
  );
end;
$$;

revoke all on function public.accept_supervisor_order(uuid, jsonb) from public;
grant execute on function public.accept_supervisor_order(uuid, jsonb) to authenticated;
