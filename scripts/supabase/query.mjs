#!/usr/bin/env node
/**
 * Run arbitrary read-only SELECT (service role). For admin/debug from Cursor.
 *
 *   node scripts/supabase/query.mjs "select id, name from outlets limit 10"
 *
 * Only statements starting with SELECT or WITH are allowed.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "..", "secrets", "supabase.env");

function loadEnv() {
  if (!existsSync(envPath)) throw new Error("Missing secrets/supabase.env");
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('Usage: node scripts/supabase/query.mjs "select ..."');
  process.exit(1);
}

const normalized = sql.replace(/^\s+/, "").toLowerCase();
if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
  console.error("Only SELECT / WITH queries are allowed from this script.");
  process.exit(1);
}

const env = loadEnv();
const connectionString = env.SUPABASE_DB_URL || env.DATABASE_URL;
if (!connectionString) {
  console.error("Add SUPABASE_DB_URL to secrets/supabase.env (Supabase → Project Settings → Database → URI)");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const res = await client.query(sql);
  console.table(res.rows);
  console.log(`(${res.rowCount} rows)`);
} finally {
  await client.end();
}
