import type { SupabaseClient } from "@supabase/supabase-js";
import { formatReturnUnitBreakdown, totalReturnUnits } from "./order-units";

export type OutletReturnCatalogLine = {
  lineId: string;
  parentProductId: string;
  name: string;
  lineUom: string;
  returnUnitsPerOrder: number;
  returnUnitsPerOrderUom: string;
  imageUrl: string | null;
  qtyStep: number;
  isVariant: boolean;
};

export async function fetchOutletReturnCatalog(
  supabase: SupabaseClient,
): Promise<{ ok: true; lines: OutletReturnCatalogLine[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("list_outlet_return_catalog");
  if (error) return { ok: false, error: error.message };

  const source = Array.isArray(data) ? data : [];

  const lines = source
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const lineId = typeof r.line_id === "string" ? r.line_id : "";
      const parentProductId = typeof r.parent_product_id === "string" ? r.parent_product_id : "";
      const name = typeof r.name === "string" ? r.name : "";
      if (!lineId || !name) return null;
      return {
        lineId,
        parentProductId,
        name,
        lineUom: typeof r.line_uom === "string" ? r.line_uom : "",
        returnUnitsPerOrder: Number(r.return_units_per_order ?? 1),
        returnUnitsPerOrderUom:
          typeof r.return_units_per_order_uom === "string"
            ? r.return_units_per_order_uom
            : "pcs",
        imageUrl:
          typeof r.image_url === "string" && r.image_url.trim() ? r.image_url.trim() : null,
        qtyStep: Number(r.qty_step ?? 1) > 0 ? Number(r.qty_step ?? 1) : 1,
        isVariant: Boolean(r.is_variant),
      };
    })
    .filter((l): l is OutletReturnCatalogLine => l != null);

  return { ok: true, lines };
}

export function formatReturnQtyHint(line: OutletReturnCatalogLine, qty: number): string {
  const breakdown = formatReturnUnitBreakdown(
    qty,
    line.lineUom,
    line.returnUnitsPerOrder,
    line.returnUnitsPerOrderUom,
  );
  if (breakdown) return breakdown;
  const uom = line.returnUnitsPerOrderUom.trim() || "pcs";
  return `Enter qty in ${line.lineUom || "units"} (returns in ${uom})`;
}

export function totalReturnUnitsForLine(line: OutletReturnCatalogLine, qty: number): number {
  return totalReturnUnits(qty, line.returnUnitsPerOrder);
}
