import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const rmOpts = { recursive: true, force: true, maxRetries: 12, retryDelay: 250 };

for (const dir of [".next", ".turbo"]) {
  const target = path.join(root, dir);
  if (!existsSync(target)) continue;
  rmSync(target, rmOpts);
}

console.log("Removed .next and .turbo cache.");
console.log("If you saw 'Cannot find module ./XXX.js', restart with: npm run dev  (or npm run build && npm start).");
