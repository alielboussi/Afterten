import { NextResponse } from "next/server";
import {
  fetchOrdersIntegrationExport,
  type IntegrationDetailLevel,
  type IntegrationExportView,
  type IntegrationOrderKind,
  verifyIntegrationBearer,
} from "@/lib/integrations/supervisor-accepted-orders-export";

function parseView(raw: string | null): IntegrationExportView {
  return raw === "summary" ? "summary" : "lines";
}

function parseDetail(raw: string | null): IntegrationDetailLevel {
  if (raw === "compact" || raw === "full") return raw;
  return "standard";
}

export async function handleIntegrationOrdersGet(req: Request, kind: IntegrationOrderKind) {
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
    const body = await fetchOrdersIntegrationExport(kind, {
      limit,
      since,
      cursor,
      view,
      detail,
      active_outlets_only,
    });
    return NextResponse.json({ integration: kind, ...body });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
