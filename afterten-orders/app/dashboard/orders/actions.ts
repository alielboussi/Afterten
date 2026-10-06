"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { createClient } from "@/lib/supabase/server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { purgeAllOrderRelatedStorage } from "@/lib/portal/purge-order-storage";
import {
  sendDriverDispatchedOrderWhatsApp,
  sendSupervisorAcceptedOrderWhatsApp,
} from "@/lib/integrations/order-whatsapp-alerts";
import { sendDailyPickSummaryWhatsApp } from "@/lib/integrations/daily-pick-summary-whatsapp";

const PURGE_CONFIRMATION = "DELETE ALL ORDERS";

export async function purgeAllOutletOrdersFromPortal(confirmation: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (confirmation.trim() !== PURGE_CONFIRMATION) {
    return {
      ok: false as const,
      error: `Type exactly "${PURGE_CONFIRMATION}" to confirm.`,
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Server misconfigured.",
    };
  }

  const storage = await purgeAllOrderRelatedStorage(admin);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_purge_all_outlet_orders", {
    p_confirmation: PURGE_CONFIRMATION,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const payload = data as { deleted_orders?: number } | null;
  const deletedOrders = Number(payload?.deleted_orders ?? 0);

  revalidatePath("/dashboard/orders");

  return {
    ok: true as const,
    deletedOrders,
    removedStorageObjects: storage.removedObjects,
    storageWarnings: storage.errors.length > 0 ? storage.errors.join("; ") : null,
  };
}

export async function sendDailyPickSummaryFromPortal() {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Server misconfigured.",
    };
  }

  const result = await sendDailyPickSummaryWhatsApp(admin);
  if (!result.ok) {
    return { ok: false as const, error: result.error, skipped: result.skipped };
  }

  return {
    ok: true as const,
    preview: result.preview,
    orderCount: result.summary.orderCount,
  };
}

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
