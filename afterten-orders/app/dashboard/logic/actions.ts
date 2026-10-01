"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { normalizeProductUuid } from "@/lib/portal/product-id";
import { ORDER_LOGIC_RULES_TAG } from "@/lib/portal/order-logic-cache";
import { PRODUCTS_LIST_TAG } from "@/lib/portal/products-cache";

export type LogicAdditionInput = {
  addedProductId: string;
  qtyPerTriggerUnit: number;
};

export type OrderLogicRuleInput = {
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
  triggerProductId: string;
  additions: LogicAdditionInput[];
};

export async function createOrderLogicRule(input: OrderLogicRuleInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const parsed = parseRuleInput(input);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_order_rules")
    .insert({
      name: parsed.name,
      description: parsed.description,
      active: parsed.active,
      sort_order: parsed.sortOrder,
      trigger_product_id: parsed.triggerProductId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };

  const ruleId = data.id as string;
  const addResult = await replaceAdditions(admin, ruleId, parsed.additions);
  if (!addResult.ok) {
    await admin.from("product_order_rules").delete().eq("id", ruleId);
    return addResult;
  }

  revalidateLogic();
  return { ok: true as const, id: ruleId };
}

export async function updateOrderLogicRule(id: string, input: OrderLogicRuleInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!id) return { ok: false as const, error: "Invalid rule." };

  const parsed = parseRuleInput(input);
  if (!parsed.ok) return parsed;

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_order_rules")
    .update({
      name: parsed.name,
      description: parsed.description,
      active: parsed.active,
      sort_order: parsed.sortOrder,
      trigger_product_id: parsed.triggerProductId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };

  const addResult = await replaceAdditions(admin, id, parsed.additions);
  if (!addResult.ok) return addResult;

  revalidateLogic(id);
  return { ok: true as const };
}

export async function deleteOrderLogicRule(id: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!id) return { ok: false as const, error: "Invalid rule." };

  const admin = createAdminClient();
  const { error } = await admin.from("product_order_rules").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  revalidateLogic(id);
  return { ok: true as const };
}

function parseRuleInput(input: OrderLogicRuleInput) {
  const name = input.name.trim();
  const description = input.description.trim() || null;
  const triggerProductId = normalizeProductUuid(input.triggerProductId);

  if (!name) return { ok: false as const, error: "Rule name is required." };
  if (!triggerProductId) return { ok: false as const, error: "Choose a valid trigger product UUID." };
  if (input.additions.length === 0) {
    return { ok: false as const, error: "Add at least one product line to include in the order." };
  }

  const additions: { addedProductId: string; qtyPerTriggerUnit: number }[] = [];
  for (const row of input.additions) {
    const addedProductId = normalizeProductUuid(row.addedProductId);
    if (!addedProductId) {
      return { ok: false as const, error: "Each added product must be a valid UUID." };
    }
    if (row.qtyPerTriggerUnit <= 0) {
      return { ok: false as const, error: "Added qty per trigger unit must be greater than zero." };
    }
    additions.push({ addedProductId, qtyPerTriggerUnit: row.qtyPerTriggerUnit });
  }

  return {
    ok: true as const,
    name,
    description,
    active: input.active,
    sortOrder: input.sortOrder,
    triggerProductId,
    additions,
  };
}

async function replaceAdditions(
  admin: ReturnType<typeof createAdminClient>,
  ruleId: string,
  additions: { addedProductId: string; qtyPerTriggerUnit: number }[],
) {
  const { error: delErr } = await admin.from("product_order_rule_additions").delete().eq("rule_id", ruleId);
  if (delErr) return { ok: false as const, error: delErr.message };

  const { error: insErr } = await admin.from("product_order_rule_additions").insert(
    additions.map((a, i) => ({
      rule_id: ruleId,
      added_product_id: a.addedProductId,
      qty_per_trigger_unit: a.qtyPerTriggerUnit,
      sort_order: i,
    })),
  );
  if (insErr) return { ok: false as const, error: insErr.message };
  return { ok: true as const };
}

function revalidateLogic(id?: string) {
  revalidatePath("/dashboard/logic");
  revalidateTag(ORDER_LOGIC_RULES_TAG);
  if (id) {
    revalidatePath(`/dashboard/logic/${id}/edit`);
    revalidateTag(`order-logic-rule-${id}`);
  }
}

function parseOptionalQty(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type ProductQtyLimitsInput = {
  qtyStep: number;
  minOrderQty: string;
  maxOrderQty: string;
};

export async function updateProductOrderQtyLimits(productId: string, input: ProductQtyLimitsInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const pid = normalizeProductUuid(productId);
  if (!pid) return { ok: false as const, error: "Invalid product." };

  const qtyStep = input.qtyStep > 0 ? input.qtyStep : 1;
  const minOrderQty = parseOptionalQty(input.minOrderQty);
  const maxOrderQty = parseOptionalQty(input.maxOrderQty);

  if (minOrderQty !== null && maxOrderQty !== null && minOrderQty > maxOrderQty) {
    return { ok: false as const, error: "Minimum qty cannot exceed maximum qty." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({
      qty_step: qtyStep,
      min_order_qty: minOrderQty,
      max_order_qty: maxOrderQty,
      updated_at: new Date().toISOString(),
    })
    .eq("product_id", pid);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/logic");
  revalidatePath("/dashboard/products");
  revalidateTag(PRODUCTS_LIST_TAG);
  return { ok: true as const };
}
