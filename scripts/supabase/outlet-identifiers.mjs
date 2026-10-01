export function aliasPrefix4(alias) {
  return alias.trim().slice(0, 4);
}

export function outletIdFromAlias(alias, taken = new Set()) {
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

export function emailFromOutletId(outletId) {
  return `${outletId.toLowerCase()}@ordersapp.com`;
}

export function buildOutletRows(outletNames) {
  const taken = new Set();
  return outletNames.map((outletName) => {
    const alias = outletName;
    const outletId = outletIdFromAlias(alias, taken);
    taken.add(outletId);
    const email = emailFromOutletId(outletId);
    return { outletName, alias, outletId, email };
  });
}
