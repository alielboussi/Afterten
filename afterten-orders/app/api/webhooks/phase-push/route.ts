import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { handlePhasePush, type PhasePushEvent } from "@/lib/integrations/phase-push";

export const runtime = "nodejs";

const EVENTS = new Set<PhasePushEvent>([
  "outlet_order_accepted",
  "supervisor_order_dispatched",
  "supervisor_loading_checklist_done",
  "supervisor_order_completed",
  "supervisor_offloading_checklist_done",
  "supervisor_return_submitted",
  "outlet_return_decided",
]);

export async function POST(req: Request) {
  const secret = process.env.ORDER_NOTIFY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "ORDER_NOTIFY_WEBHOOK_SECRET not configured." }, { status: 503 });
  }
  if (req.headers.get("x-order-notify-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let event = "";
  let orderId: string | null = null;
  let returnId: string | null = null;
  try {
    const body = (await req.json()) as {
      event?: string;
      order_id?: string;
      return_id?: string;
    };
    event = String(body.event ?? "").trim();
    orderId = body.order_id != null ? String(body.order_id).trim() : null;
    returnId = body.return_id != null ? String(body.return_id).trim() : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!EVENTS.has(event as PhasePushEvent)) {
    return NextResponse.json({ error: "Unknown or missing event." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await handlePhasePush(admin, {
    event: event as PhasePushEvent,
    orderId,
    returnId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    event,
    pushTokens: result.pushTokens,
    skipped: result.skipped ?? null,
  });
}
