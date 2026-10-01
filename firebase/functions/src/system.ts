import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { COLLECTIONS, type SystemConfigDoc } from "./schema";

const DEFAULT_PAUSE_MESSAGE =
  "Afterten Orders is temporarily unavailable. Please try again later or contact support.";

export async function assertOperationsNotPaused(): Promise<void> {
  const snap = await getFirestore().doc(COLLECTIONS.systemConfig).get();
  if (!snap.exists) return;
  const data = snap.data() as Partial<SystemConfigDoc>;
  if (data.operationalPause === true) {
    throw new HttpsError(
      "failed-precondition",
      String(data.pauseMessage ?? DEFAULT_PAUSE_MESSAGE).trim() || DEFAULT_PAUSE_MESSAGE,
    );
  }
}

export async function ensureSystemConfigDoc(): Promise<void> {
  const ref = getFirestore().doc(COLLECTIONS.systemConfig);
  const snap = await ref.get();
  if (snap.exists) return;
  const now = new Date().toISOString();
  await ref.set({
    operationalPause: false,
    pauseMessage: DEFAULT_PAUSE_MESSAGE,
    updatedAt: now,
  } satisfies SystemConfigDoc);
}
