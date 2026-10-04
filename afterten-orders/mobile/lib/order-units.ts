export function totalOrderUnits(qty: number, unitsPerOrderUnit: number): number {
  const per = unitsPerOrderUnit > 0 ? unitsPerOrderUnit : 1;
  return qty * per;
}

function normalizePieceUom(unitsPerOrderUom: string): string {
  const t = unitsPerOrderUom.trim();
  return t || "pcs";
}

/** Static hint on catalog cards, e.g. "1 Tray = 25 pcs" when multiplier > 1 */
export function formatPerOrderUnitHint(
  unitsPerOrderUnit: number,
  orderUom: string,
  unitsPerOrderUom: string,
): string | null {
  const per = unitsPerOrderUnit > 0 ? unitsPerOrderUnit : 1;
  if (per <= 1) return null;
  const pieceUom = normalizePieceUom(unitsPerOrderUom);
  const perLabel = Number.isInteger(per) ? String(per) : String(per);
  return `1 ${orderUom} = ${perLabel} ${pieceUom}`;
}

/** e.g. "3 Trays = 75 pcs" when multiplier > 1 */
export function formatOrderUnitBreakdown(
  qty: number,
  orderUom: string,
  unitsPerOrderUnit: number,
  unitsPerOrderUom: string,
): string | null {
  if (qty <= 0) return null;
  const per = unitsPerOrderUnit > 0 ? unitsPerOrderUnit : 1;
  if (per <= 1) return null;
  const total = totalOrderUnits(qty, per);
  const pieceUom = normalizePieceUom(unitsPerOrderUom);
  const qtyLabel = Number.isInteger(qty) ? String(qty) : String(qty);
  const totalLabel = Number.isInteger(total) ? String(total) : String(total);
  return `${qtyLabel} ${orderUom} = ${totalLabel} ${pieceUom}`;
}

export function formatQtyNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
