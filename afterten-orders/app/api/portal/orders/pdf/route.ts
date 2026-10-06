import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import {
  createPortalOrderPdfSignedUrl,
  ensurePortalOrderPdf,
  type PortalOrderPdfKind,
} from "@/lib/portal/portal-order-pdf";

export const runtime = "nodejs";

const KINDS: PortalOrderPdfKind[] = ["placed", "approved", "handoff", "completed"];

export async function GET(req: Request) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.error === "Not signed in." ? 401 : 403 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId")?.trim() ?? "";
  const kind = url.searchParams.get("kind")?.trim() as PortalOrderPdfKind;

  if (!orderId) {
    return NextResponse.json({ error: "orderId required." }, { status: 400 });
  }
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be placed, approved, handoff, or completed." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const result = await ensurePortalOrderPdf(admin, orderId, kind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const signed = await createPortalOrderPdfSignedUrl(admin, result.pdfPath, result.fileName);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.error }, { status: 500 });
  }

  return NextResponse.redirect(signed.url);
}
