import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-server";

export type LiveQtyStockAlert = {
  inventoryProductId: string;
  displayName: string;
  kind: "product" | "variant";
  parentName: string | null;
  liveQty: number;
  syncedAt: string | null;
  editHref: string;
};

function isOutOfStock(qty: number | null | undefined): boolean {
  if (qty == null || !Number.isFinite(Number(qty))) return true;
  return Number(qty) <= 0;
}

/** Active catalog lines with live qty gate on and inventory qty ≤ 0 (or never synced). */
export async function fetchLiveQtyOutOfStockAlerts(): Promise<LiveQtyStockAlert[]> {
  const admin = createAdminClient();
  const alerts: LiveQtyStockAlert[] = [];

  const { data: simpleProducts, error: prodErr } = await admin
    .from("products")
    .select("id, product_id, name")
    .eq("active", true)
    .eq("live_qty_gate_enabled", true)
    .eq("has_variants", false);

  if (prodErr) throw new Error(prodErr.message);

  const { data: variants, error: varErr } = await admin
    .from("product_variants")
    .select("variant_id, name, product_id, products!inner(id, name, active)")
    .eq("active", true)
    .eq("live_qty_gate_enabled", true);

  if (varErr) throw new Error(varErr.message);

  type Sku = {
    inventoryId: string;
    name: string;
    kind: "product" | "variant";
    parentName: string | null;
    editHref: string;
  };

  const skus: Sku[] = [];

  for (const row of simpleProducts ?? []) {
    skus.push({
      inventoryId: String(row.product_id),
      name: String(row.name),
      kind: "product",
      parentName: null,
      editHref: `/dashboard/products/${row.id}/edit`,
    });
  }

  for (const row of variants ?? []) {
    const parent = row.products as { id?: string; name?: string; active?: boolean } | null;
    if (parent?.active === false) continue;
    const parentDbId = parent?.id;
    skus.push({
      inventoryId: String(row.variant_id),
      name: String(row.name),
      kind: "variant",
      parentName: parent?.name ? String(parent.name) : null,
      editHref: parentDbId ? `/dashboard/products/${parentDbId}/edit` : "/dashboard/products",
    });
  }

  if (skus.length === 0) return [];

  const { data: qtyRows, error: qtyErr } = await admin
    .from("product_live_qty")
    .select("product_id, qty, synced_at")
    .in(
      "product_id",
      skus.map((s) => s.inventoryId),
    );

  if (qtyErr) throw new Error(qtyErr.message);

  const qtyById = new Map<string, { qty: number; syncedAt: string | null }>();
  for (const row of qtyRows ?? []) {
    const id = String(row.product_id).toLowerCase();
    qtyById.set(id, {
      qty: Number(row.qty ?? 0),
      syncedAt: row.synced_at != null ? String(row.synced_at) : null,
    });
  }

  for (const sku of skus) {
    const live = qtyById.get(sku.inventoryId.toLowerCase());
    const liveQty = live?.qty ?? 0;
    if (!isOutOfStock(liveQty)) continue;
    alerts.push({
      inventoryProductId: sku.inventoryId,
      displayName: sku.name,
      kind: sku.kind,
      parentName: sku.parentName,
      liveQty,
      syncedAt: live?.syncedAt ?? null,
      editHref: sku.editHref,
    });
  }

  alerts.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return alerts;
}

export async function upsertProductLiveQtyBatch(
  items: { product_id: string; qty: number }[],
): Promise<{ updated: number; skipped: string[] }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  let updated = 0;
  const skipped: string[] = [];

  for (const item of items) {
    const productId = item.product_id.trim().toUpperCase();
    if (!productId) {
      skipped.push("(empty product_id)");
      continue;
    }
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty < 0) {
      skipped.push(productId);
      continue;
    }

    const { error } = await admin.from("product_live_qty").upsert(
      {
        product_id: productId,
        qty,
        synced_at: now,
        source: "external_api",
      },
      { onConflict: "product_id" },
    );

    if (error) {
      skipped.push(productId);
      continue;
    }
    updated += 1;
  }

  return { updated, skipped };
}
