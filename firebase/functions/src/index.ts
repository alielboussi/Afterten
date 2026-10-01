import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { getOrdersAppProfile, listOutletOrderCatalog } from "./catalog";
import {
  completeOutletOrder,
  getSignatureUploadUrl,
  listOutletOrders,
  peekNextOrderNumber,
  placeOutletOrder,
} from "./orders";
import { ensureSystemConfigDoc } from "./system";

initializeApp();

const REGION = "africa-south1";

export const health = onCall({ region: REGION }, async () => {
  await ensureSystemConfigDoc();
  return {
    ok: true,
    service: "afterten-outlet-orders",
    region: REGION,
    at: new Date().toISOString(),
  };
});

export {
  getOrdersAppProfile,
  listOutletOrderCatalog,
  peekNextOrderNumber,
  placeOutletOrder,
  listOutletOrders,
  completeOutletOrder,
  getSignatureUploadUrl,
};
