#!/usr/bin/env node
/**
 * Run read-only SQL via Supabase PostgREST is limited; this uses the SQL API through rpc if available.
 * Preferred: paste migration in Dashboard SQL Editor.
 * This script runs simple table counts via REST (service role).
 *
 *   node scripts/supabase/inspect.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv } from "./load-env.mjs";

const { url, serviceRoleKey } = loadSupabaseEnv();
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  "outlets",
  "app_profiles",
  "catalog_lines",
  "outlet_orders",
  "outlet_order_items",
  "system_config",
];

console.log("Supabase:", url, "\n");

for (const table of tables) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ${table}: (not ready) ${error.message}`);
  } else {
    console.log(`  ${table}: ${count ?? 0} rows`);
  }
}

const { data: cfg } = await supabase.from("system_config").select("*").eq("id", "default").maybeSingle();
if (cfg) {
  console.log("\nsystem_config:", {
    operational_pause: cfg.operational_pause,
    pause_message: cfg.pause_message?.slice(0, 60),
  });
}
