import { NextResponse } from "next/server";
import {
  fetchSupervisorAcceptedOrdersExport,
  type IntegrationDetailLevel,
  type IntegrationExportView,
  verifyIntegrationBearer,
} from "@/lib/integrations/supervisor-accepted-orders-export";

export const runtime = "nodejs";

function parseView(raw: string | null): IntegrationExportView {
  return raw === "summary" ? "summary" : "lines";
}

function parseDetail(raw: string | null): IntegrationDetailLevel {
  if (raw === "compact" || raw === "full") return raw;
  return "standard";
}

/**
 * GET /api/integrations/supervisor-accepted-orders
 *
 * Query:
 * - limit (1–100 orders per page, default 25)
 * - since (ISO) — supervisor_accepted_at >= since
 * - cursor — pagination from previous next_cursor
 * - view=lines|summary — summary skips line expansion (lighter)
 * - detail=compact|standard|full — compact drops names/totals; full adds units + line totals
 * - active_outlets_only=false — include inactive outlets (default true)
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
  const view = parseView(url.searchParams.get("view"));
  const detail = parseDetail(url.searchParams.get("detail"));
  const activeParam = url.searchParams.get("active_outlets_only");
  const active_outlets_only = activeParam !== "false";

  try {
    const body = await fetchSupervisorAcceptedOrdersExport({
      limit,
      since,
      cursor,
      view,
      detail,
      active_outlets_only,
    });
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
