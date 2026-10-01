-- Last password set via portal (for admin list display). Auth remains source of truth for sign-in.
alter table public.app_profiles
  add column if not exists outlet_app_password text;

alter table public.app_profiles drop constraint if exists app_profiles_outlet_app_password_len;
alter table public.app_profiles
  add constraint app_profiles_outlet_app_password_len check (
    outlet_app_password is null or char_length(outlet_app_password) >= 6
  );

comment on column public.app_profiles.outlet_app_password is
  'Plaintext password last set from portal; visible to portal admins only (service role).';
