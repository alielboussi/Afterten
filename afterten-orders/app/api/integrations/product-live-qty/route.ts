import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyIntegrationBearer } from "@/lib/integrations/supervisor-accepted-orders-export";
import { upsertProductLiveQtyBatch } from "@/lib/portal/live-qty-stock-alerts";
import { PRODUCTS_LIST_TAG } from "@/lib/portal/products-cache";

export const runtime = "nodejs";

type Body = {
  items?: { product_id?: string; qty?: number }[];
};

/**
 * POST /api/integrations/product-live-qty
 * Bearer auth (same as supervisor-accepted-orders).
 * Body: { "items": [ { "product_id": "<inventory UUID>", "qty": 12.5 } ] }
 */
export async function POST(req: Request) {
  const auth = verifyIntegrationBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "items array required." }, { status: 400 });
  }
  if (rawItems.length > 500) {
    return NextResponse.json({ error: "Max 500 items per request." }, { status: 400 });
  }

  const items = rawItems.map((row) => ({
    product_id: String(row.product_id ?? ""),
    qty: Number(row.qty ?? 0),
  }));

  try {
    const result = await upsertProductLiveQtyBatch(items);
    revalidateTag(PRODUCTS_LIST_TAG);
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      skipped: result.skipped,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
