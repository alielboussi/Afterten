-- Portal-only wipe of all outlet orders + reset per-outlet sequence to 1 (pre-production fresh start).

create or replace function public.portal_purge_all_outlet_orders(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if not public.is_portal_admin() then
    raise exception 'Only portal admins can purge orders.';
  end if;

  if p_confirmation is distinct from 'DELETE ALL ORDERS' then
    raise exception 'Type DELETE ALL ORDERS to confirm.';
  end if;

  select count(*)::bigint into v_deleted from public.outlet_orders;

  delete from public.outlet_orders;

  update public.outlet_order_counters
  set next_sequence = 1,
      updated_at = now();

  return jsonb_build_object('deleted_orders', v_deleted);
end;
$$;

revoke all on function public.portal_purge_all_outlet_orders(text) from public;
grant execute on function public.portal_purge_all_outlet_orders(text) to authenticated;
