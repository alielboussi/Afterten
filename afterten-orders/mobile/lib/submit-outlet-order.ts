import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "./person-name";
import { buildCartItemPayload, type CartItemPayload } from "./order-summary";
import type { OutletProduct } from "./supabase";
import { uploadOutletSignature } from "./signature-upload";

export async function submitOutletOrder(
  supabase: SupabaseClient,
  input: {
    outletId: string;
    employeeName: string;
    signaturePngUri: string;
    products: OutletProduct[];
    cartQty: Record<string, number>;
  },
): Promise<
  { ok: true; orderNumber: string; orderId: string } | { ok: false; error: string }
> {
  const name = formatPersonName(input.employeeName);
  if (name.length < 2) {
    return { ok: false, error: "Enter who placed this order." };
  }

  const items: CartItemPayload[] = buildCartItemPayload(input.products, input.cartQty);
  if (items.length === 0) {
    return { ok: false, error: "Add at least one product." };
  }

  const uploaded = await uploadOutletSignature(supabase, input.outletId, input.signaturePngUri);
  if ("error" in uploaded) {
    return { ok: false, error: uploaded.error };
  }

  const { data, error } = await supabase.rpc("place_outlet_order", {
    p_employee_name: name,
    p_employee_signature_path: uploaded.dbPath,
    p_items: items,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  const orderNumber =
    typeof row?.order_number === "string" && row.order_number.trim()
      ? row.order_number.trim()
      : "—";

  const orderId =
    typeof row?.order_id === "string" && row.order_id.trim() ? row.order_id.trim() : "";
  if (!orderId) {
    return { ok: false, error: "Order saved but id missing in response." };
  }

  return { ok: true, orderNumber, orderId };
}
