import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendDailyPickSummaryWhatsApp } from "@/lib/integrations/daily-pick-summary-whatsapp";

export const runtime = "nodejs";

/** Vercel Cron: 03:30 UTC = 05:30 Africa/Lusaka (Kitwe). Requires CRON_SECRET + Wasender env. */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server misconfigured.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const result = await sendDailyPickSummaryWhatsApp(admin);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        whatsapp: { ok: false, skipped: result.skipped, error: result.error },
        preview: result.preview,
      },
      { status: result.skipped ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    whatsapp: { ok: true },
    order_count: result.summary.orderCount,
    line_count: result.summary.lines.length,
    outlets: result.summary.outletNames,
    preview: result.preview,
  });
}
