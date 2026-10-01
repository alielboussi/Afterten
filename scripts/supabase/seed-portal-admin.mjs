#!/usr/bin/env node
/**
 * Grant portal admin access to a signed-in Supabase Auth user by email.
 *
 *   node scripts/supabase/seed-portal-admin.mjs --email you@gmail.com
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv } from "./load-env.mjs";

const emailArg = process.argv.find((_, i, a) => a[i - 1] === "--email") ?? process.argv[2];
const email = (emailArg ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/supabase/seed-portal-admin.mjs --email admin@example.com");
  process.exit(1);
}

const { url, serviceRoleKey } = loadSupabaseEnv();
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
let authUser = null;
while (page <= 10 && !authUser) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  authUser = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
  page += 1;
}

if (!authUser) {
  console.error(
    `No Auth user for ${email}. Sign in once with Google (or create the user), then run this again.`,
  );
  process.exit(1);
}

const { error: upsertError } = await admin.from("portal_admins").upsert(
  {
    user_id: authUser.id,
    email: authUser.email ?? email,
    active: true,
  },
  { onConflict: "user_id" },
);

if (upsertError) {
  console.error("portal_admins upsert failed:", upsertError.message);
  console.error("Did you run supabase/migrations/20261001140000_portal_admins.sql ?");
  process.exit(1);
}

const { error: profileDeleteError } = await admin
  .from("app_profiles")
  .delete()
  .eq("user_id", authUser.id);

if (profileDeleteError) {
  console.warn("Note: could not remove app_profiles row:", profileDeleteError.message);
}

console.log(`Portal admin granted: ${authUser.email} (${authUser.id})`);
console.log("Outlet app access removed for this account (dashboard only).");
