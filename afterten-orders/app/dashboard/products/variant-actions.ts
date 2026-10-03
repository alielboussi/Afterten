"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { normalizeProductUuid } from "@/lib/portal/product-id";
import { PRODUCTS_LIST_TAG } from "@/lib/portal/products-cache";
import {
  PRODUCT_IMAGES_BUCKET,
  publicProductImageUrl,
  variantImageStoragePath,
} from "@/lib/supabase/product-images";

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

/** Persists variant order; sort_order becomes 1…n per product (independent of product catalog sort). */
export async function reorderProductVariants(parentProductId: string, orderedRowIds: string[]) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const productId = normalizeProductUuid(parentProductId);
  if (!productId) return { ok: false as const, error: "Invalid parent product UUID." };

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);

  if (fetchErr) return { ok: false as const, error: fetchErr.message };

  const validIds = new Set((existing ?? []).map((r) => r.id as string));
  if (orderedRowIds.length !== validIds.size || orderedRowIds.some((id) => !validIds.has(id))) {
    return { ok: false as const, error: "Variant list changed — refresh the page and try again." };
  }

  const now = new Date().toISOString();
  for (let index = 0; index < orderedRowIds.length; index++) {
    const id = orderedRowIds[index];
    const { error } = await admin
      .from("product_variants")
      .update({ sort_order: index + 1, updated_at: now })
      .eq("id", id);
    if (error) return { ok: false as const, error: error.message };
  }

  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const };
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
    const { data: existingRow, error: fetchRowErr } = await admin
      .from("product_variants")
      .select("variant_id")
      .eq("id", input.id)
      .maybeSingle();

    if (fetchRowErr) return { ok: false as const, error: fetchRowErr.message };
    if (!existingRow) return { ok: false as const, error: "Variant not found." };

    const previousVariantId = String(existingRow.variant_id ?? "").toLowerCase();
    if (variantId.toLowerCase() !== previousVariantId) {
      const { data: taken, error: takenErr } = await admin
        .from("product_variants")
        .select("id, name")
        .eq("variant_id", variantId)
        .neq("id", input.id)
        .maybeSingle();

      if (takenErr) return { ok: false as const, error: takenErr.message };
      if (taken) {
        return {
          ok: false as const,
          error: `That variant UUID is already used by “${taken.name}”.`,
        };
      }
    }

    const { error } = await admin.from("product_variants").update(row).eq("id", input.id);
    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, error: "That variant UUID already exists." };
      }
      return { ok: false as const, error: error.message };
    }
  } else {
    const { data: inserted, error } = await admin.from("product_variants").insert(row).select("id").single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, error: "That variant UUID already exists." };
      }
      return { ok: false as const, error: error.message };
    }
    await admin
      .from("products")
      .update({ has_variants: true, updated_at: new Date().toISOString() })
      .eq("product_id", productId);

    revalidateTag(PRODUCTS_LIST_TAG);
    return { ok: true as const, id: inserted.id as string };
  }

  await admin.from("products").update({ has_variants: true, updated_at: new Date().toISOString() }).eq("product_id", productId);

  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const, id: input.id };
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

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadVariantImage(
  variantRowId: string,
  parentProductId: string,
  variantId: string,
  formData: FormData,
) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const parentId = normalizeProductUuid(parentProductId);
  const vid = normalizeProductUuid(variantId);
  if (!variantRowId || !parentId || !vid) {
    return { ok: false as const, error: "Invalid variant." };
  }

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
  const storagePath = variantImageStoragePath(parentId, vid, file.name);
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
    .from("product_variants")
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", variantRowId);

  if (updateError) return { ok: false as const, error: updateError.message };

  // Client components update previews locally; avoid revalidatePath (causes removeChild crashes in open UI).
  return { ok: true as const, imageUrl };
}

export async function clearVariantImage(variantRowId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!variantRowId) return { ok: false as const, error: "Invalid variant." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_variants")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("id", variantRowId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
