import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKwacha, formatOrderDate } from "./currency";

export type CompletedOrderTimeline = {
  order_id: string;
  order_number: string;
  outlet_name: string;
  grand_total: number;
  placed_at: string;
  placed_by: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  dispatched_at: string | null;
  dispatched_by: string | null;
  received_at: string | null;
  received_by: string | null;
};

export async function fetchCompletedOrderTimeline(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ timeline: CompletedOrderTimeline | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_completed_order_timeline", {
    p_order_id: orderId,
  });
  if (error) return { timeline: null, error: error.message };
  const o = data as Record<string, unknown>;
  return {
    timeline: {
      order_id: String(o.order_id ?? orderId),
      order_number: String(o.order_number ?? ""),
      outlet_name: String(o.outlet_name ?? ""),
      grand_total: Number(o.grand_total ?? 0),
      placed_at: String(o.placed_at ?? ""),
      placed_by: o.placed_by != null ? String(o.placed_by) : null,
      accepted_at: o.accepted_at != null ? String(o.accepted_at) : null,
      accepted_by: o.accepted_by != null ? String(o.accepted_by) : null,
      dispatched_at: o.dispatched_at != null ? String(o.dispatched_at) : null,
      dispatched_by: o.dispatched_by != null ? String(o.dispatched_by) : null,
      received_at: o.received_at != null ? String(o.received_at) : null,
      received_by: o.received_by != null ? String(o.received_by) : null,
    },
    error: null,
  };
}

export function formatTimelineWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatOrderDate(iso)} (Kitwe)`;
}

export { formatKwacha };
