-- Run in SQL Editor AFTER outlet_orders_core.sql if "Automatically expose new tables" was OFF.
-- Exposes public tables to the Data API (PostgREST) and reloads schema cache.

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;
grant all on all routines in schema public to postgres, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

alter default privileges in schema public
  grant all on tables to postgres, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

notify pgrst, 'reload schema';
