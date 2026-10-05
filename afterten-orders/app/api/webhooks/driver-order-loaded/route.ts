import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  formatDriverLoadedWhatsAppMessage,
  sendWasenderGroupText,
  whatsAppSkipReason,
} from "@/lib/integrations/outlet-order-notify";

export const runtime = "nodejs";

function formatKitwe(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function POST(req: Request) {
  const secret = process.env.ORDER_NOTIFY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "ORDER_NOTIFY_WEBHOOK_SECRET not configured." }, { status: 503 });
  }
  if (req.headers.get("x-order-notify-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let orderId = "";
  try {
    const body = (await req.json()) as { order_id?: string };
    orderId = String(body.order_id ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "order_id required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, order_number, outlet_id, outlet_name, loaded_at, status, driver_id, delivery_drivers(name)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "loaded") {
    return NextResponse.json({ error: "Order is not loaded." }, { status: 409 });
  }

  const driverJoin = order.delivery_drivers as { name?: string } | { name?: string }[] | null;
  const driverName =
    (Array.isArray(driverJoin) ? driverJoin[0]?.name : driverJoin?.name)?.trim() || "—";

  const { data: itemRows, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("name, qty, uom, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const loadedAt = order.loaded_at ?? new Date().toISOString();
  const whatsappText = formatDriverLoadedWhatsAppMessage({
    orderNumber: order.order_number,
    orderId: order.id,
    outletName: order.outlet_name,
    outletId: order.outlet_id,
    driverName,
    loadedAtKitwe: formatKitwe(loadedAt),
    lines: (itemRows ?? []).map((row) => ({
      name: String(row.name ?? ""),
      qty: Number(row.qty),
      uom: row.uom != null ? String(row.uom) : null,
    })),
  });

  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  const groupJid = process.env.WHATSAPP_ORDERS_GROUP_JID?.trim();
  const skip = whatsAppSkipReason({ wasenderKey, groupJid });
  let whatsapp: { ok: boolean; skipped?: boolean; error?: string };
  if (skip) {
    whatsapp = { ok: false, skipped: true, error: skip };
  } else {
    const sent = await sendWasenderGroupText({
      apiKey: wasenderKey!,
      groupJid: groupJid!,
      text: whatsappText,
    });
    whatsapp = sent.ok ? { ok: true } : { ok: false, error: sent.error };
  }

  return NextResponse.json({ ok: true, whatsapp, preview: whatsappText });
}
