#!/usr/bin/env node
/**
 * Creates Firebase Auth user + Firestore outlet profile + optional sample catalog line.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or secrets/firebase-adminsdk.json
 *
 * Example:
 *   node scripts/seed-outlet-user.mjs --email o@x.com --password "Secret1!" --outlet-id BR1 --outlet-name "Branch One"
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) return null;
  return process.argv[idx + 1];
}

const email = arg("email");
const password = arg("password");
const outletId = arg("outlet-id");
const outletName = arg("outlet-name");

if (!email || !password || !outletId || !outletName) {
  console.error(
    "Usage: node seed-outlet-user.mjs --email E --password P --outlet-id ID --outlet-name NAME",
  );
  process.exit(1);
}

const credPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  path.join(__dirname, "..", "..", "secrets", "firebase-adminsdk.json");

if (!existsSync(credPath)) {
  console.error(`Missing credentials: ${credPath}`);
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, "utf8"))) });
}

const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password, emailVerified: true });
  console.log(`Updated existing user ${user.uid}`);
} catch (e) {
  if (e?.code !== "auth/user-not-found") throw e;
  user = await auth.createUser({ email, password, emailVerified: true });
  console.log(`Created user ${user.uid}`);
}

await db.doc("system/config").set(
  {
    operationalPause: false,
    pauseMessage: "Afterten Orders is temporarily unavailable.",
    updatedAt: now,
  },
  { merge: true },
);

await db.collection("outlets").doc(outletId).set(
  {
    name: outletName,
    active: true,
    usesOrdersApp: true,
    updatedAt: now,
  },
  { merge: true },
);

await db.collection("app_users").doc(user.uid).set(
  {
    email,
    outletId,
    outletName,
    roles: ["branch"],
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  { merge: true },
);

await db.collection("outlet_order_counters").doc(outletId).set(
  {
    outletId,
    nextSequence: 1,
    updatedAt: now,
  },
  { merge: true },
);

const sampleLineId = `${outletId}__SAMPLE`;
await db.collection("catalog_lines").doc(sampleLineId).set(
  {
    outletId,
    productId: "SAMPLE",
    variantKey: "",
    name: "Sample product (replace me)",
    uom: "pc",
    unitCost: 1,
    imageUrl: null,
    hasVariations: false,
    active: true,
    sortOrder: 0,
    updatedAt: now,
  },
  { merge: true },
);

console.log("Done. Deploy rules/functions, then sign in from the app with this email/password.");
