import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderWhatsAppLine, WhatsAppProductGroup } from "@/lib/integrations/outlet-order-notify";
import {
  computeAutoAddedQtyByProductId,
  displayQtyForOrderLine,
  type ManualOrderLine,
  type OrderRuleRow,
} from "@/lib/orders/order-rule-qty";

type ItemRow = {
  product_id: string;
  name: string;
  qty: number;
  uom: string;
  sort_order: number;
};

type ResolvedRow = {
  product_id: string;
  parent_product_id: string;
  is_auto: boolean;
  kind: "product" | "variant" | "auto";
  productName: string;
  variantName: string | null;
  qty: number;
  uom: string | null;
  sort_order: number;
};

async function loadOrderRules(admin: SupabaseClient): Promise<OrderRuleRow[]> {
  const { data: rules } = await admin.from("product_order_rules").select("id").eq("active", true);
  if (!rules?.length) return [];
  const { data: ruleRows } = await admin
    .from("product_order_rules")
    .select("id, trigger_product_id")
    .eq("active", true);
  const triggerByRule = new Map<string, string>();
  for (const r of ruleRows ?? []) {
    triggerByRule.set(String(r.id), String(r.trigger_product_id).toLowerCase());
  }
  const { data: additions } = await admin
    .from("product_order_rule_additions")
    .select("rule_id, added_product_id, qty_per_trigger_unit, sort_order")
    .in(
      "rule_id",
      rules.map((r) => r.id),
    );
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

async function loadAutoAddedProductIds(admin: SupabaseClient): Promise<Set<string>> {
  const rules = await loadOrderRules(admin);
  return new Set(rules.map((r) => r.added_product_id));
}

async function resolveParentProductId(admin: SupabaseClient, productId: string): Promise<string> {
  const key = productId.trim().toLowerCase();
  const { data: variant } = await admin
    .from("product_variants")
    .select("product_id")
    .ilike("variant_id", key)
    .maybeSingle();
  if (variant?.product_id) return String(variant.product_id).toLowerCase();
  return key;
}

async function resolveRow(
  admin: SupabaseClient,
  row: ItemRow,
  isAuto: boolean,
  displayQty: number,
): Promise<ResolvedRow> {
  const pid = String(row.product_id ?? "").trim();
  const pidKey = pid.toLowerCase();
  const fallbackName = String(row.name ?? "").trim() || "Item";
  const parent = await resolveParentProductId(admin, pid);

  if (isAuto) {
    const { data: product } = await admin
      .from("products")
      .select("name, uom")
      .ilike("product_id", pidKey)
      .maybeSingle();
    if (product) {
      return {
        product_id: pidKey,
        parent_product_id: pidKey,
        is_auto: true,
        kind: "auto",
        productName: String(product.name ?? fallbackName).trim() || fallbackName,
        variantName: null,
        qty: displayQty,
        uom: String(product.uom ?? "").trim() || null,
        sort_order: row.sort_order,
      };
    }
    const { data: autoVariant } = await admin
      .from("product_variants")
      .select("name, product_id, uom")
      .ilike("variant_id", pidKey)
      .maybeSingle();
    if (autoVariant?.product_id) {
      const { data: parentProduct } = await admin
        .from("products")
        .select("name")
        .ilike("product_id", String(autoVariant.product_id).trim())
        .maybeSingle();
      return {
        product_id: pidKey,
        parent_product_id: String(autoVariant.product_id).toLowerCase(),
        is_auto: true,
        kind: "auto",
        productName: String(parentProduct?.name ?? fallbackName).trim() || fallbackName,
        variantName: String(autoVariant.name ?? "").trim() || null,
        qty: displayQty,
        uom: String(autoVariant.uom ?? "").trim() || null,
        sort_order: row.sort_order,
      };
    }
    return {
      product_id: pidKey,
      parent_product_id: parent,
      is_auto: true,
      kind: "auto",
      productName: fallbackName,
      variantName: null,
      qty: displayQty,
      uom: String(row.uom ?? "").trim() || null,
      sort_order: row.sort_order,
    };
  }

  const { data: variant } = await admin
    .from("product_variants")
    .select("name, product_id, uom")
    .ilike("variant_id", pidKey)
    .maybeSingle();

  if (variant?.product_id) {
    const { data: parentProduct } = await admin
      .from("products")
      .select("name")
      .ilike("product_id", String(variant.product_id).trim())
      .maybeSingle();
    return {
      product_id: pidKey,
      parent_product_id: String(variant.product_id).toLowerCase(),
      is_auto: false,
      kind: "variant",
      productName: String(parentProduct?.name ?? fallbackName).trim() || fallbackName,
      variantName: String(variant.name ?? "").trim() || null,
      qty: displayQty,
      uom: String(variant.uom ?? "").trim() || null,
      sort_order: row.sort_order,
    };
  }

  const { data: product } = await admin
    .from("products")
    .select("name, uom")
    .ilike("product_id", pidKey)
    .maybeSingle();

  return {
    product_id: pidKey,
    parent_product_id: parent,
    is_auto: false,
    kind: "product",
    productName: String(product?.name ?? fallbackName).trim() || fallbackName,
    variantName: null,
    qty: displayQty,
    uom: String(product?.uom ?? "").trim() || null,
    sort_order: row.sort_order,
  };
}

function toWhatsAppLine(row: ResolvedRow): OrderWhatsAppLine {
  return {
    product_id: row.product_id,
    parent_product_id: row.parent_product_id,
    kind: row.kind,
    productName: row.productName,
    variantName: row.variantName,
    qty: row.qty,
    uom: row.uom,
  };
}

/**
 * Builds WhatsApp lines: grouped like supervisor app (manual/variant, then its auto-adds), catalog UOMs.
 */
export async function loadOrderWhatsAppLines(
  admin: SupabaseClient,
  orderId: string,
): Promise<OrderWhatsAppLine[]> {
  const { data: itemRows, error } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const items = (itemRows ?? []) as ItemRow[];
  if (items.length === 0) return [];

  const autoIds = await loadAutoAddedProductIds(admin);
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

  const resolvedByProductId = new Map<string, ResolvedRow>();
  for (const row of items) {
    const pidKey = String(row.product_id ?? "").trim().toLowerCase();
    const isAuto = autoIds.has(pidKey);
    const displayQty = displayQtyForOrderLine({
      product_id: pidKey,
      qty: Number(row.qty),
      is_auto: isAuto,
      autoQtyByProductId,
    });
    const resolved = await resolveRow(admin, row, isAuto, displayQty);
    resolvedByProductId.set(pidKey, resolved);
  }

  const manualItems = items
    .filter((r) => !autoIds.has(String(r.product_id).trim().toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order);
  const assignedAuto = new Set<string>();
  const ordered: OrderWhatsAppLine[] = [];

  for (const manual of manualItems) {
    const pidKey = String(manual.product_id).trim().toLowerCase();
    const resolved = resolvedByProductId.get(pidKey);
    if (resolved) ordered.push(toWhatsAppLine(resolved));

    const parent = resolved?.parent_product_id ?? pidKey;
    const triggerKeys = new Set([pidKey, parent].filter(Boolean));
    const rulesForManual = rules
      .filter((r) => triggerKeys.has(r.trigger_product_id))
      .sort(
        (a, b) =>
          a.addition_sort_order - b.addition_sort_order ||
          a.added_product_id.localeCompare(b.added_product_id),
      );

    for (const rule of rulesForManual) {
      const autoKey = rule.added_product_id;
      if (assignedAuto.has(autoKey)) continue;
      const autoResolved = resolvedByProductId.get(autoKey);
      if (!autoResolved) continue;
      assignedAuto.add(autoKey);
      ordered.push(toWhatsAppLine(autoResolved));
    }
  }

  const autoItems = items.filter((r) => autoIds.has(String(r.product_id).trim().toLowerCase()));
  for (const auto of autoItems.sort((a, b) => a.sort_order - b.sort_order)) {
    const autoKey = String(auto.product_id).trim().toLowerCase();
    if (assignedAuto.has(autoKey)) continue;
    const autoResolved = resolvedByProductId.get(autoKey);
    if (autoResolved) ordered.push(toWhatsAppLine(autoResolved));
  }

  return ordered;
}

export type AggregatedPickGroup = WhatsAppProductGroup & {
  sortIndex: number;
};

async function catalogProductName(admin: SupabaseClient, productId: string): Promise<string> {
  const key = productId.trim().toLowerCase();
  const { data } = await admin
    .from("products")
    .select("name")
    .ilike("product_id", key)
    .maybeSingle();
  return String(data?.name ?? "").trim() || productId;
}

async function headerForParentId(
  admin: SupabaseClient,
  parentId: string,
  headerNameCache: Map<string, string>,
): Promise<string> {
  const key = parentId.trim().toLowerCase();
  const cached = headerNameCache.get(key);
  if (cached) return cached;
  const name = await catalogProductName(admin, key);
  headerNameCache.set(key, name);
  return name;
}

function sortLinesWithinGroup(group: AggregatedPickGroup): void {
  const kindRank: Record<OrderWhatsAppLine["kind"], number> = {
    product: 0,
    variant: 1,
    auto: 2,
  };
  group.lines.sort((a, b) => {
    const byKind = kindRank[a.kind] - kindRank[b.kind];
    if (byKind !== 0) return byKind;
    const nameA =
      a.kind === "variant" || a.kind === "auto"
        ? (a.variantName ?? a.productName)
        : a.productName;
    const nameB =
      b.kind === "variant" || b.kind === "auto"
        ? (b.variantName ?? b.productName)
        : b.productName;
    return nameA.localeCompare(nameB, "en", { sensitivity: "base" });
  });
}

async function assignLineToPickGroup(
  admin: SupabaseClient,
  ctx: {
    triggerByAdded: Map<string, string>;
    headerNameCache: Map<string, string>;
    groups: Map<string, AggregatedPickGroup>;
  },
  line: OrderWhatsAppLine,
  sortIndex: number,
): Promise<void> {
  const { triggerByAdded, headerNameCache, groups } = ctx;

  if (line.kind === "auto") {
    const trigger = triggerByAdded.get(line.product_id);
    if (!trigger) {
      const groupKey = line.product_id;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          headerName: line.productName,
          lines: [],
          sortIndex,
        };
        groups.set(groupKey, group);
      } else {
        group.sortIndex = Math.min(group.sortIndex, sortIndex);
      }
      group.lines.push(line);
      return;
    }
    const parentId = await resolveParentProductId(admin, trigger);
    const headerName = await headerForParentId(admin, parentId, headerNameCache);
    let group = groups.get(parentId);
    if (!group) {
      group = { headerName, lines: [], sortIndex };
      groups.set(parentId, group);
    } else {
      group.sortIndex = Math.min(group.sortIndex, sortIndex);
    }
    group.lines.push(line);
    return;
  }

  if (line.kind === "variant") {
    const groupKey = line.parent_product_id.trim().toLowerCase();
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        headerName: line.productName,
        lines: [],
        sortIndex,
      };
      groups.set(groupKey, group);
    } else {
      group.sortIndex = Math.min(group.sortIndex, sortIndex);
    }
    group.lines.push(line);
    return;
  }

  const groupKey = line.product_id.trim().toLowerCase();
  let group = groups.get(groupKey);
  if (!group) {
    group = {
      headerName: line.productName,
      lines: [],
      sortIndex,
    };
    groups.set(groupKey, group);
  } else {
    group.sortIndex = Math.min(group.sortIndex, sortIndex);
  }
  group.lines.push(line);
}

