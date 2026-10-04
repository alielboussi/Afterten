import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutletProduct } from "./supabase";
import { applyParentCatalogToVariant } from "./catalog-lines";
import { formatOrderUnitBreakdown } from "./order-units";

export type CartItemPayload = { product_id: string; qty: number };

export type CatalogProductBrief = {
  product_id: string;
  name: string;
  uom: string;
  unit_cost: number;
  units_per_order_unit: number;
  units_per_order_uom: string;
};

export type OrderRuleAddition = {
  trigger_product_id: string;
  added_product_id: string;
  qty_per_trigger_unit: number;
};

export type SummaryDisplayRow = {
  rowKey: string;
  kind: "main" | "parent" | "variant" | "auto";
  name: string;
  qty: number | null;
  uom: string;
  amount: number | null;
  unitsDetail: string | null;
};

export type SummaryGroup = {
  groupKey: string;
  rows: SummaryDisplayRow[];
};

export type OrderSummaryPreview = {
  orderNumber: string;
  groups: SummaryGroup[];
};

export function buildCartItemPayload(
  products: OutletProduct[],
  cartQty: Record<string, number>,
): CartItemPayload[] {
  const items: CartItemPayload[] = [];
  for (const product of products) {
    if (product.has_variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        const qty = cartQty[variant.variant_id] ?? 0;
        if (qty > 0) items.push({ product_id: variant.variant_id, qty });
      }
    } else {
      const qty = cartQty[product.product_id] ?? 0;
      if (qty > 0) items.push({ product_id: product.product_id, qty });
    }
  }
  return items;
}

export async function fetchOrderSummaryPreview(
  supabase: SupabaseClient,
  products: OutletProduct[],
  cartQty: Record<string, number>,
): Promise<{ preview: OrderSummaryPreview | null; error: string | null }> {
  const items = buildCartItemPayload(products, cartQty);
  if (items.length === 0) {
    return { preview: null, error: "Add at least one product." };
  }

  const [orderRes, rulesRes] = await Promise.all([
    supabase.rpc("preview_outlet_order_number"),
    supabase.rpc("list_outlet_order_rules"),
  ]);

  if (orderRes.error) return { preview: null, error: orderRes.error.message };
  if (rulesRes.error) return { preview: null, error: rulesRes.error.message };

  const rules = parseRules(rulesRes.data);
  const addedIds = [...new Set(rules.map((r) => r.added_product_id))];
  let catalogById = new Map<string, CatalogProductBrief>();

  if (addedIds.length > 0) {
    const { data: catalogRaw, error: catalogErr } = await supabase.rpc("resolve_catalog_products", {
      p_product_ids: addedIds,
    });
    if (catalogErr) return { preview: null, error: catalogErr.message };
    catalogById = mapCatalogBriefs(catalogRaw);
  }

  const groups = buildSummaryGroups(products, cartQty, rules, catalogById);
  const orderNumber =
    typeof orderRes.data === "string" && orderRes.data.trim()
      ? orderRes.data.trim()
      : "—";

  return {
    preview: { orderNumber, groups },
    error: null,
  };
}

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
      unit_cost: Number(r.unit_cost ?? 0),
      units_per_order_unit: Number(r.units_per_order_unit ?? 1),
      units_per_order_uom: String(r.units_per_order_uom ?? "pcs").trim() || "pcs",
    });
  }
  return map;
}

function buildSummaryGroups(
  products: OutletProduct[],
  cartQty: Record<string, number>,
  rules: OrderRuleAddition[],
  catalogById: Map<string, CatalogProductBrief>,
): SummaryGroup[] {
  const groups: SummaryGroup[] = [];

  for (const product of products) {
    if (product.has_variants && product.variants.length > 0) {
      const variantLines = product.variants
        .map((variant) => applyParentCatalogToVariant(variant, product))
        .filter((line) => (cartQty[line.variant_id] ?? 0) > 0);

      if (variantLines.length === 0) continue;

      groups.push(
        buildVariantParentGroup(product, variantLines, cartQty, rules, catalogById),
      );
    } else {
      const qty = cartQty[product.product_id] ?? 0;
      if (qty <= 0) continue;
      groups.push(
        buildGroupForMainLine({
          groupKey: product.product_id,
          lineId: product.product_id,
          parentProductId: product.product_id,
          name: product.name,
          qty,
          uom: product.uom,
          unitCost: product.unit_cost,
          unitsPerOrderUnit: product.units_per_order_unit,
          unitsPerOrderUom: product.units_per_order_uom,
          rules,
          catalogById,
        }),
      );
    }
  }

  return groups.sort((a, b) => groupSortName(a).localeCompare(groupSortName(b)));
}

function groupSortName(group: SummaryGroup): string {
  const head = group.rows.find((r) => r.kind === "main" || r.kind === "parent");
  return head?.name ?? "";
}

