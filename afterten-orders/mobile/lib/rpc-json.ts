/** Normalize Supabase RPC payloads (jsonb array or table rows). */
export function parseRpcJsonRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((row): row is Record<string, unknown> => row != null && typeof row === "object");
  }
  if (typeof raw === "string") {
    try {
      return parseRpcJsonRows(JSON.parse(raw) as unknown);
    } catch {
      return [];
    }
  }
  return [];
}
