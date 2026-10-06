import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOffloadingDisplayGroups,
  type OffloadingDisplayGroup,
  type OffloadingLine,
} from "./offloading-display";
import { getCachedOutletOrderRules } from "./order-rules-session-cache";
import { parseRpcJsonRows } from "./rpc-json";

export type OffloadingOrderRow = {
  order_id: string;
  order_number: string;
  outlet_name: string;
  grand_total: number;
  loaded_at: string | null;
  offloading_checklist_completed_at: string | null;
  driver_name: string | null;
};

export type OffloadingOrderDetail = {
  order_id: string;
  outlet_id: string;
  outlet_name: string;
  order_number: string;
  grand_total: number;
  loaded_at: string | null;
  offloading_checklist_completed_at: string | null;
  lines: OffloadingLine[];
  groups: OffloadingDisplayGroup[];
};

export async function fetchOffloadingOrders(
  supabase: SupabaseClient,
): Promise<{ orders: OffloadingOrderRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_outlet_offloading_orders");
  if (error) return { orders: [], error: error.message };
  const rows = parseRpcJsonRows(data);
  return {
    orders: rows.map((r) => {
      return {
        order_id: String(r.order_id ?? ""),
        order_number: String(r.order_number ?? ""),
        outlet_name: String(r.outlet_name ?? ""),
        grand_total: Number(r.grand_total ?? 0),
        loaded_at: r.loaded_at != null ? String(r.loaded_at) : null,
        offloading_checklist_completed_at:
          r.offloading_checklist_completed_at != null
            ? String(r.offloading_checklist_completed_at)
            : null,
        driver_name: r.driver_name != null ? String(r.driver_name) : null,
      };
    }),
    error: null,
  };
}

export async function fetchOffloadingOrderDetail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ detail: OffloadingOrderDetail | null; error: string | null }> {
  const [detailRes, rulesRes] = await Promise.all([
    supabase.rpc("get_outlet_offloading_order_detail", { p_order_id: orderId }),
    getCachedOutletOrderRules(supabase),
  ]);
  if (detailRes.error) return { detail: null, error: detailRes.error.message };

  const o = detailRes.data as Record<string, unknown>;
  const linesRaw = Array.isArray(o.lines) ? o.lines : [];
  const lines: OffloadingLine[] = linesRaw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      item_id: String(r.item_id ?? ""),
      product_id: String(r.product_id ?? "").toLowerCase(),
      parent_product_id: String(r.parent_product_id ?? "").toLowerCase(),
      parent_name: r.parent_name != null ? String(r.parent_name) : null,
      is_variant: Boolean(r.is_variant),
      is_auto: Boolean(r.is_auto),
      name: String(r.name ?? ""),
      qty: Number(r.qty ?? 0),
      uom: String(r.uom ?? ""),
      line_total: Number(r.line_total ?? 0),
      sort_order: Number(r.sort_order ?? 0),
    };
  });

  const rules = rulesRes;
  const groups = buildOffloadingDisplayGroups(lines, rules);

  return {
    detail: {
      order_id: String(o.order_id ?? ""),
      outlet_id: String(o.outlet_id ?? ""),
      outlet_name: String(o.outlet_name ?? ""),
      order_number: String(o.order_number ?? ""),
      grand_total: Number(o.grand_total ?? 0),
      loaded_at: o.loaded_at != null ? String(o.loaded_at) : null,
      offloading_checklist_completed_at:
        o.offloading_checklist_completed_at != null
          ? String(o.offloading_checklist_completed_at)
          : null,
      lines,
      groups,
    },
    error: null,
  };
}

export async function confirmOffloadingChecklist(
  supabase: SupabaseClient,
  orderId: string,
  checkedItemIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("confirm_outlet_offloading_checklist", {
    p_order_id: orderId,
    p_checked_item_ids: checkedItemIds,
  });
  return { error: error?.message ?? null };
}

export async function completeOutletOrder(
  supabase: SupabaseClient,
  orderId: string,
  offloaderName: string,
  offloaderSignaturePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("complete_outlet_order", {
    p_order_id: orderId,
    p_offloader_name: offloaderName,
    p_offloader_signature_path: offloaderSignaturePath,
  });
  return { error: error?.message ?? null };
}
