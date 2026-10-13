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

export function totalReturnUnits(qty: number, returnUnitsPerOrder: number): number {
  const per = returnUnitsPerOrder > 0 ? returnUnitsPerOrder : 1;
  return qty * per;
}

/** e.g. "3 Trays = 75 Bread" (return qty × return units per order) */
export function formatReturnUnitBreakdown(
  qty: number,
  lineUom: string,
  returnUnitsPerOrder: number,
  returnUnitsPerOrderUom: string,
): string | null {
  if (qty <= 0) return null;
  const per = returnUnitsPerOrder > 0 ? returnUnitsPerOrder : 1;
  const returnUom = returnUnitsPerOrderUom.trim() || "pcs";
  const orderUom = lineUom.trim() || "unit";
  const total = totalReturnUnits(qty, per);
  const qtyLabel = formatQtyNumber(qty);
  const totalLabel = formatQtyNumber(total);
  if (per <= 1 && orderUom.toLowerCase() === returnUom.toLowerCase()) {
    return `${totalLabel} ${returnUom}`;
  }
  return `${qtyLabel} ${orderUom} = ${totalLabel} ${returnUom}`;
}

export function formatReturnPerOrderUnitHint(
  returnUnitsPerOrder: number,
  lineUom: string,
  returnUnitsPerOrderUom: string,
): string | null {
  const per = returnUnitsPerOrder > 0 ? returnUnitsPerOrder : 1;
  if (per <= 1) return null;
  const returnUom = returnUnitsPerOrderUom.trim() || "pcs";
  const orderUom = lineUom.trim() || "unit";
  const perLabel = formatQtyNumber(per);
  return `1 ${orderUom} = ${perLabel} ${returnUom}`;
}
