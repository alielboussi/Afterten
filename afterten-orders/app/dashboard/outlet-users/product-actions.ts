"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";
import { OUTLET_PRODUCT_ALLOWLIST_TAG } from "@/lib/portal/outlet-product-allowlist-cache";
import { OUTLETS_LIST_TAG } from "@/lib/portal/outlet-data-cache";

export async function saveOutletProductAllowlist(outletId: string, productIds: string[]) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const id = outletId.trim().toUpperCase();
  if (!id) return { ok: false as const, error: "Invalid outlet." };

  const admin = createAdminClient();

  const { data: products, error: productsError } = await admin
    .from("products")
    .select("product_id")
    .eq("active", true);
  if (productsError) return { ok: false as const, error: productsError.message };

  const validIds = new Set((products ?? []).map((p) => p.product_id as string));
  const selected = [...new Set(productIds.map((p) => p.trim().toUpperCase()).filter(Boolean))].filter(
    (p) => validIds.has(p),
  );

  const showAll = validIds.size > 0 && selected.length === validIds.size;

  const { error: deleteError } = await admin.from("outlet_product_allowlist").delete().eq("outlet_id", id);
  if (deleteError) return { ok: false as const, error: deleteError.message };

  if (!showAll && selected.length > 0) {
    const { error: insertError } = await admin.from("outlet_product_allowlist").insert(
      selected.map((product_id) => ({ outlet_id: id, product_id })),
    );
    if (insertError) return { ok: false as const, error: insertError.message };
  }

  const { error: outletError } = await admin
    .from("outlets")
    .update({
      use_product_allowlist: !showAll,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (outletError) return { ok: false as const, error: outletError.message };

  revalidatePath("/dashboard/outlet-users");
  revalidateTag(OUTLET_PRODUCT_ALLOWLIST_TAG);
  revalidateTag(OUTLETS_LIST_TAG);
  revalidateTag(`outlet-product-allowlist-${id}`);
  const mode = showAll ? ("all" as const) : selected.length === 0 ? ("none" as const) : ("custom" as const);
  await logPortalAudit({
    pagePath: "/dashboard/outlet-users",
    actionKind: "edit",
    actionText: `Saved product allowlist for outlet ${id} (${mode}, ${selected.length} product(s)).`,
    metadata: { outletId: id, mode, productCount: selected.length },
  });
  return {
    ok: true as const,
    mode,
  };
}
