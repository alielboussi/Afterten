import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupervisorPreviewLine } from "./supervisor-order-detail";

export type OrderRuleAddition = {
  trigger_product_id: string;
  added_product_id: string;
  qty_per_trigger_unit: number;
};

export type CatalogProductBrief = {
  product_id: string;
  name: string;
  uom: string;
};

export type SupervisorDisplayRow = {
  rowKey: string;
  kind: "main" | "auto";
  product_id: string;
  name: string;
  qty: number;
  uom: string;
  line_total: number;
};

export type SupervisorDisplayGroup = {
  groupKey: string;
  rows: SupervisorDisplayRow[];
};

export type OrderRulesContext = {
  rules: OrderRuleAddition[];
  catalogById: Map<string, CatalogProductBrief>;
};

function parseRules(raw: unknown): OrderRuleAddition[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => row as Record<string, unknown>)
    .map((row) => ({
      trigger_product_id: String(row.trigger_product_id ?? "").toLowerCase(),
      added_product_id: String(row.added_product_id ?? "").toLowerCase(),
      qty_per_trigger_unit: Number(row.qty_per_trigger_unit ?? 0),
    }))
    .filter((r) => r.trigger_product_id && r.added_product_id);
}

function mapCatalogBriefs(raw: unknown): Map<string, CatalogProductBrief> {
  const map = new Map<string, CatalogProductBrief>();
  if (!Array.isArray(raw)) return map;
  for (const row of raw) {
    const r = row as Record<string, unknown>;
    const id = String(r.product_id ?? "").toLowerCase();
    if (!id) continue;
    map.set(id, {
      product_id: id,
      name: String(r.name ?? ""),
      uom: String(r.uom ?? ""),
    });
  }
  return map;
}

export async function fetchOrderRulesContext(
  supabase: SupabaseClient,
): Promise<OrderRulesContext> {
  const { data: rulesRaw, error: rulesErr } = await supabase.rpc("list_outlet_order_rules");
  if (rulesErr) {
    return { rules: [], catalogById: new Map() };
  }
  const rules = parseRules(rulesRaw);
  const addedIds = [...new Set(rules.map((r) => r.added_product_id))];
  if (addedIds.length === 0) {
    return { rules, catalogById: new Map() };
  }
  const { data: catalogRaw, error: catalogErr } = await supabase.rpc("resolve_catalog_products", {
    p_product_ids: addedIds,
  });
  if (catalogErr) {
    return { rules, catalogById: new Map() };
  }
  return { rules, catalogById: mapCatalogBriefs(catalogRaw) };
}

function appendAutoRows(
  rows: SupervisorDisplayRow[],
  input: {
    rowKeyPrefix: string;
    triggerLineId: string;
    parentProductId: string;
    triggerQty: number;
    rules: OrderRuleAddition[];
    catalogById: Map<string, CatalogProductBrief>;
  },
): void {
  const triggerKeys = new Set(
    [input.triggerLineId, input.parentProductId].map((k) => k.toLowerCase()).filter(Boolean),
  );
  const matchingRules = input.rules.filter((r) => triggerKeys.has(r.trigger_product_id));

  for (const rule of matchingRules) {
    const added = input.catalogById.get(rule.added_product_id);
    if (!added) continue;

    const perTrigger = rule.qty_per_trigger_unit > 0 ? rule.qty_per_trigger_unit : 0;
    const autoQty = input.triggerQty * perTrigger;
    if (autoQty <= 0) continue;

    rows.push({
      rowKey: `${input.rowKeyPrefix}-auto-${added.product_id}`,
      kind: "auto",
      product_id: added.product_id,
      name: added.name,
      qty: autoQty,
      uom: added.uom.trim() || "pc",
      line_total: 0,
    });
  }
}

export function buildSupervisorPreviewGroups(
  previewLines: SupervisorPreviewLine[],
  rules: OrderRuleAddition[],
  catalogById: Map<string, CatalogProductBrief>,
): SupervisorDisplayGroup[] {
  const manualLines = previewLines.filter((l) => !l.is_auto);
  const groups: SupervisorDisplayGroup[] = [];

  for (const line of manualLines) {
    const productId = line.product_id.toLowerCase();
    const parentId = (line.parent_product_id || line.product_id).toLowerCase();
    const rows: SupervisorDisplayRow[] = [
      {
        rowKey: `${productId}-main`,
        kind: "main",
        product_id: productId,
        name: line.name,
        qty: line.qty,
        uom: line.uom,
        line_total: line.line_total,
      },
    ];

    appendAutoRows(rows, {
      rowKeyPrefix: productId,
      triggerLineId: productId,
      parentProductId: parentId,
      triggerQty: line.qty,
      rules,
      catalogById,
    });

    groups.push({ groupKey: productId, rows });
  }

  return groups;
}
