import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { COLLECTIONS, type AppUserDoc } from "./schema";

export async function requireBranchUser(uid: string): Promise<AppUserDoc> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const snap = await getFirestore().collection(COLLECTIONS.appUsers).doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "No outlet profile for this account.");
  }
  const profile = snap.data() as AppUserDoc;
  if (!profile.active) {
    throw new HttpsError("permission-denied", "This outlet account is disabled.");
  }
  if (!profile.outletId?.trim()) {
    throw new HttpsError("failed-precondition", "Outlet is not linked to this login.");
  }
  return profile;
}

export function orderNumberPrefix(outletName: string): string {
  const cleaned = outletName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "OUTLET";
}

export function formatOrderNumber(outletName: string, sequence: number): string {
  return `${orderNumberPrefix(outletName)}-${String(sequence).padStart(10, "0")}`;
}
