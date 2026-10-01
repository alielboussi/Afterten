import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
rmSync(path.join(root, ".next"), { recursive: true, force: true });
console.log("Removed .next cache");
