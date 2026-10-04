-- Max order qty over a rolling day window (per outlet, per catalog line).

alter table public.products
  add column if not exists max_order_qty_days integer
  check (max_order_qty_days is null or max_order_qty_days > 0);

alter table public.product_variants
  add column if not exists max_order_qty_days integer
  check (max_order_qty_days is null or max_order_qty_days > 0);

comment on column public.products.max_order_qty_days is
  'When set with max_order_qty: max total qty this outlet may order in this many rolling days.';

comment on column public.product_variants.max_order_qty_days is
  'Same as products.max_order_qty_days for variant lines.';

create or replace function public.outlet_ordered_qty_in_window(
  p_outlet_id text,
  p_catalog_product_id text,
  p_days integer
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(i.qty), 0)::numeric
  from public.outlet_order_items i
  join public.outlet_orders o on o.id = i.order_id
  where o.outlet_id = p_outlet_id
    and lower(i.product_id) = lower(p_catalog_product_id)
    and o.created_at >= now() - make_interval(days => p_days);
$$;

revoke all on function public.outlet_ordered_qty_in_window(text, text, integer) from public;
grant execute on function public.outlet_ordered_qty_in_window(text, text, integer) to authenticated;

create or replace function public.validate_product_order_qty(p_product_id text, p_qty numeric)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_step numeric;
  v_min numeric;
  v_max numeric;
  v_max_days integer;
  v_name text;
  v_outlet text;
  v_prior numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select p.qty_step, p.min_order_qty, p.max_order_qty, p.max_order_qty_days, p.name
  into v_step, v_min, v_max, v_max_days, v_name
  from public.products p
  where lower(p.product_id) = lower(p_product_id) and p.active = true;

  if not found then
    select v.qty_step, v.min_order_qty, v.max_order_qty, v.max_order_qty_days, v.name
    into v_step, v_min, v_max, v_max_days, v_name
    from public.product_variants v
    where lower(v.variant_id) = lower(p_product_id) and v.active = true;

    if not found then
      raise exception 'Unknown or inactive product: %', p_product_id;
    end if;
  end if;

  if v_min is not null and p_qty < v_min then
    raise exception 'Minimum order for % is %.', v_name, v_min;
  end if;

  if v_max is not null and v_max_days is not null and v_max_days > 0 then
    v_outlet := public.current_outlet_id();
    if v_outlet is null then
      raise exception 'No outlet profile for this account.';
    end if;
    v_prior := public.outlet_ordered_qty_in_window(v_outlet, p_product_id, v_max_days);
    if v_prior + p_qty > v_max then
      raise exception
        'Maximum for % is % per % day(s). Already ordered % in that period (requested %).',
        v_name, v_max, v_max_days, v_prior, p_qty;
    end if;
  elsif v_max is not null and p_qty > v_max then
    raise exception 'Maximum order for % is %.', v_name, v_max;
  end if;

  if mod(p_qty, v_step) <> 0 then
    raise exception 'Quantity for % must change in steps of %.', v_name, v_step;
  end if;
end;
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
  max_order_qty_days integer,
  window_ordered_qty numeric,
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
  with outlet as (
    select public.current_outlet_id() as outlet_id
  )
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
    end
    and (
      p.max_order_qty is null
      or p.max_order_qty_days is null
      or (
        select coalesce(sum(i.qty), 0)
        from public.outlet_order_items i
        join public.outlet_orders o on o.id = i.order_id
        cross join outlet ou
        where ou.outlet_id is not null
          and o.outlet_id = ou.outlet_id
          and lower(i.product_id) = lower(p.product_id)
          and o.created_at >= now() - make_interval(days => p.max_order_qty_days)
      ) < p.max_order_qty
    ) as orderable,
    p.qty_step,
    p.min_order_qty,
    p.max_order_qty,
    p.max_order_qty_days,
    case
      when p.max_order_qty is not null
        and p.max_order_qty_days is not null
        and (select outlet_id from outlet) is not null
      then public.outlet_ordered_qty_in_window(
        (select outlet_id from outlet),
        p.product_id,
        p.max_order_qty_days
      )
      else null
    end as window_ordered_qty,
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
              end
              and (
                v.max_order_qty is null
                or v.max_order_qty_days is null
                or (
                  select coalesce(sum(i.qty), 0)
                  from public.outlet_order_items i
                  join public.outlet_orders o on o.id = i.order_id
                  cross join outlet ou
                  where ou.outlet_id is not null
                    and o.outlet_id = ou.outlet_id
                    and lower(i.product_id) = lower(v.variant_id)
                    and o.created_at >= now() - make_interval(days => v.max_order_qty_days)
                ) < v.max_order_qty
              ),
            'qty_step', v.qty_step,
            'min_order_qty', v.min_order_qty,
            'max_order_qty', v.max_order_qty,
            'max_order_qty_days', v.max_order_qty_days,
            'window_ordered_qty',
              case
                when v.max_order_qty is not null
                  and v.max_order_qty_days is not null
                  and (select outlet_id from outlet) is not null
                then public.outlet_ordered_qty_in_window(
                  (select outlet_id from outlet),
                  v.variant_id,
                  v.max_order_qty_days
                )
                else null
              end,
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
