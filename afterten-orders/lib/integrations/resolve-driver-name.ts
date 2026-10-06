export function resolveDriverDisplayName(
  orderDriverName: string | null | undefined,
  catalogDriverName: string | null | undefined,
  fallback = "Driver",
): string {
  const fromOrder = String(orderDriverName ?? "").trim();
  if (fromOrder) return fromOrder;
  const fromCatalog = String(catalogDriverName ?? "").trim();
  if (fromCatalog) return fromCatalog;
  return fallback;
}
