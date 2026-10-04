import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  formatOutletOrderWhatsAppMessage,
  sendExpoPushBatch,
  sendWasenderGroupText,
} from "@/lib/integrations/outlet-order-notify";
import { generateAndStoreOutletOrderPdf } from "@/lib/integrations/outlet-order-pdf";

export const runtime = "nodejs";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

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

  let orderId: string;
  try {
    const json = (await req.json()) as { order_id?: string };
    orderId = String(json.order_id ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "order_id required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select("id, order_number, outlet_id, outlet_name, employee_name, grand_total, created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const pdfResult = await generateAndStoreOutletOrderPdf(admin, orderId);

  const { count: lineCount } = await admin
    .from("outlet_order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);

  const whatsappText = formatOutletOrderWhatsAppMessage({
    orderNumber: order.order_number,
    outletName: order.outlet_name,
    outletId: order.outlet_id,
    employeeName: order.employee_name?.trim() || "—",
    grandTotalFormatted: formatKwacha(Number(order.grand_total)),
    placedAtKitwe: formatKitwe(order.created_at),
    lineCount: lineCount ?? 0,
  });

  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  const groupJid = process.env.WHATSAPP_ORDERS_GROUP_JID?.trim();
  let whatsapp: { ok: boolean; error?: string } = { ok: true };
  if (wasenderKey && groupJid) {
    const sent = await sendWasenderGroupText({
      apiKey: wasenderKey,
      groupJid,
      text: whatsappText,
    });
    whatsapp = sent.ok ? { ok: true } : { ok: false, error: sent.error };
  }

  const { data: tokenRows } = await admin
    .from("supervisor_push_tokens")
    .select("expo_push_token")
    .eq("active", true);

  const tokens = (tokenRows ?? []).map((r) => String(r.expo_push_token));
  await sendExpoPushBatch(tokens, {
    title: "New outlet order",
    body: `${order.outlet_name}: ${order.order_number} · ${formatKwacha(Number(order.grand_total))}`,
    data: { orderId: order.id, orderNumber: order.order_number },
  });

  return NextResponse.json({
    ok: true,
    pdf: pdfResult.ok ? { path: pdfResult.pdfPath, fileName: pdfResult.fileName } : { error: pdfResult.error },
    whatsapp,
    pushTokens: tokens.length,
    preview: whatsappText,
  });
}
