-- Return rows instead of jsonb so PostgREST / Supabase client always get a JSON array.
drop function if exists public.list_outlet_offloading_orders();

create or replace function public.list_outlet_offloading_orders()
returns table (
  order_id uuid,
  order_number text,
  outlet_name text,
  status text,
  grand_total numeric,
  loaded_at timestamptz,
  offloading_checklist_completed_at timestamptz,
  driver_name text
)
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

  select ap.outlet_id into v_outlet_id
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  return query
  select
    o.id,
    o.order_number,
    o.outlet_name,
    o.status,
    o.grand_total,
    o.loaded_at,
    o.offloading_checklist_completed_at,
    d.name
  from public.outlet_orders o
  left join public.delivery_drivers d on d.id = o.driver_id
  where o.outlet_id = v_outlet_id
    and o.status = 'loaded'
  order by o.loaded_at desc nulls last, o.created_at desc;
end;
$$;

revoke all on function public.list_outlet_offloading_orders() from public;
grant execute on function public.list_outlet_offloading_orders() to authenticated;
