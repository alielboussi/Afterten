-- Display names for portal users (alias shown in header, admin table, etc.)

create table if not exists public.portal_user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alias text,
  updated_at timestamptz not null default now(),
  constraint portal_user_profiles_alias_len check (
    alias is null or char_length(trim(alias)) between 1 and 48
  )
);

alter table public.portal_user_profiles enable row level security;

-- Managed via service role from the Next.js portal only.

create or replace function public.portal_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.alias), ''),
    u.email
  )
  from auth.users u
  left join public.portal_user_profiles p on p.user_id = u.id
  where u.id = p_user_id;
$$;

revoke all on function public.portal_display_name(uuid) from public;
grant execute on function public.portal_display_name(uuid) to authenticated;
