import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type OrderRulesContext,
} from "./supervisor-preview-display";

export type LoadingLine = {
  item_id: string;
  product_id: string;
  parent_product_id: string;
  is_auto: boolean;
  name: string;
  qty: number;
  uom: string;
};

export type LoadingOrderDetail = {
  order_id: string;
  outlet_id: string;
  outlet_name: string;
  order_number: string;
  loading_checklist_completed_at: string | null;
  lines: LoadingLine[];
};

export type LoadingChecklistRow = {
  rowKey: string;
  kind: "main" | "auto";
  item_id: string;
  name: string;
  qty: number;
  uom: string;
};

export type LoadingChecklistGroup = {
  groupKey: string;
  rows: LoadingChecklistRow[];
};

export type DeliveryDriver = { id: string; name: string };

export async function fetchDeliveryLoadingDetail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ detail: LoadingOrderDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_delivery_loading_order_detail", {
    p_order_id: orderId,
  });
  if (error) return { detail: null, error: error.message };
  const o = data as Record<string, unknown>;
  const linesRaw = Array.isArray(o.lines) ? o.lines : [];
  const lines: LoadingLine[] = linesRaw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      item_id: String(r.item_id ?? ""),
      product_id: String(r.product_id ?? "").toLowerCase(),
      parent_product_id: String(r.parent_product_id ?? "").toLowerCase(),
      is_auto: Boolean(r.is_auto),
      name: String(r.name ?? ""),
      qty: Number(r.qty ?? 0),
      uom: String(r.uom ?? ""),
    };
  });
  return {
    detail: {
      order_id: String(o.order_id ?? ""),
      outlet_id: String(o.outlet_id ?? ""),
      outlet_name: String(o.outlet_name ?? ""),
      order_number: String(o.order_number ?? ""),
      loading_checklist_completed_at:
        o.loading_checklist_completed_at != null
          ? String(o.loading_checklist_completed_at)
          : null,
      lines,
    },
    error: null,
  };
}

export function buildLoadingChecklistGroupsFromLines(
  lines: LoadingLine[],
  rulesContext: OrderRulesContext,
): LoadingChecklistGroup[] {
  const manualLines = lines.filter((l) => !l.is_auto);
  const autoLines = lines.filter((l) => l.is_auto);
  const assignedAutoIds = new Set<string>();
  const groups: LoadingChecklistGroup[] = [];

  for (const manual of manualLines) {
    const rows: LoadingChecklistRow[] = [
      {
        rowKey: `${manual.item_id}-main`,
        kind: "main",
        item_id: manual.item_id,
        name: manual.name,
        qty: manual.qty,
        uom: manual.uom,
      },
    ];

    const triggerKeys = new Set(
      [manual.product_id, manual.parent_product_id].filter(Boolean).map((k) => k.toLowerCase()),
    );
    const addedProductIds = new Set(
      rulesContext.rules
        .filter((r) => triggerKeys.has(r.trigger_product_id))
        .map((r) => r.added_product_id),
    );

    for (const auto of autoLines) {
      if (assignedAutoIds.has(auto.item_id)) continue;
      if (!addedProductIds.has(auto.product_id)) continue;
      assignedAutoIds.add(auto.item_id);
      rows.push({
        rowKey: `${manual.item_id}-auto-${auto.item_id}`,
        kind: "auto",
        item_id: auto.item_id,
        name: auto.name,
        qty: auto.qty,
        uom: auto.uom,
      });
    }

    groups.push({ groupKey: manual.item_id, rows });
  }

  for (const auto of autoLines) {
    if (assignedAutoIds.has(auto.item_id)) continue;
    groups.push({
      groupKey: auto.item_id,
      rows: [
        {
          rowKey: `${auto.item_id}-auto`,
          kind: "auto",
          item_id: auto.item_id,
          name: auto.name,
          qty: auto.qty,
          uom: auto.uom,
        },
      ],
    });
  }

  return groups;
}

export async function confirmLoadingChecklist(
  supabase: SupabaseClient,
  orderId: string,
  checkedItemIds: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("confirm_delivery_loading_checklist", {
    p_order_id: orderId,
    p_checked_item_ids: checkedItemIds,
  });
  return { error: error?.message ?? null };
}

export async function fetchDeliveryDrivers(
  supabase: SupabaseClient,
): Promise<{ drivers: DeliveryDriver[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_delivery_drivers");
  if (error) return { drivers: [], error: error.message };
  const rows = Array.isArray(data) ? data : [];
  return {
    drivers: rows.map((row) => {
      const r = row as Record<string, unknown>;
      return { id: String(r.id ?? ""), name: String(r.name ?? "") };
    }),
    error: null,
  };
}

export async function completeDriverHandoff(
  supabase: SupabaseClient,
  orderId: string,
  driverId: string,
  driverSignaturePath: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("complete_driver_handoff", {
    p_order_id: orderId,
    p_driver_id: driverId,
    p_driver_signature_path: driverSignaturePath,
  });
  return { error: error?.message ?? null };
}

export { fetchOrderRulesContext } from "./supervisor-preview-display";
