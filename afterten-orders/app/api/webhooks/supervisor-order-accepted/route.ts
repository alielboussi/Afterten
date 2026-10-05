import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendSupervisorAcceptedOrderWhatsApp } from "@/lib/integrations/order-whatsapp-alerts";
import { generateAndStoreApprovedOrderPdf } from "@/lib/integrations/outlet-order-pdf";

export const runtime = "nodejs";

/**
 * Approved PDF + WhatsApp group alert after supervisor accept (pg_net from accept_supervisor_order).
 */
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

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    console.error("[supervisor-order-accepted]", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const result = await generateAndStoreApprovedOrderPdf(admin, orderId);
    if (!result.ok) {
      console.error("[supervisor-order-accepted]", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const wa = await sendSupervisorAcceptedOrderWhatsApp(admin, orderId);
    const whatsapp = wa.ok
      ? { ok: true as const }
      : { ok: false as const, skipped: wa.skipped, error: wa.error };

    return NextResponse.json({
      ok: true,
      pdf_path: result.pdfPath,
      file_name: result.fileName,
      whatsapp,
      preview: wa.ok ? wa.preview : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF build failed.";
    console.error("[supervisor-order-accepted]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
