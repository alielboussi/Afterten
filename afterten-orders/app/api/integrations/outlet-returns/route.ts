import { NextResponse } from "next/server";
import { fetchOutletReturnsIntegrationExport } from "@/lib/integrations/outlet-returns-export";
import { verifyIntegrationBearer } from "@/lib/integrations/supervisor-accepted-orders-export";

export const runtime = "nodejs";

/**
 * GET /api/integrations/outlet-returns
 * Bearer auth (same key as other integration routes).
 * Only returns after supervisor accepted or rejected (not submitted).
 *
 * Query: limit (1–100), since (ISO on supervisor_decided_at), cursor
 */
export async function GET(req: Request) {
  const auth = verifyIntegrationBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const since = url.searchParams.get("since");
  const cursor = url.searchParams.get("cursor");

  try {
    const body = await fetchOutletReturnsIntegrationExport({ limit, since, cursor });
    return NextResponse.json({ integration: "outlet_returns", ...body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