function buildVariantParentGroup(
  product: OutletProduct,
  variantLines: ReturnType<typeof applyParentCatalogToVariant>[],
  cartQty: Record<string, number>,
  rules: OrderRuleAddition[],
  catalogById: Map<string, CatalogProductBrief>,
): SummaryGroup {
  const rows: SummaryDisplayRow[] = [
    {
      rowKey: `${product.product_id}-parent`,
      kind: "parent",
      name: product.name,
      qty: null,
      uom: "",
      amount: null,
      unitsDetail: null,
    },
  ];

  for (const line of variantLines) {
    const qty = cartQty[line.variant_id] ?? 0;
    const unitsPerOrderUnit = line.units_per_order_unit > 0 ? line.units_per_order_unit : 1;
    const unitsPerOrderUom = line.units_per_order_uom.trim() || "pcs";
    const breakdown = formatOrderUnitBreakdown(qty, line.uom, unitsPerOrderUnit, unitsPerOrderUom);
    const packDetail =
      unitsPerOrderUnit > 1
        ? `${formatQty(unitsPerOrderUnit)} ${unitsPerOrderUom} per ${line.uom}`
        : null;
    const unitsDetail = shouldHideDrinkUnitsDetail(line.uom, unitsPerOrderUom)
      ? null
      : breakdown ?? packDetail;

    rows.push({
      rowKey: `${line.variant_id}-variant`,
      kind: "variant",
      name: line.name,
      qty,
      uom: line.uom,
      amount: roundMoney(line.unit_cost * qty),
      unitsDetail,
    });

    appendAutoRows(rows, {
      rowKeyPrefix: line.variant_id,
      triggerLineId: line.variant_id,
      parentProductId: product.product_id,
      triggerQty: qty,
      rules,
      catalogById,
    });
  }

  return { groupKey: product.product_id, rows };
}

function buildGroupForMainLine(input: {
  groupKey: string;
  lineId: string;
  parentProductId: string;
  name: string;
  qty: number;
  uom: string;
  unitCost: number;
  unitsPerOrderUnit: number;
  unitsPerOrderUom: string;
  rules: OrderRuleAddition[];
  catalogById: Map<string, CatalogProductBrief>;
}): SummaryGroup {
  const unitsPerOrderUnit =
    input.unitsPerOrderUnit > 0 ? input.unitsPerOrderUnit : 1;
  const unitsPerOrderUom = input.unitsPerOrderUom.trim() || "pcs";
  const breakdown = formatOrderUnitBreakdown(
    input.qty,
    input.uom,
    unitsPerOrderUnit,
    unitsPerOrderUom,
  );
  const packDetail =
    unitsPerOrderUnit > 1
      ? `${formatQty(unitsPerOrderUnit)} ${unitsPerOrderUom} per ${input.uom}`
      : null;
  const unitsDetail = shouldHideDrinkUnitsDetail(input.uom, unitsPerOrderUom)
    ? null
    : breakdown ?? packDetail;

  const rows: SummaryDisplayRow[] = [
    {
      rowKey: `${input.groupKey}-main`,
      kind: "main",
      name: input.name,
      qty: input.qty,
      uom: input.uom,
      amount: roundMoney(input.unitCost * input.qty),
      unitsDetail,
    },
  ];

  appendAutoRows(rows, {
    rowKeyPrefix: input.groupKey,
    triggerLineId: input.lineId,
    parentProductId: input.parentProductId,
    triggerQty: input.qty,
    rules: input.rules,
    catalogById: input.catalogById,
  });

  return { groupKey: input.groupKey, rows };
}

function appendAutoRows(
  rows: SummaryDisplayRow[],
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
    [input.triggerLineId, input.parentProductId].map((k) => k.toLowerCase()),
  );
  const matchingRules = input.rules.filter((r) => triggerKeys.has(r.trigger_product_id));

  for (const rule of matchingRules) {
    const added = input.catalogById.get(rule.added_product_id);
    if (!added) continue;

    const perTrigger = rule.qty_per_trigger_unit > 0 ? rule.qty_per_trigger_unit : 0;
    const autoQty = input.triggerQty * perTrigger;
    if (autoQty <= 0) continue;

    const addedUom = added.uom.trim() || "pc";
    const unitsPer = added.units_per_order_unit > 0 ? added.units_per_order_unit : 1;
    const pieceUom = added.units_per_order_uom.trim() || "pcs";

    const breakdown = formatOrderUnitBreakdown(autoQty, addedUom, unitsPer, pieceUom);
    const unitsDetail =
      breakdown && !shouldHideDrinkUnitsDetail(addedUom, pieceUom) ? breakdown : null;

    rows.push({
      rowKey: `${input.rowKeyPrefix}-auto-${added.product_id}-${rule.added_product_id}`,
      kind: "auto",
      name: added.name,
      qty: autoQty,
      uom: addedUom,
      amount: null,
      unitsDetail,
    });
  }
}

export function shouldHideDrinkUnitsDetail(orderUom: string, unitsPerOrderUom: string): boolean {
  const piece = unitsPerOrderUom.toLowerCase();
  const order = orderUom.toLowerCase();
  if (piece.includes("bottle")) return true;
  if (order.includes("case") && piece.includes("bottle")) return true;
  return false;
}

export function summaryGrandTotal(groups: SummaryGroup[]): number {
  let sum = 0;
  for (const group of groups) {
    for (const row of group.rows) {
      if ((row.kind === "main" || row.kind === "variant") && row.amount != null) {
        sum += row.amount;
      }
    }
  }
  return roundMoney(sum);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export function cartHasItems(cartQty: Record<string, number>): boolean {
  return Object.values(cartQty).some((q) => q > 0);
}

const KITWE_TZ = "Africa/Lusaka";

export function formatKitweDateTime(now = new Date()): { dateLabel: string; timeLabel: string } {
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: KITWE_TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);

  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: KITWE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return { dateLabel, timeLabel };
}
