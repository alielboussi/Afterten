-- Portal audit trail (all admin actions + page views). History list restricted to one viewer email.

create table if not exists public.portal_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null,
  actor_email text not null,
  page_path text not null default '',
  action_kind text not null,
  action_text text not null,
  metadata jsonb
);

create index if not exists portal_audit_log_created_at_idx
  on public.portal_audit_log (created_at desc);

create index if not exists portal_audit_log_actor_email_idx
  on public.portal_audit_log (actor_email, created_at desc);

alter table public.portal_audit_log enable row level security;

create or replace function public.is_portal_history_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_portal_admin()
    and lower(coalesce(auth.jwt()->>'email', '')) = lower('alielboussi00@gmail.com');
$$;

create or replace function public.log_portal_audit_event(
  p_page_path text,
  p_action_kind text,
  p_action_text text,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
begin
  if not public.is_portal_admin() then
    raise exception 'Only portal admins can log audit events.';
  end if;

  v_uid := auth.uid();
  v_email := lower(coalesce(auth.jwt()->>'email', ''));

  if v_uid is null or v_email = '' then
    raise exception 'Signed-in admin required.';
  end if;

  insert into public.portal_audit_log (
    actor_user_id,
    actor_email,
    page_path,
    action_kind,
    action_text,
    metadata
  )
  values (
    v_uid,
    v_email,
    coalesce(nullif(trim(p_page_path), ''), '/dashboard'),
    lower(coalesce(nullif(trim(p_action_kind), ''), 'other')),
    left(trim(p_action_text), 4000),
    p_metadata
  );
end;
$$;

create or replace function public.list_portal_audit_log(
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_email text,
  page_path text,
  action_kind text,
  action_text text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_portal_history_viewer() then
    raise exception 'Not authorized to view portal history.';
  end if;

  return query
  select
    l.id,
    l.created_at,
    l.actor_email,
    l.page_path,
    l.action_kind,
    l.action_text,
    l.metadata
  from public.portal_audit_log l
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.log_portal_audit_event(text, text, text, jsonb) from public;
grant execute on function public.log_portal_audit_event(text, text, text, jsonb) to authenticated;

revoke all on function public.list_portal_audit_log(int, int) from public;
grant execute on function public.list_portal_audit_log(int, int) to authenticated;

revoke all on function public.is_portal_history_viewer() from public;
grant execute on function public.is_portal_history_viewer() to authenticated;
