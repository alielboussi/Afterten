import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendDriverDispatchedOrderWhatsApp } from "@/lib/integrations/order-whatsapp-alerts";

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
  const result = await sendDriverDispatchedOrderWhatsApp(admin, orderId);
  if (!result.ok) {
    const status = result.error === "Order not found." ? 404 : result.skipped ? 503 : 400;
    return NextResponse.json(
      { ok: false, whatsapp: { ok: false, skipped: result.skipped, error: result.error } },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    whatsapp: { ok: true },
    preview: result.preview,
  });
}
