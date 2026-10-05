import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type IntegrationExportView = "lines" | "summary";

export type IntegrationDetailLevel = "compact" | "standard" | "full";

/** One flat row per order line (standard/full), or one row per order (summary). */
export type SupervisorAcceptedOrderExportRecord = {
  outlet_name: string;
  outlet_id: string;
  outlet_uuid: string | null;
  outlet_active: boolean | null;
  order_id: string;
  order_number: string;
  order_status: string;
  order_placed_at: string | null;
  order_loaded_at: string | null;
  supervisor_accepted_at: string | null;
  supervisor_revised: boolean;
  employee_name: string | null;
  grand_total: number | null;
  driver_id: string | null;
  driver_name: string | null;
  line_item_id: string | null;
  line_total: number | null;
  units_per_order_unit: number | null;
  total_units: number | null;
  order_products_name: string | null;
  order_products_uuid: string | null;
  order_variants_name: string | null;
  order_variants_uuid: string | null;
  order_automatically_added_products_name: string | null;
  order_automatically_added_products_uuid: string | null;
  order_products_qty: number | null;
  order_products_uom: string | null;
  order_variants_qty: number | null;
  order_variants_uom: string | null;
  order_automatically_added_products_qty: number | null;
  order_automatically_added_products_uom: string | null;
  line_count?: number | null;
};

export type SupervisorAcceptedOrdersExportResponse = {
  generated_at: string;
  view: IntegrationExportView;
  detail: IntegrationDetailLevel;
  orders_in_page: number;
  record_count: number;
  next_cursor: string | null;
  records: SupervisorAcceptedOrderExportRecord[];
};

export type FetchSupervisorAcceptedOrdersOptions = {
  limit?: number;
  since?: string | null;
  cursor?: string | null;
  view?: IntegrationExportView;
  detail?: IntegrationDetailLevel;
  active_outlets_only?: boolean;
};

const BEARER_FILE = "Bearer Key.txt";
const DEFAULT_ORDER_LIMIT = 25;
const MAX_ORDER_LIMIT = 100;

type OrderRow = {
  id: string;
  outlet_id: string;
  outlet_name: string;
  order_number: string;
  status: string;
  created_at: string;
  loaded_at: string | null;
  supervisor_accepted_at: string;
  updated_at: string;
  grand_total: number;
  employee_name: string | null;
  driver_id: string | null;
  outlets: { active: boolean } | { active: boolean }[] | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  qty: number;
  uom: string;
  line_total: number;
  units_per_order_unit: number;
  total_units: number;
  sort_order: number;
};

type ProductBrief = { product_id: string; name: string };
type VariantBrief = { variant_id: string; product_id: string; name: string };

type CatalogCache = {
  autoIds: Set<string>;
  products: Map<string, ProductBrief>;
  variants: Map<string, VariantBrief>;
  drivers: Map<string, string>;
};

export function readIntegrationBearerKey(): string | null {
  const fromEnv =
    process.env.SUPERVISOR_ACCEPTED_ORDERS_BEARER_KEY?.trim() ||
    process.env.ORDERS_INTEGRATION_BEARER_KEY?.trim();
  if (fromEnv) return fromEnv;

  for (const root of [process.cwd(), path.join(process.cwd(), "..")]) {
    const filePath = path.join(root, BEARER_FILE);
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8").trim();
    if (raw) return raw;
  }
  return null;
}

export function verifyIntegrationBearer(req: Request):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const expected = readIntegrationBearerKey();
  if (!expected) {
    return { ok: false, status: 503, error: "Integration bearer key not configured." };
  }
  const header = req.headers.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m || m[1].trim() !== expected) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}

export function encodeOrdersCursor(supervisorAcceptedAt: string, orderId: string): string {
  return Buffer.from(`${supervisorAcceptedAt}|${orderId}`, "utf8").toString("base64url");
}

