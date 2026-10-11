-- pgcrypto (crypt / gen_salt) lives in the extensions schema on Supabase.
-- Security-definer RPCs with search_path = public only cannot resolve gen_salt.

create extension if not exists pgcrypto with schema extensions;

alter function public.hash_outlet_employee_passcode(text)
  set search_path = public, extensions;

alter function public.verify_outlet_employee_passcode(uuid, text)
  set search_path = public, extensions;

alter function public.place_outlet_order(uuid, text, text, jsonb)
  set search_path = public, extensions;

alter function public.complete_outlet_order(uuid, uuid, text, text)
  set search_path = public, extensions;

alter function public.submit_outlet_return(uuid, uuid, text, text, text)
  set search_path = public, extensions;
