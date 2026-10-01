#!/usr/bin/env node
/** Quick sign-in test for a seeded outlet user (anon key). */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv } from "./load-env.mjs";

const email = process.argv.find((_, i, a) => a[i - 1] === "--email") ?? process.argv[2];
const password = process.argv.find((_, i, a) => a[i - 1] === "--password") ?? process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/supabase/test-outlet-login.mjs --email rive@ordersapp.com --password 123456");
  process.exit(1);
}

const { url, anonKey } = loadSupabaseEnv();
if (!anonKey) {
  console.error("Add SUPABASE_ANON_KEY to secrets/supabase.env");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
  email: email.trim().toLowerCase(),
  password,
});
if (signInError) {
  console.error("Sign-in failed:", signInError.message);
  process.exit(1);
}

const { data: isAdmin } = await supabase.rpc("is_portal_admin");
const { data: profile, error: profileError } = await supabase
  .from("app_profiles")
  .select("outlet_id, outlet_name, alias, active, profile_kind")
  .eq("profile_kind", "outlet_app")
  .maybeSingle();

if (profileError) {
  console.error("Profile read failed:", profileError.message);
  process.exit(1);
}

console.log("Signed in:", signIn.user?.email);
console.log("Portal admin (must be false):", isAdmin);
console.log("Profile:", profile);
await supabase.auth.signOut();
