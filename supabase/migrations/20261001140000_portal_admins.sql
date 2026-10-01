-- Portal backoffice: only listed admins may use /dashboard (see Next.js middleware).

create table if not exists public.portal_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.portal_admins enable row level security;

-- No client policies: rows managed via service role / SQL only.

create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portal_admins pa
    where pa.user_id = auth.uid()
      and pa.active = true
  );
$$;

revoke all on function public.is_portal_admin() from public;
grant execute on function public.is_portal_admin() to authenticated;
