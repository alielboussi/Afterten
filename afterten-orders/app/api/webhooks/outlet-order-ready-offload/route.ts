import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendExpoPushBatch } from "@/lib/integrations/outlet-order-notify";

export const runtime = "nodejs";

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
    .select("id, order_number, outlet_id, outlet_name, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "loaded") {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_loaded" });
  }

  const { data: tokenRows } = await admin
    .from("outlet_push_tokens")
    .select("expo_push_token")
    .eq("outlet_id", order.outlet_id)
    .eq("active", true);

  const tokens = (tokenRows ?? []).map((r) => String(r.expo_push_token));
  await sendExpoPushBatch(tokens, {
    title: "Ready to offload",
    body: `${order.order_number} has arrived — open Offloading to receive it.`,
    data: { orderId: order.id, orderNumber: order.order_number, screen: "offloading" },
  });

  return NextResponse.json({ ok: true, pushTokens: tokens.length });
}