export function decodeOrdersCursor(cursor: string): { acceptedAt: string; orderId: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const acceptedAt = raw.slice(0, sep);
    const orderId = raw.slice(sep + 1);
    if (!acceptedAt || !orderId) return null;
    return { acceptedAt, orderId };
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function outletActive(order: OrderRow): boolean | null {
  const o = order.outlets;
  if (!o) return null;
  if (Array.isArray(o)) return o[0]?.active ?? null;
  return o.active ?? null;
}

function supervisorRevised(order: OrderRow): boolean {
  const accepted = new Date(order.supervisor_accepted_at).getTime();
  const updated = new Date(order.updated_at).getTime();
  return updated - accepted > 2000;
}

async function loadAutoAddedProductIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data: rules } = await admin.from("product_order_rules").select("id").eq("active", true);
  if (!rules?.length) return new Set();
  const { data: additions } = await admin
    .from("product_order_rule_additions")
    .select("added_product_id")
    .in(
      "rule_id",
      rules.map((r) => r.id),
    );
  const set = new Set<string>();
  for (const row of additions ?? []) {
    const id = String(row.added_product_id ?? "").trim().toLowerCase();
    if (id) set.add(id);
  }
  return set;
}

async function buildCatalogCache(
  admin: SupabaseClient,
  productIds: string[],
  driverIds: string[],
): Promise<CatalogCache> {
  const autoIds = await loadAutoAddedProductIds(admin);
  const idList = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];

  const products = new Map<string, ProductBrief>();
  const variants = new Map<string, VariantBrief>();

  if (idList.length > 0) {
    const { data: variantRows } = await admin
      .from("product_variants")
      .select("variant_id, product_id, name")
      .in("variant_id", idList);
    for (const v of variantRows ?? []) {
      const vid = String(v.variant_id).trim().toLowerCase();
      variants.set(vid, {
        variant_id: String(v.variant_id),
        product_id: String(v.product_id),
        name: String(v.name),
      });
    }

    const productKeyList = [
      ...new Set([
        ...idList.map((id) => id.toLowerCase()),
        ...[...variants.values()].map((v) => String(v.product_id).trim()),
      ]),
    ];
    if (productKeyList.length > 0) {
      const { data: productRows } = await admin
        .from("products")
        .select("product_id, name")
        .in("product_id", productKeyList);
      for (const p of productRows ?? []) {
        const pid = String(p.product_id).trim().toLowerCase();
        products.set(pid, { product_id: String(p.product_id), name: String(p.name) });
      }
    }
  }

  const drivers = new Map<string, string>();
  const uniqueDrivers = [...new Set(driverIds.filter(Boolean))];
  if (uniqueDrivers.length > 0) {
    const { data: driverRows } = await admin
      .from("delivery_drivers")
      .select("id, name")
      .in("id", uniqueDrivers);
    for (const d of driverRows ?? []) {
      drivers.set(String(d.id), String(d.name));
    }
  }

  return { autoIds, products, variants, drivers };
}

function resolveIdentity(
  cache: CatalogCache,
  productId: string,
  fallbackName: string,
): {
  isVariant: boolean;
  productName: string;
  productUuid: string;
  variantName: string | null;
  variantUuid: string | null;
} {
  const key = productId.trim().toLowerCase();
  const variant = cache.variants.get(key);
  if (variant) {
    const parent = cache.products.get(String(variant.product_id).trim().toLowerCase());
    return {
      isVariant: true,
      productName: parent?.name ?? fallbackName,
      productUuid: parent?.product_id ?? variant.product_id,
      variantName: variant.name,
      variantUuid: variant.variant_id,
    };
  }
  const product = cache.products.get(key);
  return {
    isVariant: false,
    productName: product?.name ?? fallbackName,
    productUuid: product?.product_id ?? productId,
    variantName: null,
    variantUuid: null,
  };
}

