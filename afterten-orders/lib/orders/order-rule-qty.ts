import "server-only";

export type OrderRuleRow = {
  trigger_product_id: string;
  added_product_id: string;
  qty_per_trigger_unit: number;
};

export type ManualOrderLine = {
  product_id: string;
  parent_product_id: string;
  qty: number;
  is_auto: boolean;
};

/** Same trigger keys as outlet/supervisor mobile apps (manual lines only). */
export function computeAutoAddedQtyByProductId(
  manualLines: ManualOrderLine[],
  rules: OrderRuleRow[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const manual of manualLines) {
    if (manual.qty <= 0) continue;
    const triggerKeys = new Set(
      [manual.product_id, manual.parent_product_id]
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    );

    for (const rule of rules) {
      if (!triggerKeys.has(rule.trigger_product_id)) continue;
      const added = rule.added_product_id.trim().toLowerCase();
      if (!added) continue;
      const per = rule.qty_per_trigger_unit > 0 ? rule.qty_per_trigger_unit : 0;
      const addQty = manual.qty * per;
      if (addQty <= 0) continue;
      totals.set(added, (totals.get(added) ?? 0) + addQty);
    }
  }

  return totals;
}

export function displayQtyForOrderLine(input: {
  product_id: string;
  qty: number;
  is_auto: boolean;
  autoQtyByProductId: Map<string, number>;
}): number {
  if (!input.is_auto) return input.qty;
  const key = input.product_id.trim().toLowerCase();
  const expected = input.autoQtyByProductId.get(key);
  if (expected != null && expected > 0) return expected;
  return input.qty;
}
