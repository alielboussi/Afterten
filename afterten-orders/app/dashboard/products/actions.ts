"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { normalizeProductUuid } from "@/lib/portal/product-id";
import { PRODUCTS_LIST_TAG } from "@/lib/portal/products-cache";
import {
  PRODUCT_IMAGES_BUCKET,
  productImageStoragePath,
  publicProductImageUrl,
} from "@/lib/supabase/product-images";

export type ProductInput = {
  productId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string;
  active: boolean;
  liveQtyGateEnabled: boolean;
  sortOrder: number;
  qtyStep: number;
  minOrderQty: string;
  maxOrderQty: string;
  maxOrderQtyDays: string;
  unitsPerOrderUnit: number;
  unitsPerOrderUom: string;
  hasVariants: boolean;
};

function parseOptionalQty(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseOptionalDays(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Next product catalog sort_order only (not variant sorts). Max + 1, or 0 when catalog empty. */
export async function getNextProductSortOrder() {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  const max = data?.sort_order;
  const next = typeof max === "number" && Number.isFinite(max) ? max + 1 : 0;
  return { ok: true as const, next };
}

export async function createProduct(input: ProductInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const productId = normalizeProductUuid(input.productId);
  if (!productId) {
    return { ok: false as const, error: "Product UUID must be a valid UUID (inventory API id)." };
  }

  const name = input.name.trim();
  const uom = input.uom.trim() || "pc";
  const imageUrl = input.imageUrl.trim() || null;
  const qtyStep = input.qtyStep > 0 ? input.qtyStep : 1;
  const minOrderQty = parseOptionalQty(input.minOrderQty);
  const maxOrderQty = parseOptionalQty(input.maxOrderQty);
  const maxOrderQtyDays = parseOptionalDays(input.maxOrderQtyDays);

  if (!name) return { ok: false as const, error: "Name is required." };
  if (input.unitCost < 0) return { ok: false as const, error: "Price cannot be negative." };
  if (minOrderQty !== null && maxOrderQty !== null && minOrderQty > maxOrderQty) {
    return { ok: false as const, error: "Min qty cannot exceed max qty." };
  }
  if (maxOrderQtyDays !== null && maxOrderQty === null) {
    return { ok: false as const, error: "Set max order qty when using a rolling day limit." };
  }
  const unitsPerOrderUnit = input.unitsPerOrderUnit > 0 ? input.unitsPerOrderUnit : 1;
  const unitsPerOrderUom = input.unitsPerOrderUom.trim() || "pcs";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .insert({
      id: productId,
      product_id: productId,
      name,
      uom,
      unit_cost: input.unitCost,
      image_url: imageUrl,
      active: input.active,
      live_qty_gate_enabled: input.liveQtyGateEnabled,
      sort_order: input.sortOrder,
      qty_step: qtyStep,
      min_order_qty: minOrderQty,
      max_order_qty: maxOrderQty,
      max_order_qty_days: maxOrderQtyDays,
      units_per_order_unit: unitsPerOrderUnit,
      units_per_order_uom: unitsPerOrderUom,
      has_variants: input.hasVariants,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return { ok: false as const, error: "That product UUID already exists." };
    }
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/dashboard/products");
  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const, id: data.id as string, productId };
}

export async function updateProduct(id: string, input: ProductInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!id) return { ok: false as const, error: "Invalid product." };

  const productId = normalizeProductUuid(input.productId);
  if (!productId) {
    return { ok: false as const, error: "Product UUID must be a valid UUID." };
  }

  const name = input.name.trim();
  const uom = input.uom.trim() || "pc";
  const imageUrl = input.imageUrl.trim() || null;
  const qtyStep = input.qtyStep > 0 ? input.qtyStep : 1;
  const minOrderQty = parseOptionalQty(input.minOrderQty);
  const maxOrderQty = parseOptionalQty(input.maxOrderQty);
  const maxOrderQtyDays = parseOptionalDays(input.maxOrderQtyDays);

  if (!name) return { ok: false as const, error: "Name is required." };
  if (minOrderQty !== null && maxOrderQty !== null && minOrderQty > maxOrderQty) {
    return { ok: false as const, error: "Min qty cannot exceed max qty." };
  }
  if (maxOrderQtyDays !== null && maxOrderQty === null) {
    return { ok: false as const, error: "Set max order qty when using a rolling day limit." };
  }
  const unitsPerOrderUnit = input.unitsPerOrderUnit > 0 ? input.unitsPerOrderUnit : 1;
  const unitsPerOrderUom = input.unitsPerOrderUom.trim() || "pcs";

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({
      product_id: productId,
      name,
      uom,
      unit_cost: input.unitCost,
      image_url: imageUrl,
      active: input.active,
      live_qty_gate_enabled: input.liveQtyGateEnabled,
      sort_order: input.sortOrder,
      qty_step: qtyStep,
      min_order_qty: minOrderQty,
      max_order_qty: maxOrderQty,
      max_order_qty_days: maxOrderQtyDays,
      units_per_order_unit: unitsPerOrderUnit,
      units_per_order_uom: unitsPerOrderUom,
      has_variants: input.hasVariants,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${id}/edit`);
  revalidateTag(PRODUCTS_LIST_TAG);
  revalidateTag(`product-${id}`);

  await admin
    .from("product_variants")
    .update({
      min_order_qty: minOrderQty,
      max_order_qty: maxOrderQty,
      max_order_qty_days: maxOrderQtyDays,
      units_per_order_unit: unitsPerOrderUnit,
      units_per_order_uom: unitsPerOrderUom,
      updated_at: new Date().toISOString(),
    })
    .eq("product_id", productId);

  return { ok: true as const };
}

export async function setProductLiveQtyGate(id: string, enabled: boolean) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!id) return { ok: false as const, error: "Invalid product." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({
      live_qty_gate_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/products");
  revalidateTag(PRODUCTS_LIST_TAG);
  revalidateTag(`product-${id}`);
  return { ok: true as const };
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadProductImage(productDbId: string, formData: FormData) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!productDbId) return { ok: false as const, error: "Invalid product." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an image file." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false as const, error: "Image must be 5 MB or smaller." };
  }
  const mime = file.type || "";
  if (!IMAGE_MIME_TYPES.has(mime)) {
    return { ok: false as const, error: "Use JPEG, PNG, WebP, or GIF." };
  }

  const admin = createAdminClient();
  const { data: product, error: fetchError } = await admin
    .from("products")
    .select("product_id")
    .eq("id", productDbId)
    .maybeSingle();

  if (fetchError || !product?.product_id) {
    return { ok: false as const, error: fetchError?.message ?? "Product not found." };
  }

  const storagePath = productImageStoragePath(String(product.product_id), file.name);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(PRODUCT_IMAGES_BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });

  if (uploadError) return { ok: false as const, error: uploadError.message };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { ok: false as const, error: "Missing Supabase URL in server env." };
  }

  const imageUrl = publicProductImageUrl(supabaseUrl, storagePath);

  const { error: updateError } = await admin
    .from("products")
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", productDbId);

  if (updateError) return { ok: false as const, error: updateError.message };

  // Client updates preview; skip path revalidation while user is on catalog/edit UI.
  return { ok: true as const, imageUrl };
}

export async function clearProductImage(productDbId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!productDbId) return { ok: false as const, error: "Invalid product." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("id", productDbId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
