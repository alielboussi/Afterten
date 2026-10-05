import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  sendExpoPushBatch,
} from "@/lib/integrations/outlet-order-notify";
import { generateAndStoreOutletOrderPdf } from "@/lib/integrations/outlet-order-pdf";

export const runtime = "nodejs";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
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
    pushTokens: tokens.length,
  });
}
