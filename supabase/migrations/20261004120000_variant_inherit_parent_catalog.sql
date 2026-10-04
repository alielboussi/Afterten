-- Variants inherit parent catalog image (when variant has none) and units-per-order settings.

drop function if exists public.resolve_outlet_order_line(text);

create or replace function public.resolve_outlet_order_line(p_line_id text)
returns table (
  catalog_product_id text,
  parent_product_id text,
  line_name text,
  line_uom text,
  line_unit_cost numeric,
  live_qty_gate_enabled boolean,
  is_variant boolean,
  line_units_per_order_unit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.product_id,
    p.product_id,
    p.name,
    p.uom,
    p.unit_cost,
    p.live_qty_gate_enabled,
    false,
    p.units_per_order_unit
  from public.products p
  where lower(p.product_id) = lower(p_line_id) and p.active = true
  union all
  select
    v.variant_id,
    v.product_id,
    v.name,
    v.uom,
    v.unit_cost,
    v.live_qty_gate_enabled,
    true,
    p.units_per_order_unit
  from public.product_variants v
  join public.products p on p.product_id = v.product_id
  where lower(v.variant_id) = lower(p_line_id) and v.active = true
  limit 1;
$$;

drop function if exists public.list_outlet_products();

create or replace function public.list_outlet_products()
returns table (
  product_id text,
  name text,
  uom text,
  unit_cost numeric,
  image_url text,
  live_qty_gate_enabled boolean,
  live_qty numeric,
  orderable boolean,
  qty_step numeric,
  min_order_qty numeric,
  max_order_qty numeric,
  units_per_order_unit numeric,
  units_per_order_uom text,
  has_variants boolean,
  variants jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.product_id,
    p.name,
    p.uom,
    p.unit_cost,
    p.image_url,
    p.live_qty_gate_enabled,
    case
      when p.live_qty_gate_enabled then coalesce(l.qty, 0)
      else null
    end as live_qty,
    case
      when p.has_variants then true
      when not p.live_qty_gate_enabled then true
      when coalesce(l.qty, 0) > 0 then true
      else false
    end as orderable,
    p.qty_step,
    p.min_order_qty,
    p.max_order_qty,
    p.units_per_order_unit,
    p.units_per_order_uom,
    p.has_variants,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'variant_id', v.variant_id,
            'name', v.name,
            'uom', v.uom,
            'unit_cost', v.unit_cost,
            'image_url', coalesce(nullif(trim(v.image_url), ''), nullif(trim(p.image_url), '')),
            'live_qty_gate_enabled', v.live_qty_gate_enabled,
            'live_qty',
              case
                when v.live_qty_gate_enabled then coalesce(vl.qty, 0)
                else null
              end,
            'orderable',
              case
                when not v.live_qty_gate_enabled then true
                when coalesce(vl.qty, 0) > 0 then true
                else false
              end,
            'qty_step', v.qty_step,
            'min_order_qty', v.min_order_qty,
            'max_order_qty', v.max_order_qty,
            'units_per_order_unit', p.units_per_order_unit,
            'units_per_order_uom', p.units_per_order_uom
          )
          order by v.sort_order, v.name
        )
        from public.product_variants v
        left join public.product_live_qty vl on vl.product_id = v.variant_id
        where v.product_id = p.product_id and v.active = true
      ),
      '[]'::jsonb
    ) as variants
  from public.products p
  left join public.product_live_qty l on l.product_id = p.product_id
  where p.active = true
    and public.is_outlet_app_user()
    and public.is_product_allowed_for_outlet(public.current_outlet_id(), p.product_id)
    and not public.is_rule_auto_added_product(p.product_id)
  order by p.sort_order, p.name;
$$;

revoke all on function public.list_outlet_products() from public;
grant execute on function public.list_outlet_products() to authenticated;
