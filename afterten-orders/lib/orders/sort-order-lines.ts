import type { OrderRuleRow } from "@/lib/orders/order-rule-qty";

export type SortableOrderLine = {
  product_id: string;
  parent_product_id: string;
  is_variant: boolean;
  is_auto: boolean;
  sort_order: number;
};

/** Main product first, then its variants, then rule auto-additions under that trigger. */
export function sortOrderLinesForDisplay<T extends SortableOrderLine>(
  lines: T[],
  rules: OrderRuleRow[],
): T[] {
  const autoTrigger = new Map<string, string>();
  for (const r of rules) {
    autoTrigger.set(r.added_product_id.toLowerCase(), r.trigger_product_id.toLowerCase());
  }

  const groupByRoot = new Map<string, number>();
  let nextGroup = 0;

  const manualSorted = lines
    .filter((l) => !l.is_auto)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const line of manualSorted) {
    const root = line.is_variant ? line.parent_product_id : line.product_id;
    if (!groupByRoot.has(root)) {
      groupByRoot.set(root, nextGroup++);
    }
  }

  function rootForLine(line: SortableOrderLine): string {
    if (line.is_auto) {
      const trigger = autoTrigger.get(line.product_id.toLowerCase());
      if (trigger && groupByRoot.has(trigger)) return trigger;
      return line.product_id;
    }
    return line.is_variant ? line.parent_product_id : line.product_id;
  }

  function groupIndex(line: SortableOrderLine): number {
    const root = rootForLine(line);
    const g = groupByRoot.get(root);
    if (g != null) return g;
    return 10_000 + line.sort_order;
  }

  /** 0 = primary manual line, 1 = variant, 2 = auto-added */
  function subIndex(line: SortableOrderLine): number {
    if (line.is_auto) return 2;
    if (line.is_variant) return 1;
    return 0;
  }

  return lines.slice().sort((a, b) => {
    const g = groupIndex(a) - groupIndex(b);
    if (g !== 0) return g;
    const s = subIndex(a) - subIndex(b);
    if (s !== 0) return s;
    return a.sort_order - b.sort_order;
  });
}
