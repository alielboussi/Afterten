"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { normalizeProductUuid } from "@/lib/portal/product-id";
import { PRODUCTS_LIST_TAG } from "@/lib/portal/products-cache";

export type ProductVariantInput = {
  id?: string;
  variantId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string;
  sortOrder: number;
  qtyStep: number;
  minOrderQty: string;
  maxOrderQty: string;
  active: boolean;
  liveQtyGateEnabled: boolean;
};

function parseOptionalQty(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function listProductVariants(parentProductId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const pid = normalizeProductUuid(parentProductId);
  if (!pid) return { ok: false as const, error: "Invalid parent product UUID." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_variants")
    .select(
      "id, variant_id, name, uom, unit_cost, image_url, sort_order, qty_step, min_order_qty, max_order_qty, active, live_qty_gate_enabled",
    )
    .eq("product_id", pid)
    .order("sort_order")
    .order("name");

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, rows: data ?? [] };
}

export async function saveProductVariant(parentProductId: string, input: ProductVariantInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const productId = normalizeProductUuid(parentProductId);
  const variantId = normalizeProductUuid(input.variantId);
  if (!productId || !variantId) {
    return { ok: false as const, error: "Parent and variant UUIDs must be valid." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Variant name is required." };

  const uom = input.uom.trim() || "pc";
  const qtyStep = input.qtyStep > 0 ? input.qtyStep : 1;
  const minOrderQty = parseOptionalQty(input.minOrderQty);
  const maxOrderQty = parseOptionalQty(input.maxOrderQty);
  if (minOrderQty !== null && maxOrderQty !== null && minOrderQty > maxOrderQty) {
    return { ok: false as const, error: "Min qty cannot exceed max qty." };
  }

  const admin = createAdminClient();
  const row = {
    product_id: productId,
    variant_id: variantId,
    name,
    uom,
    unit_cost: input.unitCost,
    image_url: input.imageUrl.trim() || null,
    sort_order: input.sortOrder,
    qty_step: qtyStep,
    min_order_qty: minOrderQty,
    max_order_qty: maxOrderQty,
    active: input.active,
    live_qty_gate_enabled: input.liveQtyGateEnabled,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await admin.from("product_variants").update(row).eq("id", input.id);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await admin.from("product_variants").insert(row);
    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, error: "That variant UUID already exists." };
      }
      return { ok: false as const, error: error.message };
    }
  }

  await admin.from("products").update({ has_variants: true, updated_at: new Date().toISOString() }).eq("product_id", productId);

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const };
}

export async function deleteProductVariant(variantRowId: string, parentProductId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const productId = normalizeProductUuid(parentProductId);
  if (!productId || !variantRowId) return { ok: false as const, error: "Invalid variant." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_variants").delete().eq("id", variantRowId);
  if (error) return { ok: false as const, error: error.message };

  const { count } = await admin
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if ((count ?? 0) === 0) {
    await admin.from("products").update({ has_variants: false, updated_at: new Date().toISOString() }).eq("product_id", productId);
  }

  revalidatePath("/dashboard/products");
  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const };
}

export async function setProductHasVariants(productDbId: string, parentProductId: string, enabled: boolean) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const pid = normalizeProductUuid(parentProductId);
  if (!pid) return { ok: false as const, error: "Invalid product UUID." };

  if (!enabled) {
    const { count } = await admin
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", pid);
    if ((count ?? 0) > 0) {
      return {
        ok: false as const,
        error: "Remove all variants before turning off “Has variants”.",
      };
    }
  }

  const { error } = await admin
    .from("products")
    .update({ has_variants: enabled, updated_at: new Date().toISOString() })
    .eq("id", productDbId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/products");
  revalidateTag(PRODUCTS_LIST_TAG);
  revalidateTag(`product-${productDbId}`);
  return { ok: true as const };
}
