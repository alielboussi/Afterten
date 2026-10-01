#!/usr/bin/env node
/**
 * Fails if this repo reintroduces scheduled Cloud Functions.
 * Run: node firebase/scripts/audit-no-schedulers.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsSrc = path.join(__dirname, "..", "functions", "src");

const FORBIDDEN = [/onSchedule\s*\(/, /syncStockCatalogScheduled/, /scheduler\.googleapis\.com/];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = await walk(functionsSrc);
const hits = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      hits.push({ file, pattern: pattern.toString() });
      break;
    }
  }
}

if (hits.length) {
  console.error("Scheduled / high-cost patterns found:\n");
  for (const h of hits) console.error(`  ${h.file}\n    ${h.pattern}`);
  process.exit(1);
}

console.log("OK: no onSchedule / catalog sync schedulers in functions/src");
process.exit(0);
