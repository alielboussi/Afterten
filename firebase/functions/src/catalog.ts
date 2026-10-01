import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireBranchUser } from "./auth-context";
import { assertOperationsNotPaused } from "./system";
import { COLLECTIONS, type CatalogLineDoc } from "./schema";

const REGION = "africa-south1";

function mapCatalogLine(id: string, data: FirebaseFirestore.DocumentData): CatalogLineDoc & { id: string } {
  return {
    id,
    outletId: String(data.outletId ?? ""),
    productId: String(data.productId ?? ""),
    variantKey: String(data.variantKey ?? ""),
    name: String(data.name ?? ""),
    uom: String(data.uom ?? "pc"),
    unitCost: Number(data.unitCost ?? 0),
    imageUrl: data.imageUrl ? String(data.imageUrl) : null,
    hasVariations: Boolean(data.hasVariations),
    active: Boolean(data.active),
    sortOrder: Number(data.sortOrder ?? 0),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export const listOutletOrderCatalog = onCall({ region: REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));

  const db = getFirestore();
  const snap = await db
    .collection(COLLECTIONS.catalogLines)
    .where("outletId", "==", profile.outletId)
    .where("active", "==", true)
    .get();

  const lines = snap.docs
    .map((doc) => mapCatalogLine(doc.id, doc.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return { outletId: profile.outletId, lines };
});

export const getOrdersAppProfile = onCall({ region: REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  return {
    email: profile.email,
    outletId: profile.outletId,
    outletName: profile.outletName,
    roles: profile.roles,
  };
});
