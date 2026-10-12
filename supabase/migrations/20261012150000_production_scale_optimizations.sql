-- Production scale: indexes, leaner list queries, fewer no-op writes, combined RPCs.

-- ---------------------------------------------------------------------------
-- Indexes (hot paths under load)
-- ---------------------------------------------------------------------------
create index if not exists outlet_returns_outlet_created_idx
  on public.outlet_returns (outlet_id, created_at desc);

create index if not exists outlet_returns_status_created_idx
  on public.outlet_returns (status, created_at desc);

create index if not exists outlet_orders_archived_status_created_idx
  on public.outlet_orders (archived_at, status, created_at desc)
  where archived_at is null;

create index if not exists outlet_order_items_order_id_idx
  on public.outlet_order_items (order_id);

-- ---------------------------------------------------------------------------
-- Supervisor order list: ignore archived rows
-- ---------------------------------------------------------------------------
create or replace function public.list_supervisor_orders(
  p_outlet_id text default null,
  p_query text default null,
  p_status public.outlet_order_status default null
)
returns table (
  order_id uuid,
  outlet_id text,
  outlet_name text,
  order_number text,
  status public.outlet_order_status,
  employee_name text,
  grand_total numeric,
  created_at timestamptz,
  loading_checklist_completed_at timestamptz,
  loaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.outlet_id,
    o.outlet_name,
    o.order_number,
    o.status,
    o.employee_name,
    o.grand_total,
    o.created_at,
    o.loading_checklist_completed_at,
    o.loaded_at
  from public.outlet_orders o
  where public.is_approved_supervisor()
    and o.archived_at is null
    and (p_status is null or o.status = p_status)
    and (p_outlet_id is null or trim(p_outlet_id) = '' or o.outlet_id = trim(p_outlet_id))
    and (
      p_query is null
      or trim(p_query) = ''
      or o.order_number ilike ('%' || trim(p_query) || '%')
      or o.outlet_name ilike ('%' || trim(p_query) || '%')
      or coalesce(o.employee_name, '') ilike ('%' || trim(p_query) || '%')
      or o.grand_total::text ilike ('%' || trim(p_query) || '%')
      or to_char(o.created_at at time zone 'Africa/Lusaka', 'DD Mon YYYY') ilike ('%' || trim(p_query) || '%')
      or to_char(o.created_at at time zone 'Africa/Lusaka', 'YYYY-MM-DD') ilike ('%' || trim(p_query) || '%')
    )
  order by o.created_at desc
  limit 150;
$$;

-- ---------------------------------------------------------------------------
-- Outlet offloading list cap
-- ---------------------------------------------------------------------------
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
    o.order_number::text,
    o.outlet_name::text,
    o.status::text,
    o.grand_total,
    o.loaded_at,
    o.offloading_checklist_completed_at,
    coalesce(nullif(trim(o.driver_name), ''), d.name, '')::text
  from public.outlet_orders o
  left join public.delivery_drivers d on d.id = o.driver_id
  where o.outlet_id = v_outlet_id
    and o.status = 'loaded'::public.outlet_order_status
    and o.archived_at is null
  order by o.loaded_at desc nulls last, o.created_at desc
  limit 80;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push registration: skip write when token unchanged and recently updated
-- ---------------------------------------------------------------------------
create or replace function public.register_outlet_push_token(
  p_expo_push_token text,
  p_platform text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_id text;
  v_token text;
  v_existing public.outlet_push_tokens%rowtype;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  select outlet_id into v_outlet_id
  from public.app_profiles
  where user_id = auth.uid() and active = true and profile_kind = 'outlet_app';

  if v_outlet_id is null then
    raise exception 'No outlet profile for this account.';
  end if;

  v_token := trim(p_expo_push_token);
  if v_token is null or length(v_token) < 8 then
    raise exception 'Invalid push token.';
  end if;

  select * into v_existing
  from public.outlet_push_tokens t
  where t.user_id = auth.uid()
    and t.expo_push_token = v_token
    and t.active = true
  limit 1;

  if found
    and v_existing.outlet_id = v_outlet_id
    and coalesce(v_existing.platform, '') = coalesce(nullif(trim(p_platform), ''), '')
    and v_existing.updated_at > (now() - interval '12 hours')
  then
    return jsonb_build_object('ok', true, 'outlet_id', v_outlet_id, 'skipped', true);
  end if;

  insert into public.outlet_push_tokens (user_id, outlet_id, expo_push_token, platform, active)
  values (auth.uid(), v_outlet_id, v_token, nullif(trim(p_platform), ''), true)
  on conflict (user_id, expo_push_token) do update
  set outlet_id = excluded.outlet_id,
      platform = excluded.platform,
      active = true,
      updated_at = now();

  return jsonb_build_object('ok', true, 'outlet_id', v_outlet_id, 'skipped', false);
end;
$$;

create or replace function public.register_supervisor_push_token(p_expo_push_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_existing public.supervisor_push_tokens%rowtype;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor is not approved.';
  end if;

  v_token := trim(p_expo_push_token);
  if v_token is null or length(v_token) < 8 then
    raise exception 'Invalid Expo push token.';
  end if;

  select * into v_existing
  from public.supervisor_push_tokens t
  where t.user_id = auth.uid()
    and t.expo_push_token = v_token
    and t.active = true
  limit 1;

  if found
    and coalesce(v_existing.platform, '') = coalesce(nullif(trim(p_platform), ''), '')
    and v_existing.updated_at > (now() - interval '12 hours')
  then
    return;
  end if;

  insert into public.supervisor_push_tokens (user_id, expo_push_token, platform, active)
  values (auth.uid(), v_token, nullif(trim(p_platform), ''), true)
  on conflict (user_id, expo_push_token) do update
    set active = true,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- One round-trip for order summary (preview number + rules)
-- ---------------------------------------------------------------------------
create or replace function public.get_outlet_checkout_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_rules jsonb;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard only.';
  end if;

  v_order_number := public.preview_outlet_order_number();
  v_rules := public.list_outlet_order_rules();

  return jsonb_build_object(
    'order_number', v_order_number,
    'rules', coalesce(v_rules, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_outlet_checkout_context() from public;
grant execute on function public.get_outlet_checkout_context() to authenticated;

-- ---------------------------------------------------------------------------
-- One round-trip outlet app bootstrap (admin guard + profile)
-- ---------------------------------------------------------------------------
create or replace function public.get_outlet_app_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.app_profiles%rowtype;
  v_outlet_name text;
begin
  if public.is_portal_admin() then
    return jsonb_build_object('error', 'portal_admin');
  end if;

  select * into v_row
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.profile_kind = 'outlet_app'
  limit 1;

  if v_row.user_id is null then
    return jsonb_build_object('error', 'no_profile');
  end if;

  if not v_row.active then
    return jsonb_build_object('error', 'inactive');
  end if;

  v_outlet_name := trim(v_row.outlet_name);
  if v_outlet_name = '' then
    select trim(o.name) into v_outlet_name
    from public.outlets o
    where o.id = v_row.outlet_id;
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', v_row.user_id,
      'email', v_row.email,
      'alias', v_row.alias,
      'outlet_id', v_row.outlet_id,
      'outlet_name', coalesce(nullif(v_outlet_name, ''), v_row.outlet_id),
      'active', v_row.active,
      'profile_kind', v_row.profile_kind
    )
  );
end;
$$;

revoke all on function public.get_outlet_app_profile() from public;
grant execute on function public.get_outlet_app_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- Supervisor profile fetch also registers pending row (one RPC vs two)
-- ---------------------------------------------------------------------------
create or replace function public.get_supervisor_app_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.supervisor_profiles%rowtype;
begin
  if public.is_portal_admin() then
    raise exception 'Portal administrators use the web dashboard, not the supervisor app.';
  end if;

  select coalesce(auth.jwt()->>'email', '') into v_email;
  if v_email = '' then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if v_email is null or trim(v_email) = '' then
    raise exception 'Google account email is required.';
  end if;

  insert into public.supervisor_profiles (user_id, email, approved)
  values (auth.uid(), lower(trim(v_email)), false)
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'alias', v_row.alias,
    'approved', v_row.approved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Archive completed orders faster (cron passes higher limit)
-- ---------------------------------------------------------------------------
create or replace function public.archive_completed_orders_batch(p_limit int default 150)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_archived int := 0;
begin
  select coalesce(array_agg(id), array[]::uuid[])
  into v_ids
  from (
    select o.id
    from public.outlet_orders o
    where o.status = 'completed'
      and o.archived_at is null
      and o.completed_at < (now() - interval '90 days')
    order by o.completed_at asc
    limit greatest(1, least(coalesce(p_limit, 150), 500))
  ) s;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('archived_count', 0, 'order_ids', array[]::uuid[]);
  end if;

  update public.outlet_orders
  set archived_at = now(), updated_at = now()
  where id = any (v_ids)
    and archived_at is null;

  get diagnostics v_archived = row_count;

  return jsonb_build_object('archived_count', v_archived, 'order_ids', v_ids);
end;
$$;
