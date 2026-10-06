import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { generateAndStoreOutletReturnPdf } from "@/lib/integrations/outlet-return-pdf";

export const runtime = "nodejs";

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

  let returnId = "";
  try {
    const body = (await req.json()) as { return_id?: string };
    returnId = String(body.return_id ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!returnId) {
    return NextResponse.json({ error: "return_id required." }, { status: 400 });
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

  const { data: ret, error: retErr } = await userClient
    .from("outlet_returns")
    .select("id")
    .eq("id", returnId)
    .eq("outlet_id", profile.outlet_id)
    .maybeSingle();

  if (retErr) {
    return NextResponse.json({ error: retErr.message }, { status: 500 });
  }
  if (!ret) {
    return NextResponse.json({ error: "Return not found." }, { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const result = await generateAndStoreOutletReturnPdf(admin, returnId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ready: true,
      pdf_path: result.pdfPath,
      file_name: result.fileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF build failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
