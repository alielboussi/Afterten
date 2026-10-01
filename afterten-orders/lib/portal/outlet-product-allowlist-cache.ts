import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const OUTLET_PRODUCT_ALLOWLIST_TAG = "outlet-product-allowlist";

export type OutletAllowlistState = {
  outletId: string;
  allowedProductIds: string[];
  usesCustomAllowlist: boolean;
};

async function fetchOutletAllowlist(outletId: string): Promise<OutletAllowlistState> {
  const admin = createAdminClient();

  const { data: outlet, error: outletError } = await admin
    .from("outlets")
    .select("use_product_allowlist")
    .eq("id", outletId)
    .maybeSingle();
  if (outletError) throw new Error(outletError.message);

  const { data, error } = await admin
    .from("outlet_product_allowlist")
    .select("product_id")
    .eq("outlet_id", outletId);
  if (error) throw new Error(error.message);

  const allowedProductIds = (data ?? []).map((r) => r.product_id as string);
  const usesCustomAllowlist = Boolean(outlet?.use_product_allowlist);

  return {
    outletId,
    allowedProductIds,
    usesCustomAllowlist,
  };
}

export function getCachedOutletProductAllowlist(outletId: string) {
  return unstable_cache(
    () => fetchOutletAllowlist(outletId),
    ["outlet-product-allowlist", outletId],
    {
      revalidate: 30,
      tags: [OUTLET_PRODUCT_ALLOWLIST_TAG, `outlet-product-allowlist-${outletId}`],
    },
  )();
}
