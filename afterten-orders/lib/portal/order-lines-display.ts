import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAutoAddedQtyByProductId,
  displayQtyForOrderLine,
  type ManualOrderLine,
  type OrderRuleRow,
} from "@/lib/orders/order-rule-qty";
import { sortOrderLinesForDisplay } from "@/lib/orders/sort-order-lines";

export type PortalOrderLineRow = {
  id: string;
  name: string;
  display_qty: number;
  stored_qty: number;
  uom: string;
  unit_cost: number;
  units_per_order_unit: number;
  total_units: number;
  line_total: number;
  is_auto: boolean;
  qty_adjusted: boolean;
  product_id: string;
  parent_product_id: string;
  is_variant: boolean;
  sort_order: number;
};

async function loadOrderRules(admin: SupabaseClient): Promise<OrderRuleRow[]> {
  const { data: rules } = await admin.from("product_order_rules").select("id").eq("active", true);
  if (!rules?.length) return [];
  const { data: additions } = await admin
    .from("product_order_rule_additions")
    .select("rule_id, added_product_id, qty_per_trigger_unit, sort_order")
    .in(
      "rule_id",
      rules.map((r) => r.id),
    );
  const triggerByRule = new Map<string, string>();
  const { data: ruleRows } = await admin
    .from("product_order_rules")
    .select("id, trigger_product_id")
    .eq("active", true);
  for (const r of ruleRows ?? []) {
    triggerByRule.set(String(r.id), String(r.trigger_product_id).toLowerCase());
  }
  const out: OrderRuleRow[] = [];
  for (const a of additions ?? []) {
    const trigger = triggerByRule.get(String(a.rule_id));
    if (!trigger) continue;
    out.push({
      trigger_product_id: trigger,
      added_product_id: String(a.added_product_id).toLowerCase(),
      qty_per_trigger_unit: Number(a.qty_per_trigger_unit),
      addition_sort_order: Number(a.sort_order ?? 0),
    });
  }
  return out;
}

async function loadAutoProductIds(admin: SupabaseClient): Promise<Set<string>> {
  const rules = await loadOrderRules(admin);
  return new Set(rules.map((r) => r.added_product_id));
}

async function resolveParentProductId(
  admin: SupabaseClient,
  productId: string,
): Promise<string> {
  const key = productId.trim().toLowerCase();
  const { data: variant } = await admin
    .from("product_variants")
    .select("product_id")
    .ilike("variant_id", key)
    .maybeSingle();
  if (variant?.product_id) return String(variant.product_id).toLowerCase();
  return key;
}

async function resolveLineCatalog(
  admin: SupabaseClient,
  productId: string,
  cache: Map<string, { parent_product_id: string; is_variant: boolean }>,
): Promise<{ parent_product_id: string; is_variant: boolean }> {
  const pid = productId.trim().toLowerCase();
  const cached = cache.get(pid);
  if (cached) return cached;
  const parent = await resolveParentProductId(admin, pid);
  const entry = { parent_product_id: parent, is_variant: parent !== pid };
  cache.set(pid, entry);
  return entry;
}

export async function loadPortalOrderLineRows(
  admin: SupabaseClient,
  orderId: string,
): Promise<PortalOrderLineRow[]> {
  const { data: items } = await admin
    .from("outlet_order_items")
    .select(
      "id, product_id, name, qty, uom, unit_cost, line_total, units_per_order_unit, total_units, sort_order",
    )
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (!items?.length) return [];

  const autoIds = await loadAutoProductIds(admin);
  const rules = await loadOrderRules(admin);

  const manualLines: ManualOrderLine[] = [];
  for (const row of items) {
    const pid = String(row.product_id ?? "").trim().toLowerCase();
    if (autoIds.has(pid)) continue;
    const parent = await resolveParentProductId(admin, pid);
    manualLines.push({
      product_id: pid,
      parent_product_id: parent,
      qty: Number(row.qty),
      is_auto: false,
    });
  }

  const autoQtyByProductId = computeAutoAddedQtyByProductId(manualLines, rules);

  const catalogCache = new Map<string, { parent_product_id: string; is_variant: boolean }>();
  const built = await Promise.all(
    items.map(async (row) => {
      const pid = String(row.product_id ?? "").trim().toLowerCase();
      const is_auto = autoIds.has(pid);
      const storedQty = Number(row.qty);
      const display_qty = displayQtyForOrderLine({
        product_id: pid,
        qty: storedQty,
        is_auto,
        autoQtyByProductId,
      });
      const catalog = await resolveLineCatalog(admin, pid, catalogCache);
      return {
        id: String(row.id),
        name: String(row.name),
        display_qty,
        stored_qty: storedQty,
        uom: String(row.uom),
        unit_cost: Number(row.unit_cost ?? 0),
        units_per_order_unit: Number(row.units_per_order_unit),
        total_units: Number(row.total_units),
        line_total: Number(row.line_total),
        is_auto,
        qty_adjusted: is_auto && display_qty !== storedQty,
        product_id: pid,
        parent_product_id: catalog.parent_product_id,
        is_variant: catalog.is_variant,
        sort_order: Number(row.sort_order ?? 0),
      };
    }),
  );

  return sortOrderLinesForDisplay(built, rules);
}
