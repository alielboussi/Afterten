import type { SupabaseClient } from "@supabase/supabase-js";

export type SupervisorOrderLineDetail = {
  item_id: string;
  product_id: string;
  parent_product_id: string;
  is_variant: boolean;
  is_auto: boolean;
  name: string;
  qty: number;
  uom: string;
  unit_cost: number;
  line_total: number;
  variants: { variant_id: string; name: string; uom: string; unit_cost: number }[];
};

export type SupervisorOrderDetail = {
  order_id: string;
  outlet_id: string;
  outlet_name: string;
  order_number: string;
  status: string;
  employee_name: string | null;
  grand_total: number;
  created_at: string;
  lines: SupervisorOrderLineDetail[];
};

export type SupervisorPreviewLine = {
  product_id: string;
  parent_product_id: string;
  is_variant: boolean;
  is_auto: boolean;
  name: string;
  qty: number;
  uom: string;
  line_total: number;
};

export type EditableOrderLine = {
  product_id: string;
  parent_product_id: string;
  name: string;
  qty: number;
  uom: string;
  is_variant: boolean;
  variants: SupervisorOrderLineDetail["variants"];
};

function parseDetail(raw: unknown): SupervisorOrderDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const linesRaw = o.lines;
  const lines: SupervisorOrderLineDetail[] = Array.isArray(linesRaw)
    ? linesRaw.map((row) => {
        const r = row as Record<string, unknown>;
        const variantsRaw = r.variants;
        const variants = Array.isArray(variantsRaw)
          ? variantsRaw.map((v) => {
              const vr = v as Record<string, unknown>;
              return {
                variant_id: String(vr.variant_id ?? ""),
                name: String(vr.name ?? ""),
                uom: String(vr.uom ?? ""),
                unit_cost: Number(vr.unit_cost ?? 0),
              };
            })
          : [];
        return {
          item_id: String(r.item_id ?? ""),
          product_id: String(r.product_id ?? ""),
          parent_product_id: String(r.parent_product_id ?? ""),
          is_variant: Boolean(r.is_variant),
          is_auto: Boolean(r.is_auto),
          name: String(r.name ?? ""),
          qty: Number(r.qty ?? 0),
          uom: String(r.uom ?? ""),
          unit_cost: Number(r.unit_cost ?? 0),
          line_total: Number(r.line_total ?? 0),
          variants,
        };
      })
    : [];

  return {
    order_id: String(o.order_id ?? ""),
    outlet_id: String(o.outlet_id ?? ""),
    outlet_name: String(o.outlet_name ?? ""),
    order_number: String(o.order_number ?? ""),
    status: String(o.status ?? ""),
    employee_name: o.employee_name != null ? String(o.employee_name) : null,
    grand_total: Number(o.grand_total ?? 0),
    created_at: String(o.created_at ?? ""),
    lines,
  };
}

export function editableLinesFromDetail(detail: SupervisorOrderDetail): EditableOrderLine[] {
  return detail.lines
    .filter((l) => !l.is_auto)
    .map((l) => ({
      product_id: l.product_id,
      parent_product_id: l.parent_product_id,
      name: l.name,
      qty: l.qty,
      uom: l.uom,
      is_variant: l.is_variant,
      variants: l.variants,
    }));
}

export function buildItemsPayload(lines: EditableOrderLine[]): { product_id: string; qty: number }[] {
  return lines
    .filter((l) => l.qty > 0)
    .map((l) => ({ product_id: l.product_id, qty: l.qty }));
}

export async function fetchSupervisorOrderDetail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ detail: SupervisorOrderDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_supervisor_order_detail", {
    p_order_id: orderId,
  });
  if (error) return { detail: null, error: error.message };
  const detail = parseDetail(data);
  if (!detail) return { detail: null, error: "Could not load order." };
  return { detail, error: null };
}

export async function previewSupervisorOrderRevision(
  supabase: SupabaseClient,
  items: { product_id: string; qty: number }[],
): Promise<{
  lines: SupervisorPreviewLine[];
  grandTotal: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("preview_supervisor_order_revision", {
    p_items: items,
  });
  if (error) return { lines: [], grandTotal: 0, error: error.message };
  const row = data as Record<string, unknown>;
  const linesRaw = row.lines;
  const lines: SupervisorPreviewLine[] = Array.isArray(linesRaw)
    ? linesRaw.map((line) => {
        const r = line as Record<string, unknown>;
        return {
          product_id: String(r.product_id ?? ""),
          parent_product_id: String(r.parent_product_id ?? ""),
          is_variant: Boolean(r.is_variant),
          is_auto: Boolean(r.is_auto),
          name: String(r.name ?? ""),
          qty: Number(r.qty ?? 0),
          uom: String(r.uom ?? ""),
          line_total: Number(r.line_total ?? 0),
        };
      })
    : [];
  return { lines, grandTotal: Number(row.grand_total ?? 0), error: null };
}

export async function acceptSupervisorOrder(
  supabase: SupabaseClient,
  orderId: string,
  items: { product_id: string; qty: number }[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("accept_supervisor_order", {
    p_order_id: orderId,
    p_items: items,
  });
  return { error: error?.message ?? null };
}
