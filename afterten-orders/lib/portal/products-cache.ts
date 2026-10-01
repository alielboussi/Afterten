import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type ProductRow = {
  id: string;
  productId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string | null;
  active: boolean;
  liveQtyGateEnabled: boolean;
  sortOrder: number;
  qtyStep: number;
  minOrderQty: number | null;
  maxOrderQty: number | null;
};

function mapProduct(row: Record<string, unknown>): ProductRow {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    name: row.name as string,
    uom: row.uom as string,
    unitCost: Number(row.unit_cost),
    imageUrl: (row.image_url as string | null) ?? null,
    active: row.active as boolean,
    liveQtyGateEnabled: row.live_qty_gate_enabled as boolean,
    sortOrder: row.sort_order as number,
    qtyStep: Number(row.qty_step ?? 1),
    minOrderQty: row.min_order_qty != null ? Number(row.min_order_qty) : null,
    maxOrderQty: row.max_order_qty != null ? Number(row.max_order_qty) : null,
  };
}

const productSelect =
  "id, product_id, name, uom, unit_cost, image_url, active, live_qty_gate_enabled, sort_order, qty_step, min_order_qty, max_order_qty";

async function fetchProductsList(): Promise<ProductRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("products").select(productSelect).order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapProduct(row as Record<string, unknown>));
}

export function getCachedProductsList() {
  return unstable_cache(fetchProductsList, ["products-list-v2"], {
    revalidate: 60,
    tags: ["products-list"],
  })();
}

export function getCachedProduct(id: string) {
  return unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("products").select(productSelect).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return mapProduct(data as Record<string, unknown>);
    },
    ["product-row-v2", id],
    { revalidate: 30, tags: ["products-list", `product-${id}`] },
  )();
}

export const PRODUCTS_LIST_TAG = "products-list";
