/** 8-4-4-4-12 hex (inventory API ids; not strict RFC 4122 variant/version). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeProductUuid(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
}

export function isValidProductUuid(raw: string): boolean {
  return normalizeProductUuid(raw) !== null;
}
