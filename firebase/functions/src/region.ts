/**
 * Must match the Firestore database location you chose in Firebase Console.
 * Use one single region (never multi-region). Same region as Firestore avoids egress fees.
 *
 * Default: us-central1 — standard single-region pricing; widely used for Functions.
 * Change this one constant if you pick a different single region in Console.
 */
export const FUNCTIONS_REGION = "us-central1";
