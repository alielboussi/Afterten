import type { OrderQtyLine } from "./supabase";

export function orderQtyCap(line: OrderQtyLine): number | null {
  if (line.max_order_qty == null) return null;
  if (
    line.max_order_qty_days != null &&
    line.max_order_qty_days > 0 &&
    line.window_ordered_qty != null
  ) {
    return Math.max(0, line.max_order_qty - line.window_ordered_qty);
  }
  return line.max_order_qty;
}

export function isOrderWindowExhausted(line: OrderQtyLine): boolean {
  const cap = orderQtyCap(line);
  return cap != null && line.max_order_qty_days != null && cap <= 0;
}

/** e.g. "12 / 24 used (7 days)" */
export function formatOrderWindowUsage(line: OrderQtyLine): string | null {
  if (
    line.max_order_qty == null ||
    line.max_order_qty_days == null ||
    line.window_ordered_qty == null
  ) {
    return null;
  }
  const used = line.window_ordered_qty;
  const max = line.max_order_qty;
  const days = line.max_order_qty_days;
  const usedLabel = Number.isInteger(used) ? String(used) : String(used);
  const maxLabel = Number.isInteger(max) ? String(max) : String(max);
  return `${usedLabel} / ${maxLabel} in ${days} day${days === 1 ? "" : "s"}`;
}
