import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKitweDatetimeCompact } from "@/lib/format-kitwe-datetime";
import { loadOrderWhatsAppLines } from "@/lib/integrations/order-whatsapp-lines";
import {
  formatDriverLoadedWhatsAppMessage,
  formatSupervisorAcceptedWhatsAppMessage,
  sendWasenderGroupText,
  whatsAppSkipReason,
} from "@/lib/integrations/outlet-order-notify";

export {
  formatKitweDatetime,
  formatKitweDatetimeCompact,
  parseTimestamptz,
} from "@/lib/format-kitwe-datetime";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

export async function sendSupervisorAcceptedOrderWhatsApp(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; preview: string } | { ok: false; error: string; skipped?: boolean }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, order_number, outlet_id, outlet_name, employee_name, grand_total, supervisor_accepted_at, status",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (!["accepted", "loaded", "completed"].includes(String(order.status))) {
    return { ok: false, error: "Order is not accepted yet." };
  }

  const lines = await loadOrderWhatsAppLines(admin, orderId);
  const acceptedAt = order.supervisor_accepted_at ?? new Date().toISOString();
  const preview = formatSupervisorAcceptedWhatsAppMessage({
    orderNumber: order.order_number,
    orderId: order.id,
    outletName: order.outlet_name,
    outletId: order.outlet_id,
    employeeName: order.employee_name?.trim() || "—",
    grandTotalFormatted: formatKwacha(Number(order.grand_total)),
    acceptedAtKitwe: formatKitweDatetimeCompact(acceptedAt),
    lines,
  });

  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  const groupJid = process.env.WHATSAPP_ORDERS_GROUP_JID?.trim();
  const skip = whatsAppSkipReason({ wasenderKey, groupJid });
  if (skip) return { ok: false, skipped: true, error: skip };

  const sent = await sendWasenderGroupText({
    apiKey: wasenderKey!,
    groupJid: groupJid!,
    text: preview,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, preview };
}

export async function sendDriverDispatchedOrderWhatsApp(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; preview: string } | { ok: false; error: string; skipped?: boolean }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, order_number, outlet_id, outlet_name, employee_name, grand_total, loaded_at, status, driver_id, delivery_drivers(name)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (!["loaded", "completed"].includes(String(order.status))) {
    return { ok: false, error: "Order is not dispatched yet." };
  }

  const driverJoin = order.delivery_drivers as { name?: string } | { name?: string }[] | null;
  const driverName =
    (Array.isArray(driverJoin) ? driverJoin[0]?.name : driverJoin?.name)?.trim() || "—";

  const lines = await loadOrderWhatsAppLines(admin, orderId);
  const loadedAt = order.loaded_at ?? new Date().toISOString();
  const preview = formatDriverLoadedWhatsAppMessage({
    orderNumber: order.order_number,
    orderId: order.id,
    outletName: order.outlet_name,
    outletId: order.outlet_id,
    employeeName: order.employee_name?.trim() || "—",
    grandTotalFormatted: formatKwacha(Number(order.grand_total)),
    driverName,
    loadedAtKitwe: formatKitweDatetimeCompact(loadedAt),
    lines,
  });

  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  const groupJid = process.env.WHATSAPP_ORDERS_GROUP_JID?.trim();
  const skip = whatsAppSkipReason({ wasenderKey, groupJid });
  if (skip) return { ok: false, skipped: true, error: skip };

  const sent = await sendWasenderGroupText({
    apiKey: wasenderKey!,
    groupJid: groupJid!,
    text: preview,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return { ok: true, preview };
}
