import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type OrderLogicAddition = {
  id: string;
  addedProductId: string;
  addedProductName: string;
  qtyPerTriggerUnit: number;
  sortOrder: number;
};

export type OrderLogicRuleRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  triggerProductId: string;
  triggerProductName: string;
  additions: OrderLogicAddition[];
};

async function fetchOrderLogicRules(): Promise<OrderLogicRuleRow[]> {
  const admin = createAdminClient();
  const { data: rules, error } = await admin
    .from("product_order_rules")
    .select("id, name, description, active, sort_order, trigger_product_id")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);

  const productNames = new Map<string, string>();
  const { data: products } = await admin.from("products").select("product_id, name");
  for (const p of products ?? []) {
    productNames.set(p.product_id as string, p.name as string);
  }

  const rows: OrderLogicRuleRow[] = [];
  for (const r of rules ?? []) {
    const { data: adds, error: addErr } = await admin
      .from("product_order_rule_additions")
      .select("id, added_product_id, qty_per_trigger_unit, sort_order")
      .eq("rule_id", r.id as string)
      .order("sort_order");
    if (addErr) throw new Error(addErr.message);

    rows.push({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      active: r.active as boolean,
      sortOrder: r.sort_order as number,
      triggerProductId: r.trigger_product_id as string,
      triggerProductName: productNames.get(r.trigger_product_id as string) ?? (r.trigger_product_id as string),
      additions: (adds ?? []).map((a) => ({
        id: a.id as string,
        addedProductId: a.added_product_id as string,
        addedProductName: productNames.get(a.added_product_id as string) ?? (a.added_product_id as string),
        qtyPerTriggerUnit: Number(a.qty_per_trigger_unit),
        sortOrder: a.sort_order as number,
      })),
    });
  }
  return rows;
}

export function getCachedOrderLogicRules() {
  return unstable_cache(fetchOrderLogicRules, ["order-logic-rules-v1"], {
    revalidate: 30,
    tags: ["order-logic-rules"],
  })();
}

export function getCachedOrderLogicRule(id: string) {
  return unstable_cache(
    async () => {
      const all = await fetchOrderLogicRules();
      return all.find((r) => r.id === id) ?? null;
    },
    ["order-logic-rule", id],
    { revalidate: 30, tags: ["order-logic-rules", `order-logic-rule-${id}`] },
  )();
}

export const ORDER_LOGIC_RULES_TAG = "order-logic-rules";