async function buildPickDisplayGroupsFromLines(
  admin: SupabaseClient,
  entries: { line: OrderWhatsAppLine; sortIndex: number }[],
): Promise<AggregatedPickGroup[]> {
  const rules = await loadOrderRules(admin);
  const triggerByAdded = new Map<string, string>();
  for (const r of rules) {
    triggerByAdded.set(r.added_product_id, r.trigger_product_id);
  }

  const groups = new Map<string, AggregatedPickGroup>();
  const headerNameCache = new Map<string, string>();
  const ctx = { triggerByAdded, headerNameCache, groups };

  for (const { line, sortIndex } of entries) {
    await assignLineToPickGroup(admin, ctx, line, sortIndex);
  }

  for (const group of groups.values()) {
    sortLinesWithinGroup(group);
  }

  return [...groups.values()].sort((a, b) => a.sortIndex - b.sortIndex);
}

/** Group lines under parent catalog product (variants + rule autos share one header). */
export async function buildOrderDisplayGroups(
  admin: SupabaseClient,
  lines: OrderWhatsAppLine[],
): Promise<WhatsAppProductGroup[]> {
  const entries = lines.map((line, sortIndex) => ({ line, sortIndex }));
  const groups = await buildPickDisplayGroupsFromLines(admin, entries);
  return groups.map(({ headerName, lines: groupLines }) => ({
    headerName,
    lines: groupLines,
  }));
}

/** Merge totals grouped by parent catalog product (variants + rule autos under one header). */
export async function buildAggregatedPickDisplayGroups(
  admin: SupabaseClient,
  totals: Map<string, OrderWhatsAppLine>,
  orderedKeys: string[],
): Promise<AggregatedPickGroup[]> {
  const keyIndex = new Map(orderedKeys.map((k, i) => [k, i] as const));
  const entries: { line: OrderWhatsAppLine; sortIndex: number }[] = [];
  for (const lineKey of orderedKeys) {
    const line = totals.get(lineKey);
    if (!line) continue;
    entries.push({ line, sortIndex: keyIndex.get(lineKey) ?? 9999 });
  }
  return buildPickDisplayGroupsFromLines(admin, entries);
}
