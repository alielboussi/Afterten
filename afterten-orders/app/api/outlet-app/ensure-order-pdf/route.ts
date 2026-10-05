import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { generateAndStoreOutletOrderPdf } from "@/lib/integrations/outlet-order-pdf";

export const runtime = "nodejs";

/**
 * Builds the order PDF, uploads to the `order-pdfs` bucket, then sets outlet_orders.pdf_path.
 * Outlet app calls this before downloading so storage always has the file first.
 */
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
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

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await userClient
    .from("app_profiles")
    .select("outlet_id, profile_kind, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }
  if (!profile?.active || profile.profile_kind !== "outlet_app") {
    return NextResponse.json({ error: "Outlet app access only." }, { status: 403 });
  }

  const { data: order, error: orderErr } = await userClient
    .from("outlet_orders")
    .select("id")
    .eq("id", orderId)
    .eq("outlet_id", profile.outlet_id)
    .maybeSingle();

  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    console.error("[ensure-order-pdf]", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const result = await generateAndStoreOutletOrderPdf(admin, orderId);
    if (!result.ok) {
      console.error("[ensure-order-pdf]", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ready: true,
      pdf_path: result.pdfPath,
      file_name: result.fileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF build failed.";
    console.error("[ensure-order-pdf]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