function orderHeaderFields(
  order: OrderRow,
  cache: CatalogCache,
  detail: IntegrationDetailLevel,
): Omit<
  SupervisorAcceptedOrderExportRecord,
  | "line_item_id"
  | "line_total"
  | "units_per_order_unit"
  | "total_units"
  | "order_products_name"
  | "order_products_uuid"
  | "order_variants_name"
  | "order_variants_uuid"
  | "order_automatically_added_products_name"
  | "order_automatically_added_products_uuid"
  | "order_products_qty"
  | "order_products_uom"
  | "order_variants_qty"
  | "order_variants_uom"
  | "order_automatically_added_products_qty"
  | "order_automatically_added_products_uom"
  | "line_count"
> {
  const compact = detail === "compact";
  return {
    outlet_name: order.outlet_name,
    outlet_id: order.outlet_id,
    outlet_uuid: null,
    outlet_active: outletActive(order),
    order_id: order.id,
    order_number: order.order_number,
    order_status: String(order.status),
    order_placed_at: order.created_at,
    order_loaded_at: order.loaded_at,
    supervisor_accepted_at: order.supervisor_accepted_at,
    supervisor_revised: supervisorRevised(order),
    employee_name: compact ? null : order.employee_name?.trim() || null,
    grand_total: compact ? null : num(order.grand_total),
    driver_id: compact ? null : order.driver_id,
    driver_name:
      compact || !order.driver_id ? null : (cache.drivers.get(order.driver_id) ?? null),
  };
}

function emptyLineFields(): Pick<
  SupervisorAcceptedOrderExportRecord,
  | "line_item_id"
  | "line_total"
  | "units_per_order_unit"
  | "total_units"
  | "order_products_name"
  | "order_products_uuid"
  | "order_variants_name"
  | "order_variants_uuid"
  | "order_automatically_added_products_name"
  | "order_automatically_added_products_uuid"
  | "order_products_qty"
  | "order_products_uom"
  | "order_variants_qty"
  | "order_variants_uom"
  | "order_automatically_added_products_qty"
  | "order_automatically_added_products_uom"
> {
  return {
    line_item_id: null,
    line_total: null,
    units_per_order_unit: null,
    total_units: null,
    order_products_name: null,
    order_products_uuid: null,
    order_variants_name: null,
    order_variants_uuid: null,
    order_automatically_added_products_name: null,
    order_automatically_added_products_uuid: null,
    order_products_qty: null,
    order_products_uom: null,
    order_variants_qty: null,
    order_variants_uom: null,
    order_automatically_added_products_qty: null,
    order_automatically_added_products_uom: null,
  };
}

function applyLineToRecord(
  row: SupervisorAcceptedOrderExportRecord,
  item: ItemRow,
  cache: CatalogCache,
  detail: IntegrationDetailLevel,
): void {
  const pid = String(item.product_id ?? "").trim();
  const pidKey = pid.toLowerCase();
  const fallbackName = String(item.name ?? "").trim() || "Item";
  const qty = num(item.qty);
  const uom = String(item.uom ?? "").trim() || null;

  row.line_item_id = item.id;
  if (detail === "full") {
    row.line_total = num(item.line_total);
    row.units_per_order_unit = num(item.units_per_order_unit);
    row.total_units = num(item.total_units);
  }

  if (cache.autoIds.has(pidKey)) {
    const product = cache.products.get(pidKey);
    row.order_automatically_added_products_uuid = product?.product_id ?? pid;
    if (detail !== "compact") {
      row.order_automatically_added_products_name = product?.name ?? fallbackName;
    }
    row.order_automatically_added_products_qty = qty;
    row.order_automatically_added_products_uom = uom;
    return;
  }

  const identity = resolveIdentity(cache, pid, fallbackName);
  row.order_products_uuid = identity.productUuid;
  if (detail !== "compact") {
    row.order_products_name = identity.productName;
  }

  if (identity.isVariant) {
    row.order_variants_uuid = identity.variantUuid;
    if (detail !== "compact") {
      row.order_variants_name = identity.variantName;
    }
    row.order_variants_qty = qty;
    row.order_variants_uom = uom;
  } else {
    row.order_products_qty = qty;
    row.order_products_uom = uom;
  }
}

