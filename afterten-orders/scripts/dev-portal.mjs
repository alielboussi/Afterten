/**
 * Stable local dev for the Next portal (Windows-friendly).
 * Default: webpack dev server (not Turbopack — CSS is flaky there on Windows).
 * Use `npm run dev` while building; use `npm run build && npm start` only to preview production.
 *
 * If styles ever look unstyled: run `npm run dev:clean` once (not every save).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const cleanFirst = args.includes("--clean");
const useTurbo =
  args.includes("--turbo") ||
  process.env.AFTERTEN_DEV_TURBO === "1" ||
  process.env.AFTERTEN_DEV_TURBO === "true";

async function run() {
  if (cleanFirst) {
    await import("./clean-next-cache.mjs");
  }

  const nextArgs = ["dev"];
  if (useTurbo) nextArgs.push("--turbopack");

  console.log(
    useTurbo
      ? "[afterten] Turbopack dev — if CSS disappears, stop and use `npm run dev` (webpack) instead."
      : "[afterten] Webpack dev — portal CSS loads from app/layout.tsx only.",
  );

  const child = spawn("npx", ["next", ...nextArgs], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
