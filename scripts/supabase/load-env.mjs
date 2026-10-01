#!/usr/bin/env node
/**
 * Load secrets/supabase.env (gitignored). Used by local admin scripts only.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const envPath = path.join(repoRoot, "secrets", "supabase.env");

export function loadSupabaseEnv() {
  if (!existsSync(envPath)) {
    throw new Error(
      `Missing ${envPath}\nCopy secrets/supabase.env.example → secrets/supabase.env and fill in values.`,
    );
  }
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  const url = out.SUPABASE_URL;
  const serviceRoleKey = out.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("secrets/supabase.env must set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, serviceRoleKey, anonKey: out.SUPABASE_ANON_KEY ?? "", dbUrl: out.SUPABASE_DB_URL ?? out.DATABASE_URL ?? "" };
}

export function repoRootPath() {
  return repoRoot;
}
