-- Match outlet/supervisor app rule expansion: variant triggers parent rules, single pass (no feedback loop).

create or replace function public.expand_order_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual_map jsonb := '{}'::jsonb;
  v_final_map jsonb;
  v_item jsonb;
  v_pid text;
  v_qty numeric;
  v_rule record;
  v_add record;
  v_trigger_qty numeric;
  v_variant_qty numeric;
  v_added numeric;
  v_result jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    return '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := lower(trim(coalesce(v_item->>'product_id', '')));
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_pid = '' or v_qty <= 0 then
      continue;
    end if;
    v_manual_map := v_manual_map || jsonb_build_object(
      v_pid,
      coalesce((v_manual_map->>v_pid)::numeric, 0) + v_qty
    );
  end loop;

  v_final_map := v_manual_map;

  for v_rule in
    select r.id, r.trigger_product_id
    from public.product_order_rules r
    where r.active = true
    order by r.sort_order, r.name
  loop
    v_trigger_qty := coalesce((v_manual_map->>lower(v_rule.trigger_product_id))::numeric, 0);

    select coalesce(sum((v_manual_map->>lower(v.variant_id))::numeric), 0)
    into v_variant_qty
    from public.product_variants v
    where lower(v.product_id) = lower(v_rule.trigger_product_id)
      and v_manual_map ? lower(v.variant_id);

    v_trigger_qty := v_trigger_qty + coalesce(v_variant_qty, 0);

    if v_trigger_qty <= 0 then
      continue;
    end if;

    for v_add in
      select a.added_product_id, a.qty_per_trigger_unit
      from public.product_order_rule_additions a
      where a.rule_id = v_rule.id
      order by a.sort_order
    loop
      v_added := v_trigger_qty * v_add.qty_per_trigger_unit;
      if v_added <= 0 then
        continue;
      end if;
      v_final_map := v_final_map || jsonb_build_object(
        lower(v_add.added_product_id),
        coalesce((v_final_map->>lower(v_add.added_product_id))::numeric, 0) + v_added
      );
    end loop;
  end loop;

  select coalesce(
    jsonb_agg(jsonb_build_object('product_id', k, 'qty', (v_final_map->>k)::numeric)),
    '[]'::jsonb
  )
  into v_result
  from jsonb_object_keys(v_final_map) as k;

  return v_result;
end;
$$;

revoke all on function public.expand_order_items(jsonb) from public;
grant execute on function public.expand_order_items(jsonb) to authenticated;
