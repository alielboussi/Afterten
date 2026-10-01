#!/usr/bin/env node
/**
 * Validates secrets/supabase.env without printing secrets.
 *   node scripts/supabase/check-connection.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { loadSupabaseEnv } from "./load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", "..", "secrets", "supabase.env");

function readRawEnv() {
  const out = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

console.log("Checking Supabase connection…\n");

let env;
try {
  env = loadSupabaseEnv();
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}

if (env.url.includes("YOUR_PROJECT_REF") || env.serviceRoleKey.includes("your_service")) {
  console.error("FAIL: Edit secrets/supabase.env — replace placeholders with keys from Supabase Dashboard.");
  process.exit(1);
}

const supabase = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count, error } = await supabase.from("system_config").select("*", { count: "exact", head: true });
if (error) {
  console.error("FAIL (REST):", error.message);
  console.error("\n→ Run migration SQL in Supabase SQL Editor first.");
  process.exit(1);
}

console.log("OK  REST API (service role) → system_config");
console.log(`    rows: ${count ?? 0}`);

const raw = readRawEnv();
const dbUrl = raw.SUPABASE_DB_URL || raw.DATABASE_URL;
if (!dbUrl || dbUrl.includes("YOUR_PASSWORD")) {
  console.log("\nSKIP SQL pooler (optional): add SUPABASE_DB_URL for npm run supabase:query");
  console.log("\nAll required checks passed.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const res = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.log("\nOK  Database URI → public tables:");
  for (const row of res.rows) console.log(`    - ${row.table_name}`);
} catch (e) {
  console.error("\nFAIL (database URI):", e.message);
  console.error("→ Supabase → Project Settings → Database → Connection string (URI, pooler :6543)");
  process.exit(1);
} finally {
  await client.end();
}

console.log("\nAll checks passed.");
