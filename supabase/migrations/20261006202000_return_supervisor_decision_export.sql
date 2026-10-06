-- Snapshot supervisor alias and decision time on return accept/reject (integration API).

alter table public.outlet_returns
  add column if not exists supervisor_decision_alias text,
  add column if not exists supervisor_decided_at timestamptz;

update public.outlet_returns
set
  supervisor_decided_at = coalesce(supervisor_accepted_at, supervisor_rejected_at),
  updated_at = now()
where status in ('accepted', 'rejected')
  and supervisor_decided_at is null;

create or replace function public.accept_supervisor_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
  v_alias text;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor access only.';
  end if;

  select coalesce(nullif(trim(sp.alias), ''), nullif(trim(sp.email), ''), 'Supervisor')
  into v_alias
  from public.supervisor_profiles sp
  where sp.user_id = auth.uid() and sp.approved = true
  limit 1;

  if v_alias is null or trim(v_alias) = '' then
    v_alias := 'Supervisor';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id for update;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if v_row.status <> 'submitted' then
    raise exception 'Return is not awaiting decision.';
  end if;

  update public.outlet_returns
  set
    status = 'accepted',
    supervisor_accepted_at = now(),
    supervisor_accepted_by = auth.uid(),
    supervisor_decision_alias = v_alias,
    supervisor_decided_at = now(),
    updated_at = now()
  where id = p_return_id;

  return jsonb_build_object('return_id', p_return_id, 'status', 'accepted');
end;
$$;

create or replace function public.reject_supervisor_return(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outlet_returns%rowtype;
  v_alias text;
begin
  if not public.is_approved_supervisor() then
    raise exception 'Supervisor access only.';
  end if;

  select coalesce(nullif(trim(sp.alias), ''), nullif(trim(sp.email), ''), 'Supervisor')
  into v_alias
  from public.supervisor_profiles sp
  where sp.user_id = auth.uid() and sp.approved = true
  limit 1;

  if v_alias is null or trim(v_alias) = '' then
    v_alias := 'Supervisor';
  end if;

  select * into v_row from public.outlet_returns where id = p_return_id for update;
  if v_row.id is null then
    raise exception 'Return not found.';
  end if;

  if v_row.status <> 'submitted' then
    raise exception 'Return is not awaiting decision.';
  end if;

  update public.outlet_returns
  set
    status = 'rejected',
    supervisor_rejected_at = now(),
    supervisor_rejected_by = auth.uid(),
    supervisor_decision_alias = v_alias,
    supervisor_decided_at = now(),
    updated_at = now()
  where id = p_return_id;

  return jsonb_build_object('return_id', p_return_id, 'status', 'rejected');
end;
$$;

create index if not exists outlet_returns_decided_at_idx
  on public.outlet_returns (supervisor_decided_at desc nulls last);
