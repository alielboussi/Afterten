#!/usr/bin/env node
/**
 * Seed one outlet-app user per outlet (4-char outlet id + {id}@ordersapp.com email).
 *
 *   node scripts/supabase/seed-outlet-users.mjs --reset
 *   node scripts/supabase/seed-outlet-users.mjs --dry-run
 */
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, repoRootPath } from "./load-env.mjs";
import { buildOutletRows } from "./outlet-identifiers.mjs";

const OUTLET_NAMES = [
  "Riverside",
  "Buchi",
  "First Class",
  "Nkana East",
  "Chimwemwe",
  "Second Class",
  "Matuka",
  "Oxford 1",
  "Oxford 2",
  "Ecl Mall",
  "Kalulushi",
  "Luanshya",
  "Mufulira",
  "Chingola Mall",
  "Chingola Town Centre",
  "Busstation",
  "Kansenji",
  "Broadway",
];

const dryRun = process.argv.includes("--dry-run");
const reset = process.argv.includes("--reset");

function randomSixDigitPassword() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const rows = buildOutletRows(OUTLET_NAMES).map((row) => ({
  ...row,
  password: randomSixDigitPassword(),
}));

async function wipePreviousOutletData(admin) {
  const { data: profiles, error: listErr } = await admin
    .from("app_profiles")
    .select("user_id")
    .eq("profile_kind", "outlet_app");
  if (listErr) throw new Error(listErr.message);

  for (const row of profiles ?? []) {
    const { error } = await admin.auth.admin.deleteUser(row.user_id);
    if (error && !error.message.toLowerCase().includes("not found")) {
      console.warn(`deleteUser ${row.user_id}: ${error.message}`);
    }
  }

  const { data: outlets } = await admin.from("outlets").select("id");
  for (const o of outlets ?? []) {
    await admin.from("outlets").delete().eq("id", o.id);
  }
}

async function seedOne(admin, { outletName, outletId, email, password, alias }) {
  const now = new Date().toISOString();

  const { error: outletError } = await admin.from("outlets").upsert(
    {
      id: outletId,
      name: outletName,
      active: true,
      uses_orders_app: true,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (outletError) throw new Error(`outlets ${outletId}: ${outletError.message}`);

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    const msg = authError?.message ?? "createUser failed";
    if (msg.toLowerCase().includes("already")) {
      throw new Error(`auth ${email}: already registered (run with --reset)`);
    }
    throw new Error(`auth ${email}: ${msg}`);
  }

  const userId = created.user.id;

  await admin.from("portal_admins").update({ active: false }).eq("user_id", userId);
  await admin.from("portal_user_profiles").delete().eq("user_id", userId);

  const { error: profileError } = await admin.from("app_profiles").upsert(
    {
      user_id: userId,
      email,
      outlet_id: outletId,
      outlet_name: outletName,
      alias,
      profile_kind: "outlet_app",
      roles: ["branch"],
      active: true,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`app_profiles ${email}: ${profileError.message}`);
  }

  await admin.from("outlet_order_counters").upsert(
    { outlet_id: outletId, next_sequence: 1 },
    { onConflict: "outlet_id", ignoreDuplicates: true },
  );

  return { userId, outletId, email, password, alias };
}

if (dryRun) {
  console.log("Dry run — would create:\n");
  console.log("outlet_id,alias,email,password");
  for (const r of rows) {
    console.log(`${r.outletId},${r.alias},${r.email},${r.password}`);
  }
  process.exit(0);
}

const { url, serviceRoleKey } = loadSupabaseEnv();
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (reset) {
  console.log("Removing previous outlet users and outlets…");
  await wipePreviousOutletData(admin);
}

const results = [];
const failures = [];

for (const row of rows) {
  try {
    const created = await seedOne(admin, row);
    results.push(created);
    console.log(`OK ${created.outletId} → ${created.email}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push({ ...row, error: msg });
    console.error(`FAIL ${row.outletId}: ${msg}`);
  }
}

const csvHeader = "outlet_id,outlet_name,alias,email,password,user_id\n";
const csvBody = results
  .map((r) => {
    const meta = rows.find((x) => x.outletId === r.outletId);
    return `${r.outletId},"${meta?.outletName ?? ""}",${r.alias},${r.email},${r.password},${r.userId}`;
  })
  .join("\n");

const outPath = path.join(repoRootPath(), "secrets", "outlet-users-seed-latest.csv");
writeFileSync(outPath, csvHeader + csvBody + (csvBody ? "\n" : ""), "utf8");

console.log(`\nCreated ${results.length}/${rows.length} outlet users.`);
console.log(`Credentials: ${outPath}`);

if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures) console.error(`  ${f.outletId}: ${f.error}`);
  process.exit(1);
}
