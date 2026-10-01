"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignatureUploadUrl = exports.completeOutletOrder = exports.listOutletOrders = exports.placeOutletOrder = exports.peekNextOrderNumber = exports.listOutletOrderCatalog = exports.getOrdersAppProfile = exports.health = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const catalog_1 = require("./catalog");
Object.defineProperty(exports, "getOrdersAppProfile", { enumerable: true, get: function () { return catalog_1.getOrdersAppProfile; } });
Object.defineProperty(exports, "listOutletOrderCatalog", { enumerable: true, get: function () { return catalog_1.listOutletOrderCatalog; } });
const orders_1 = require("./orders");
Object.defineProperty(exports, "completeOutletOrder", { enumerable: true, get: function () { return orders_1.completeOutletOrder; } });
Object.defineProperty(exports, "getSignatureUploadUrl", { enumerable: true, get: function () { return orders_1.getSignatureUploadUrl; } });
Object.defineProperty(exports, "listOutletOrders", { enumerable: true, get: function () { return orders_1.listOutletOrders; } });
Object.defineProperty(exports, "peekNextOrderNumber", { enumerable: true, get: function () { return orders_1.peekNextOrderNumber; } });
Object.defineProperty(exports, "placeOutletOrder", { enumerable: true, get: function () { return orders_1.placeOutletOrder; } });
const system_1 = require("./system");
(0, app_1.initializeApp)();
const REGION = "africa-south1";
exports.health = (0, https_1.onCall)({ region: REGION }, async () => {
    await (0, system_1.ensureSystemConfigDoc)();
    return {
        ok: true,
        service: "afterten-outlet-orders",
        region: REGION,
        at: new Date().toISOString(),
    };
});
//# sourceMappingURL=index.js.map