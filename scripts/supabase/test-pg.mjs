#!/usr/bin/env node
import pg from "pg";
import { loadSupabaseEnv } from "./load-env.mjs";

const { dbUrl } = loadSupabaseEnv();
if (!dbUrl) {
  console.log("No SUPABASE_DB_URL");
  process.exit(1);
}
const u = new URL(dbUrl.replace(/^postgresql:/, "postgres:"));
console.log("DB host:", u.hostname, "port:", u.port || "5432");

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const r = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by 1",
  );
  console.log("Postgres public tables:", r.rows.map((x) => x.table_name).join(", ") || "(none)");
} catch (e) {
  console.log("Postgres connect failed:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
