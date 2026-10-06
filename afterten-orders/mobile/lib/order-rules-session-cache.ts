import type { SupabaseClient } from "@supabase/supabase-js";

type CachedRules = {
  rules: {
    trigger_product_id: string;
    added_product_id: string;
    qty_per_trigger_unit: number;
  }[];
  fetchedAt: number;
};

let cache: CachedRules | null = null;
const TTL_MS = 30 * 60 * 1000;

function parseRules(raw: unknown): CachedRules["rules"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => row as Record<string, unknown>)
    .map((row) => ({
      trigger_product_id: String(row.trigger_product_id ?? "").toLowerCase(),
      added_product_id: String(row.added_product_id ?? "").toLowerCase(),
      qty_per_trigger_unit: Number(row.qty_per_trigger_unit ?? 0),
    }))
    .filter((r) => r.trigger_product_id && r.added_product_id);
}

export async function getCachedOutletOrderRules(
  supabase: SupabaseClient,
): Promise<CachedRules["rules"]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.rules;
  }
  const { data, error } = await supabase.rpc("list_outlet_order_rules");
  if (error) return cache?.rules ?? [];
  const rules = parseRules(data);
  cache = { rules, fetchedAt: now };
  return rules;
}

export function clearOrderRulesCache(): void {
  cache = null;
}