export async function fetchSupervisorAcceptedOrdersExport(
  options?: FetchSupervisorAcceptedOrdersOptions,
): Promise<SupervisorAcceptedOrdersExportResponse> {
  const admin = createAdminClient();
  const limit = Math.min(
    Math.max(options?.limit ?? DEFAULT_ORDER_LIMIT, 1),
    MAX_ORDER_LIMIT,
  );
  const view: IntegrationExportView = options?.view === "summary" ? "summary" : "lines";
  const detail: IntegrationDetailLevel =
    options?.detail === "compact" || options?.detail === "full"
      ? options.detail
      : "standard";
  const activeOnly = options?.active_outlets_only !== false;

  let query = admin.from("outlet_orders").select(
    activeOnly
      ? "id, outlet_id, outlet_name, order_number, status, created_at, loaded_at, supervisor_accepted_at, updated_at, grand_total, employee_name, driver_id, outlets!inner(active)"
      : "id, outlet_id, outlet_name, order_number, status, created_at, loaded_at, supervisor_accepted_at, updated_at, grand_total, employee_name, driver_id, outlets(active)",
  );

  query = query
    .in("status", ["accepted", "loaded", "completed"])
    .not("supervisor_accepted_at", "is", null)
    .order("supervisor_accepted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (activeOnly) {
    query = query.eq("outlets.active", true);
  }

  if (options?.since?.trim()) {
    query = query.gte("supervisor_accepted_at", options.since.trim());
  }

  const decoded = options?.cursor?.trim() ? decodeOrdersCursor(options.cursor.trim()) : null;
  if (decoded) {
    const ts = decoded.acceptedAt.replace(/"/g, '\\"');
    const oid = decoded.orderId;
    query = query.or(
      `supervisor_accepted_at.lt."${ts}",and(supervisor_accepted_at.eq."${ts}",id.lt."${oid}")`,
    );
  }

  const { data: orderRows, error: ordersErr } = await query;
  if (ordersErr) throw new Error(ordersErr.message);

  const allOrders = (orderRows ?? []) as OrderRow[];
  const hasMore = allOrders.length > limit;
  const orders = hasMore ? allOrders.slice(0, limit) : allOrders;

  if (orders.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      view,
      detail,
      orders_in_page: 0,
      record_count: 0,
      next_cursor: null,
      records: [],
    };
  }

  const orderIds = orders.map((o) => o.id);
  const driverIds = orders.map((o) => o.driver_id).filter(Boolean) as string[];

  let items: ItemRow[] = [];
  if (view === "lines") {
    const { data: itemRows, error: itemsErr } = await admin
      .from("outlet_order_items")
      .select(
        "id, order_id, product_id, name, qty, uom, line_total, units_per_order_unit, total_units, sort_order",
      )
      .in("order_id", orderIds)
      .order("sort_order", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);
    items = (itemRows ?? []) as ItemRow[];
  }

  const productIds = items.map((i) => String(i.product_id));
  const cache = await buildCatalogCache(admin, productIds, driverIds);

  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  const records: SupervisorAcceptedOrderExportRecord[] = [];

  for (const order of orders) {
    const header = orderHeaderFields(order, cache, detail);

    if (view === "summary") {
      records.push({
        ...header,
        ...emptyLineFields(),
        line_count: itemsByOrder.get(order.id)?.length ?? 0,
      });
      continue;
    }

    const orderItems = itemsByOrder.get(order.id) ?? [];
    for (const item of orderItems) {
      const row: SupervisorAcceptedOrderExportRecord = {
        ...header,
        ...emptyLineFields(),
      };
      applyLineToRecord(row, item, cache, detail);
      records.push(row);
    }
  }

  const last = orders[orders.length - 1];
  const next_cursor =
    hasMore && last
      ? encodeOrdersCursor(last.supervisor_accepted_at, last.id)
      : null;

  return {
    generated_at: new Date().toISOString(),
    view,
    detail,
    orders_in_page: orders.length,
    record_count: records.length,
    next_cursor,
    records,
  };
}
