#!/usr/bin/env node
/**
 * Copy passwords from secrets/outlet-users-seed-latest.csv into app_profiles.outlet_app_password
 * (Auth passwords were set at seed time; this column was added later for the portal list).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, repoRootPath } from "./load-env.mjs";

const csvPath = path.join(repoRootPath(), "secrets", "outlet-users-seed-latest.csv");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = [];
    let cur = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (c === "," && !inQuotes) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    parts.push(cur);
    const row = {};
    header.forEach((h, idx) => {
      row[h.trim()] = (parts[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

const { url, serviceRoleKey } = loadSupabaseEnv();
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const csv = readFileSync(csvPath, "utf8");
const rows = parseCsv(csv);

let ok = 0;
let fail = 0;

for (const row of rows) {
  const userId = row.user_id;
  const password = row.password;
  if (!userId || !password) continue;

  const { error } = await admin
    .from("app_profiles")
    .update({ outlet_app_password: password, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("profile_kind", "outlet_app");

  if (error) {
    console.error(`${row.email ?? userId}: ${error.message}`);
    fail++;
  } else {
    ok++;
  }
}

console.log(`Updated outlet_app_password for ${ok} user(s).${fail ? ` ${fail} failed.` : ""}`);
