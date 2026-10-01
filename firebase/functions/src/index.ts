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
import { FUNCTIONS_REGION } from "./region";

initializeApp();

export const health = onCall({ region: FUNCTIONS_REGION }, async () => {
  await ensureSystemConfigDoc();
  return {
    ok: true,
    service: "afterten-outlet-orders",
    region: FUNCTIONS_REGION,
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
