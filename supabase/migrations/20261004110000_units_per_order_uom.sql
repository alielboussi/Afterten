-- Label for qty × units_per_order_unit (e.g. pcs, bottles) shown on outlet app.

alter table public.products
  add column if not exists units_per_order_uom text not null default 'pcs';

alter table public.product_variants
  add column if not exists units_per_order_uom text not null default 'pcs';

comment on column public.products.units_per_order_uom is
  'UOM label for total physical units (qty × units_per_order_unit), e.g. pcs, bottles.';

comment on column public.product_variants.units_per_order_uom is
  'Same as products.units_per_order_uom for variant lines.';

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
            'image_url', v.image_url,
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
            'units_per_order_unit', v.units_per_order_unit,
            'units_per_order_uom', v.units_per_order_uom
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
