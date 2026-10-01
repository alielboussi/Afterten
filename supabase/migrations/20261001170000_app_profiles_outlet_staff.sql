-- Outlet staff profiles: alias + kind (Expo app only, email/password accounts).

alter table public.app_profiles
  add column if not exists alias text,
  add column if not exists profile_kind text not null default 'outlet_app';

alter table public.app_profiles drop constraint if exists app_profiles_profile_kind_check;
alter table public.app_profiles
  add constraint app_profiles_profile_kind_check
  check (profile_kind = 'outlet_app');

alter table public.app_profiles drop constraint if exists app_profiles_alias_len;
alter table public.app_profiles
  add constraint app_profiles_alias_len check (
    alias is null or char_length(trim(alias)) between 1 and 48
  );

create or replace function public.is_outlet_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles ap
    where ap.user_id = auth.uid()
      and ap.active = true
      and ap.profile_kind = 'outlet_app'
  )
  and not public.is_portal_admin();
$$;

create or replace function public.outlet_app_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(ap.alias), ''),
    nullif(trim(ap.outlet_name), ''),
    ap.email
  )
  from public.app_profiles ap
  where ap.user_id = auth.uid()
    and ap.active = true
    and ap.profile_kind = 'outlet_app'
  limit 1;
$$;

revoke all on function public.outlet_app_display_name() from public;
grant execute on function public.outlet_app_display_name() to authenticated;
