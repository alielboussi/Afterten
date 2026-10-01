export const COLLECTIONS = {
  systemConfig: "system/config",
  appUsers: "app_users",
  outlets: "outlets",
  catalogLines: "catalog_lines",
  outletOrders: "outlet_orders",
  outletOrderCounters: "outlet_order_counters",
} as const;

export type AppUserDoc = {
  email: string;
  outletId: string;
  outletName: string;
  roles: Array<"branch">;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogLineDoc = {
  outletId: string;
  productId: string;
  variantKey: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string | null;
  hasVariations: boolean;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type OutletOrderDoc = {
  outletId: string;
  outletName: string;
  orderNumber: string;
  status: "placed" | "accepted" | "loaded" | "completed";
  employeeName: string | null;
  employeeSignaturePath: string | null;
  employeeSignedAt: string | null;
  driverName: string | null;
  driverSignaturePath: string | null;
  driverSignedAt: string | null;
  grandTotal: number;
  pdfPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OutletOrderItemDoc = {
  productId: string;
  variantKey: string;
  name: string;
  uom: string;
  unitCost: number;
  qty: number;
  lineTotal: number;
  sortOrder: number;
};

export type SystemConfigDoc = {
  operationalPause: boolean;
  pauseMessage: string;
  updatedAt: string;
};
