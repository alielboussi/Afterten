-- Realtime inserts for supervisor order notifications (approved supervisors only via RLS).

alter publication supabase_realtime add table public.outlet_orders;
