import type { OutletProduct, OutletProductVariant } from "./supabase";

function pickCatalogImageUrl(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const a = primary?.trim();
  if (a) return a;
  const b = fallback?.trim();
  return b || null;
}

/** Variant rows use parent units-per-order and fall back to parent image when needed. */
export function applyParentCatalogToVariant(
  variant: OutletProductVariant,
  parent: Pick<
    OutletProduct,
    | "image_url"
    | "units_per_order_unit"
    | "units_per_order_uom"
    | "max_order_qty"
    | "max_order_qty_days"
    | "window_ordered_qty"
  >,
): OutletProductVariant {
  return {
    ...variant,
    image_url: pickCatalogImageUrl(variant.image_url, parent.image_url),
    units_per_order_unit: parent.units_per_order_unit,
    units_per_order_uom: parent.units_per_order_uom,
    max_order_qty: parent.max_order_qty,
    max_order_qty_days: parent.max_order_qty_days,
    window_ordered_qty: variant.window_ordered_qty,
  };
}

export function applyParentCatalogToProduct(product: OutletProduct): OutletProduct {
  return {
    ...product,
    variants: product.variants.map((v) => applyParentCatalogToVariant(v, product)),
  };
}
