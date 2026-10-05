"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import {
  sendDriverDispatchedOrderWhatsApp,
  sendSupervisorAcceptedOrderWhatsApp,
} from "@/lib/integrations/order-whatsapp-alerts";

export async function sendOrderWhatsAppFromPortal(
  orderId: string,
  alert: "accepted" | "dispatched",
) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const trimmed = orderId.trim();
  if (!trimmed) return { ok: false as const, error: "Invalid order." };

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Server misconfigured.",
    };
  }

  const result =
    alert === "accepted"
      ? await sendSupervisorAcceptedOrderWhatsApp(admin, trimmed)
      : await sendDriverDispatchedOrderWhatsApp(admin, trimmed);

  if (!result.ok) {
    return { ok: false as const, error: result.error, skipped: result.skipped };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true as const, preview: result.preview };
}
