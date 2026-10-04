-- Preview order number + catalog lookup for mobile order summary (rules / auto-add lines).

create or replace function public.preview_outlet_order_number()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_outlet_name text;
  v_seq bigint;
  v_prefix text;
begin
  if public.is_portal_admin() then
    return null;
  end if;

  select outlet_id, outlet_name into v_outlet_id, v_outlet_name
  from public.app_profiles
  where user_id = auth.uid() and active = true;

  if v_outlet_id is null then
    return null;
  end if;

  select c.next_sequence into v_seq
  from public.outlet_order_counters c
  where c.outlet_id = v_outlet_id;

  if v_seq is null then
    v_seq := 1;
  end if;

  v_prefix := upper(regexp_replace(v_outlet_name, '[^a-zA-Z0-9]', '', 'g'));
  if v_prefix = '' then
    v_prefix := 'OUTLET';
  end if;

  return v_prefix || '-' || lpad(v_seq::text, 10, '0');
end;
$$;

revoke all on function public.preview_outlet_order_number() from public;
grant execute on function public.preview_outlet_order_number() to authenticated;

create or replace function public.list_outlet_order_rules()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'trigger_product_id', lower(r.trigger_product_id),
        'added_product_id', lower(a.added_product_id),
        'qty_per_trigger_unit', a.qty_per_trigger_unit
      )
      order by r.sort_order, r.name, a.sort_order
    ),
    '[]'::jsonb
  )
  from public.product_order_rules r
  join public.product_order_rule_additions a on a.rule_id = r.id
  where r.active = true;
$$;

revoke all on function public.list_outlet_order_rules() from public;
grant execute on function public.list_outlet_order_rules() to authenticated;

create or replace function public.resolve_catalog_products(p_product_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', lower(p.product_id),
        'name', p.name,
        'uom', p.uom,
        'unit_cost', p.unit_cost,
        'units_per_order_unit', p.units_per_order_unit,
        'units_per_order_uom', p.units_per_order_uom
      )
    ),
    '[]'::jsonb
  )
  from public.products p
  where p.active = true
    and lower(p.product_id) = any (
      select lower(unnest(p_product_ids))
    );
$$;

revoke all on function public.resolve_catalog_products(text[]) from public;
grant execute on function public.resolve_catalog_products(text[]) to authenticated;
