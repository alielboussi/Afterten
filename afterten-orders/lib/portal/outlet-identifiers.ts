/**
 * Outlet ID / email rules — safe to import from Client Components (no server-only).
 */

/** First four characters of the display alias (outlet name). */
export function aliasPrefix4(alias: string): string {
  return alias.trim().slice(0, 4);
}

/**
 * Outlet primary key: first 4 characters of alias (uppercase, spaces removed from the prefix).
 * Resolves rare collisions (e.g. Oxford 1 / Oxford 2) within 4 characters.
 */
export function outletIdFromAlias(alias: string, taken: ReadonlySet<string> = new Set()): string {
  const trimmed = alias.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  let id = compact.slice(0, 4).toUpperCase();
  if (id.length < 4) id = id.padEnd(4, "X");
  if (!taken.has(id)) return id;

  const digit = compact.match(/\d/)?.[0];
  if (digit) {
    const letters = compact.replace(/\d/g, "").slice(0, 3).toUpperCase();
    const withDigit = `${letters}${digit}`.slice(0, 4);
    if (withDigit.length === 4 && !taken.has(withDigit)) return withDigit;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 4)
      .toUpperCase();
    if (initials.length === 4 && !taken.has(initials)) return initials;
  }

  for (let n = 2; n < 10; n += 1) {
    const candidate = `${id.slice(0, 3)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  return id;
}

/** Login email: first 4 characters of alias (lowercase) @ ordersapp.com, aligned with outlet id disambiguation. */
export function emailFromOutletId(outletId: string): string {
  return `${outletId.toLowerCase()}@ordersapp.com`;
}

export function deriveOutletCredentials(alias: string, takenIds: ReadonlySet<string> = new Set()) {
  const outletId = outletIdFromAlias(alias, takenIds);
  const email = emailFromOutletId(outletId);
  return { outletId, email, aliasPrefix: aliasPrefix4(alias) };
}
