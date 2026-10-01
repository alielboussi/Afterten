#!/usr/bin/env node
/**
 * Apply a single migration file via Postgres (service role DB URL).
 *   node scripts/supabase/apply-sql-file.mjs supabase/migrations/20261001140000_portal_admins.sql
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadSupabaseEnv, repoRootPath } from "./load-env.mjs";

const rel = process.argv[2];
if (!rel) {
  console.error("Usage: node scripts/supabase/apply-sql-file.mjs <path-to.sql>");
  process.exit(1);
}

const { dbUrl } = loadSupabaseEnv();
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL in secrets/supabase.env");
  process.exit(1);
}

const file = path.join(repoRootPath(), rel);
const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("Applied:", rel);
} finally {
  await client.end();
}
