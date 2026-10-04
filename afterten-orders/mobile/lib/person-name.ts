/** Title-case each word for person names (e.g. "john doe" → "John Doe"). */
export function formatPersonName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * While typing, keep a trailing space so users can enter a surname after the first name.
 * Full normalization runs on blur / submit via {@link formatPersonName}.
 */
export function formatPersonNameInput(raw: string): string {
  const trailingSpace = raw.endsWith(" ") ? " " : "";
  const withoutTrailing = raw.replace(/\s+$/, "");
  if (!withoutTrailing) return trailingSpace ? " " : "";

  const collapsed = withoutTrailing.replace(/\s+/g, " ");
  const parts = collapsed.split(" ");
  const formatted = parts
    .map((word) => {
      if (!word) return "";
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");

  return formatted + trailingSpace;
}

export function isValidPersonName(name: string): boolean {
  return formatPersonName(name).length >= 2;
}
