import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPushBatch } from "@/lib/integrations/outlet-order-notify";

export type PhasePushEvent =
  | "outlet_order_accepted"
  | "supervisor_order_dispatched"
  | "supervisor_loading_checklist_done"
  | "supervisor_order_completed"
  | "supervisor_offloading_checklist_done"
  | "supervisor_return_submitted"
  | "outlet_return_decided";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

async function supervisorTokens(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("supervisor_push_tokens")
    .select("expo_push_token")
    .eq("active", true);
  return (data ?? []).map((r) => String(r.expo_push_token));
}

async function outletTokens(admin: SupabaseClient, outletId: string): Promise<string[]> {
  const { data } = await admin
    .from("outlet_push_tokens")
    .select("expo_push_token")
    .eq("outlet_id", outletId)
    .eq("active", true);
  return (data ?? []).map((r) => String(r.expo_push_token));
}

export async function handlePhasePush(
  admin: SupabaseClient,
  input: { event: PhasePushEvent; orderId?: string | null; returnId?: string | null },
): Promise<{ ok: true; pushTokens: number; skipped?: string } | { ok: false; error: string }> {
  const event = input.event;
  const orderId = input.orderId?.trim() || "";
  const returnId = input.returnId?.trim() || "";

  if (event === "supervisor_return_submitted" || event === "outlet_return_decided") {
    if (!returnId) return { ok: false, error: "return_id required." };
  } else if (!orderId) {
    return { ok: false, error: "order_id required." };
  }

  if (event === "outlet_order_accepted") {
    const { data: order, error } = await admin
      .from("outlet_orders")
      .select("id, order_number, outlet_id, outlet_name, grand_total, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "accepted") return { ok: true, pushTokens: 0, skipped: "not_accepted" };

    const tokens = await outletTokens(admin, String(order.outlet_id));
    await sendExpoPushBatch(tokens, {
      title: "Order accepted",
      body: `${order.order_number} was approved · ${formatKwacha(Number(order.grand_total))}`,
      data: {
        event,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        screen: "viewOrders",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "supervisor_order_dispatched") {
    const { data: order, error } = await admin
      .from("outlet_orders")
      .select("id, order_number, outlet_name, driver_name, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "loaded") return { ok: true, pushTokens: 0, skipped: "not_loaded" };

    const driver = String(order.driver_name ?? "").trim() || "Driver";
    const tokens = await supervisorTokens(admin);
    await sendExpoPushBatch(tokens, {
      title: "Order dispatched",
      body: `${order.order_number} → ${order.outlet_name} (${driver})`,
      data: {
        event,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        screen: "deliveryLoading",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "supervisor_loading_checklist_done") {
    const { data: order, error } = await admin
      .from("outlet_orders")
      .select("id, order_number, outlet_name, status, loading_checklist_completed_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!order?.loading_checklist_completed_at) {
      return { ok: true, pushTokens: 0, skipped: "checklist_not_done" };
    }

    const tokens = await supervisorTokens(admin);
    await sendExpoPushBatch(tokens, {
      title: "Ready for driver sign-off",
      body: `${order.order_number} · ${order.outlet_name} — loading checklist complete.`,
      data: {
        event,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        screen: "deliveryLoading",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "supervisor_order_completed") {
    const { data: order, error } = await admin
      .from("outlet_orders")
      .select("id, order_number, outlet_name, offloader_name, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "completed") return { ok: true, pushTokens: 0, skipped: "not_completed" };

    const receiver = String(order.offloader_name ?? "").trim() || "Outlet";
    const tokens = await supervisorTokens(admin);
    await sendExpoPushBatch(tokens, {
      title: "Order completed at outlet",
      body: `${order.outlet_name} completed ${order.order_number} (${receiver})`,
      data: {
        event,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        screen: "completedOrders",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "supervisor_offloading_checklist_done") {
    const { data: order, error } = await admin
      .from("outlet_orders")
      .select("id, order_number, outlet_name, offloading_checklist_completed_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!order?.offloading_checklist_completed_at) {
      return { ok: true, pushTokens: 0, skipped: "offload_checklist_not_done" };
    }

    const tokens = await supervisorTokens(admin);
    await sendExpoPushBatch(tokens, {
      title: "Outlet receiving order",
      body: `${order.outlet_name} confirmed receipt for ${order.order_number}.`,
      data: {
        event,
        orderId: String(order.id),
        orderNumber: String(order.order_number),
        screen: "completedOrders",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "supervisor_return_submitted") {
    const { data: row, error } = await admin
      .from("outlet_returns")
      .select("id, return_number, outlet_name, employee_name, line_name, status")
      .eq("id", returnId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!row) return { ok: false, error: "Return not found." };
    if (row.status !== "submitted") return { ok: true, pushTokens: 0, skipped: "not_submitted" };

    const product = row.line_name ? ` · ${row.line_name}` : "";
    const tokens = await supervisorTokens(admin);
    await sendExpoPushBatch(tokens, {
      title: "New product return",
      body: `${row.outlet_name} return #${row.return_number}${product}`,
      data: {
        event,
        returnId: String(row.id),
        returnNumber: String(row.return_number),
        screen: "returns",
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  if (event === "outlet_return_decided") {
    const { data: row, error } = await admin
      .from("outlet_returns")
      .select("id, return_number, outlet_id, status, line_name")
      .eq("id", returnId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!row) return { ok: false, error: "Return not found." };
    if (row.status !== "accepted" && row.status !== "rejected") {
      return { ok: true, pushTokens: 0, skipped: "not_decided" };
    }

    const decided = row.status === "accepted" ? "accepted" : "rejected";
    const tokens = await outletTokens(admin, String(row.outlet_id));
    await sendExpoPushBatch(tokens, {
      title: decided === "accepted" ? "Return accepted" : "Return rejected",
      body: `Return #${row.return_number}${row.line_name ? ` · ${row.line_name}` : ""} was ${decided}.`,
      data: {
        event,
        returnId: String(row.id),
        returnNumber: String(row.return_number),
        screen: "returns",
        decision: decided,
      },
    });
    return { ok: true, pushTokens: tokens.length };
  }

  return { ok: false, error: `Unknown event: ${event}` };
}
