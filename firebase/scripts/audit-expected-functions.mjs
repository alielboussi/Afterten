#!/usr/bin/env node
/**
 * Lists the ONLY Cloud Functions this repo is allowed to deploy (from functions/src/index.ts).
 * After deploy, compare with:
 *   firebase functions:list --project YOUR_PROJECT_ID
 *
 * Any extra function name in GCP = investigate and delete immediately.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, "..", "functions", "src", "index.ts");
const text = await readFile(indexPath, "utf8");

const names = new Set<string>();

for (const m of text.matchAll(/export const (\w+) = onCall/g)) {
  names.add(m[1]);
}
for (const block of text.matchAll(/export \{\s*([^}]+)\s*\}/g)) {
  for (const part of block[1].split(",")) {
    const n = part.trim().split(/\s as /)[0].trim();
    if (n) names.add(n);
  }
}

const allowed = [...names].sort();
console.log("Allowed Cloud Functions (this repo only):\n");
for (const n of allowed) console.log(`  - ${n}`);
console.log(`\nTotal: ${allowed.length}`);
console.log("\nDeploy ONLY after budget + Firestore setup:");
console.log("  firebase deploy --only functions --project YOUR_PROJECT_ID");
console.log("Then verify:");
console.log("  firebase functions:list --project YOUR_PROJECT_ID");
