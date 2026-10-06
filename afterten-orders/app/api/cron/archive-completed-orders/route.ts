import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";

/** Weekly: mark completed orders older than 90 days archived; move PDFs to archive bucket. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: batch, error: batchErr } = await admin.rpc("archive_completed_orders_batch", {
    p_limit: 40,
  });
  if (batchErr) {
    return NextResponse.json({ error: batchErr.message }, { status: 500 });
  }

  const orderIds = Array.isArray((batch as { order_ids?: unknown })?.order_ids)
    ? ((batch as { order_ids: string[] }).order_ids ?? [])
    : [];

  let movedPdfs = 0;
  const pdfErrors: string[] = [];

  for (const orderId of orderIds) {
    const { data: order } = await admin
      .from("outlet_orders")
      .select("outlet_id, completed_pdf_path")
      .eq("id", orderId)
      .maybeSingle();

    const pdfPath = String(order?.completed_pdf_path ?? "").trim();
    if (!pdfPath.startsWith("completed-orders/") || !order?.outlet_id) continue;

    const key = pdfPath.replace(/^completed-orders\//, "");
    const { data: file, error: dlErr } = await admin.storage.from("completed-orders").download(key);
    if (dlErr || !file) {
      pdfErrors.push(`${orderId}: download ${dlErr?.message ?? "missing"}`);
      continue;
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("completed-orders-archive")
      .upload(key, buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      pdfErrors.push(`${orderId}: archive upload ${upErr.message}`);
      continue;
    }

    await admin.storage.from("completed-orders").remove([key]);
    movedPdfs += 1;
  }

  return NextResponse.json({
    ok: true,
    batch,
    movedPdfs,
    pdfErrors: pdfErrors.length ? pdfErrors : undefined,
  });
}
