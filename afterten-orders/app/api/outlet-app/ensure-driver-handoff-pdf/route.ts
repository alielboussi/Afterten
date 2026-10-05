import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { generateAndStoreDriverHandoffPdf } from "@/lib/integrations/outlet-order-pdf";

export const runtime = "nodejs";

async function authorize(authHeader: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !authHeader?.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized." };

  const { data: isSupervisor } = await userClient.rpc("is_approved_supervisor");
  if (isSupervisor) return { ok: true as const, userClient };

  const { data: profile } = await userClient
    .from("app_profiles")
    .select("outlet_id, profile_kind, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.active && profile.profile_kind === "outlet_app") {
    return { ok: true as const, userClient, outletId: profile.outlet_id as string };
  }
  return { ok: false as const, status: 403, error: "Outlet or supervisor access only." };
}

export async function POST(req: Request) {
  const auth = await authorize(req.headers.get("Authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  const { data: order, error: orderErr } = await auth.userClient
    .from("outlet_orders")
    .select("id, status, outlet_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if ("outletId" in auth && auth.outletId && order.outlet_id !== auth.outletId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "loaded") {
    return NextResponse.json({ error: "Handoff PDF not ready." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const result = await generateAndStoreDriverHandoffPdf(admin, orderId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ready: true,
    pdf_path: result.pdfPath,
    file_name: result.fileName,
  });
}
