import { createClient } from "@supabase/supabase-js";

/**
 * Service role — server only (afterten-orders/.env.local + Vercel env, never NEXT_PUBLIC).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in server env (add to .env.local and Vercel, not public).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
