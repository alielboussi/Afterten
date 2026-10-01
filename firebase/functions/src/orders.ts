import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { formatOrderNumber, requireBranchUser } from "./auth-context";
import { assertOperationsNotPaused } from "./system";
import { COLLECTIONS, type OutletOrderDoc, type OutletOrderItemDoc } from "./schema";

import { FUNCTIONS_REGION } from "./region";

type PlaceItemInput = {
  productId?: string | null;
  variantKey?: string | null;
  name?: string;
  uom?: string;
  unitCost?: number;
  qty?: number;
};

function normalizeItems(raw: PlaceItemInput[]): OutletOrderItemDoc[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError("invalid-argument", "At least one order line is required.");
  }
  const items: OutletOrderItemDoc[] = [];
  raw.forEach((line, index) => {
    const qty = Number(line.qty ?? 0);
    const unitCost = Number(line.unitCost ?? 0);
    const name = String(line.name ?? "").trim();
    if (!name || qty <= 0) {
      throw new HttpsError("invalid-argument", `Invalid line at index ${index}.`);
    }
    const lineTotal = Math.round(unitCost * qty * 100) / 100;
    items.push({
      productId: String(line.productId ?? "").trim() || `line-${index}`,
      variantKey: String(line.variantKey ?? "").trim(),
      name,
      uom: String(line.uom ?? "pc").trim() || "pc",
      unitCost,
      qty,
      lineTotal,
      sortOrder: index,
    });
  });
  return items;
}

export const peekNextOrderNumber = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  const counterRef = getFirestore().collection(COLLECTIONS.outletOrderCounters).doc(profile.outletId);
  const counterSnap = await counterRef.get();
  const nextSeq = Number(counterSnap.data()?.nextSequence ?? 1);
  return {
    orderNumber: formatOrderNumber(profile.outletName, nextSeq),
    nextSequence: nextSeq,
  };
});

export const placeOutletOrder = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  const employeeName = String(request.data?.employeeName ?? "").trim();
  const employeeSignaturePath = String(request.data?.employeeSignaturePath ?? "").trim();
  if (!employeeName) {
    throw new HttpsError("invalid-argument", "Employee name is required.");
  }
  if (!employeeSignaturePath.startsWith(`signatures/${profile.outletId}/`)) {
    throw new HttpsError("invalid-argument", "Invalid employee signature path.");
  }

  const items = normalizeItems((request.data?.items ?? []) as PlaceItemInput[]);
  const grandTotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const now = new Date().toISOString();
  const db = getFirestore();
  const counterRef = db.collection(COLLECTIONS.outletOrderCounters).doc(profile.outletId);
  const orderRef = db.collection(COLLECTIONS.outletOrders).doc();

  const result = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const nextSeq = Number(counterSnap.data()?.nextSequence ?? 1);
    const orderNumber = formatOrderNumber(profile.outletName, nextSeq);

    const order: OutletOrderDoc = {
      outletId: profile.outletId,
      outletName: profile.outletName,
      orderNumber,
      status: "placed",
      employeeName,
      employeeSignaturePath,
      employeeSignedAt: now,
      driverName: null,
      driverSignaturePath: null,
      driverSignedAt: null,
      grandTotal,
      pdfPath: null,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(orderRef, order);
    for (const item of items) {
      const itemRef = orderRef.collection("items").doc();
      tx.set(itemRef, item);
    }
    tx.set(
      counterRef,
      {
        outletId: profile.outletId,
        nextSequence: nextSeq + 1,
        updatedAt: now,
      },
      { merge: true },
    );

    return { orderId: orderRef.id, orderNumber, status: order.status, grandTotal };
  });

  return result;
});

export const listOutletOrders = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  const statuses = request.data?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new HttpsError("invalid-argument", "statuses array is required.");
  }
  const allowed = new Set(["placed", "accepted", "loaded", "completed"]);
  for (const s of statuses) {
    if (!allowed.has(String(s))) {
      throw new HttpsError("invalid-argument", `Invalid status: ${s}`);
    }
  }

  const db = getFirestore();
  let query = db
    .collection(COLLECTIONS.outletOrders)
    .where("outletId", "==", profile.outletId)
    .where("status", "in", statuses.slice(0, 10))
    .orderBy("createdAt", "desc")
    .limit(50);

  const snap = await query.get();
  return {
    orders: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
});

export const completeOutletOrder = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  const orderId = String(request.data?.orderId ?? "").trim();
  const driverName = String(request.data?.driverName ?? "").trim();
  const driverSignaturePath = String(request.data?.driverSignaturePath ?? "").trim();
  const pdfPath = request.data?.pdfPath ? String(request.data.pdfPath).trim() : null;

  if (!orderId || !driverName) {
    throw new HttpsError("invalid-argument", "orderId and driverName are required.");
  }
  if (!driverSignaturePath.startsWith(`signatures/${profile.outletId}/`)) {
    throw new HttpsError("invalid-argument", "Invalid driver signature path.");
  }

  const db = getFirestore();
  const orderRef = db.collection(COLLECTIONS.outletOrders).doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }
    const order = snap.data() as OutletOrderDoc;
    if (order.outletId !== profile.outletId) {
      throw new HttpsError("permission-denied", "Order belongs to another outlet.");
    }
    if (order.status !== "loaded") {
      throw new HttpsError("failed-precondition", "Order is not ready for driver sign-off.");
    }
    const now = new Date().toISOString();
    tx.update(orderRef, {
      status: "completed",
      driverName,
      driverSignaturePath,
      driverSignedAt: now,
      pdfPath: pdfPath ?? order.pdfPath,
      updatedAt: now,
    });
  });

  return { orderId, status: "completed" };
});

export const getSignatureUploadUrl = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  await assertOperationsNotPaused();
  const profile = await requireBranchUser(String(request.auth?.uid ?? ""));
  const path = String(request.data?.path ?? "").trim();
  const contentType = String(request.data?.contentType ?? "image/png").trim();

  if (!path.startsWith(`signatures/${profile.outletId}/`)) {
    throw new HttpsError("invalid-argument", "Path must be under your outlet signatures folder.");
  }

  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  return { uploadUrl: url, path, expiresInSeconds: 900 };
});
