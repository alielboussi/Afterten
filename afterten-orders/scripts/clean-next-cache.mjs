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
console.log(
  "Restart dev: npm run dev  (or npm run dev:clean). Hard-refresh the browser (Ctrl+Shift+R).",
);
console.log(
  "If you saw '__webpack_modules__[moduleId] is not a function' or 'Cannot find module ./XXX.js', that usually means stale chunks — clean + restart fixes it.",
);
