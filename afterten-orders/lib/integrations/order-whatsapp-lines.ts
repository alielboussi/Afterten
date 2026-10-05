import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderWhatsAppLine } from "@/lib/integrations/outlet-order-notify";
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
    .select("rule_id, added_product_id, qty_per_trigger_unit")
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

  const manualItems = items.filter((r) => !autoIds.has(String(r.product_id).trim().toLowerCase()));
  const autoItems = items.filter((r) => autoIds.has(String(r.product_id).trim().toLowerCase()));
  const assignedAuto = new Set<string>();
  const ordered: OrderWhatsAppLine[] = [];

  for (const manual of manualItems) {
    const pidKey = String(manual.product_id).trim().toLowerCase();
    const resolved = resolvedByProductId.get(pidKey);
    if (resolved) ordered.push(toWhatsAppLine(resolved));

    const parent = resolved?.parent_product_id ?? pidKey;
    const triggerKeys = new Set([pidKey, parent].filter(Boolean));
    const addedProductIds = new Set(
      rules.filter((r) => triggerKeys.has(r.trigger_product_id)).map((r) => r.added_product_id),
    );

    for (const auto of [...autoItems].sort((a, b) => a.sort_order - b.sort_order)) {
      const autoKey = String(auto.product_id).trim().toLowerCase();
      if (assignedAuto.has(autoKey)) continue;
      if (!addedProductIds.has(autoKey)) continue;
      assignedAuto.add(autoKey);
      const autoResolved = resolvedByProductId.get(autoKey);
      if (autoResolved) ordered.push(toWhatsAppLine(autoResolved));
    }
  }

  for (const auto of autoItems) {
    const autoKey = String(auto.product_id).trim().toLowerCase();
    if (assignedAuto.has(autoKey)) continue;
    const autoResolved = resolvedByProductId.get(autoKey);
    if (autoResolved) ordered.push(toWhatsAppLine(autoResolved));
  }

  return ordered;
}
