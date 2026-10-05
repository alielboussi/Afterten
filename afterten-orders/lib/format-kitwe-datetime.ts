const KITWE_TZ = "Africa/Lusaka";

/** Parse Supabase/Postgres timestamps as UTC when no offset is present. */
export function parseTimestamptz(iso: string): Date {
  const trimmed = iso.trim().replace(" ", "T");
  if (!trimmed) return new Date(NaN);
  const hasOffset = /[zZ]$|[+-]\d{2}(:?\d{2})?$/.test(trimmed);
  return new Date(hasOffset ? trimmed : `${trimmed}Z`);
}

export function formatKitweDatetime(iso: string): string {
  const date = parseTimestamptz(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KITWE_TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
