import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKitweDatetimeCompact } from "@/lib/format-kitwe-datetime";
import { loadOrderWhatsAppLines } from "@/lib/integrations/order-whatsapp-lines";
import type { OrderWhatsAppLine } from "@/lib/integrations/outlet-order-notify";
import {
  sendWasenderGroupText,
  whatsAppSkipReason,
} from "@/lib/integrations/outlet-order-notify";

export type AggregatedPickLine = {
  product_id: string;
  productName: string;
  uom: string | null;
  qty: number;
  kind: OrderWhatsAppLine["kind"];
};

export type DailyPickSummary = {
  generatedAtIso: string;
  orderCount: number;
  outletNames: string[];
  lines: AggregatedPickLine[];
};

function formatQty(qty: number): string {
  return Number.isInteger(qty) || qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
}

function formatUomLabel(uom: string | null): string {
  const raw = (uom ?? "").trim() || "Unit";
  if (/\(s\)$/i.test(raw)) return raw;
  return `${raw}(s)`;
}

/** Warehouse list: every row is a bullet (totals across outlets). */
function formatAggregatedPickLine(line: AggregatedPickLine): string {
  const qty = formatQty(line.qty);
  const uom = formatUomLabel(line.uom);
  return `• ${qty} ${uom} — ${line.productName}`;
}

export function formatDailyPickSummaryWhatsAppMessage(summary: DailyPickSummary): string {
  const whenKitwe = formatKitweDatetimeCompact(summary.generatedAtIso);
  const outlets =
    summary.outletNames.length > 0
      ? summary.outletNames.join(", ")
      : "—";

  if (summary.orderCount === 0) {
    return [
      "📦 *Daily pick summary* (all outlets)",
      "",
      `🕒 ${whenKitwe}`,
      "",
      "No accepted orders waiting to pick.",
    ].join("\n");
  }

  const itemLines = summary.lines.map(formatAggregatedPickLine);
  const orderLabel = summary.orderCount === 1 ? "1 order" : `${summary.orderCount} orders`;

  return [
    "📦 *Daily pick summary* (all outlets)",
    "",
    `🕒 ${whenKitwe}`,
    `🏪 *Outlets:* ${outlets}`,
    `📋 *${orderLabel}* (supervisor accepted, not yet dispatched)`,
    "",
    "────────────────",
    ...itemLines,
    "────────────────",
    "",
    `📦 ${summary.lines.length} product line${summary.lines.length === 1 ? "" : "s"}`,
  ].join("\n");
}

export async function loadDailyPickSummary(admin: SupabaseClient): Promise<DailyPickSummary> {
  const generatedAtIso = new Date().toISOString();
  const { data: orders, error } = await admin
    .from("outlet_orders")
    .select("id, outlet_name")
    .eq("status", "accepted")
    .order("outlet_name", { ascending: true });

  if (error) throw new Error(error.message);

  const orderRows = orders ?? [];
  const outletNames = [...new Set(orderRows.map((o) => String(o.outlet_name ?? "").trim()).filter(Boolean))];

  const totals = new Map<string, AggregatedPickLine>();

  for (const order of orderRows) {
    const lines = await loadOrderWhatsAppLines(admin, String(order.id));
    for (const line of lines) {
      const key = line.product_id.trim().toLowerCase();
      const existing = totals.get(key);
      if (existing) {
        existing.qty += line.qty;
        continue;
      }
      totals.set(key, {
        product_id: key,
        productName: line.productName,
        uom: line.uom,
        qty: line.qty,
        kind: line.kind,
      });
    }
  }

  const lines = [...totals.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName, "en", { sensitivity: "base" }),
  );

  return {
    generatedAtIso,
    orderCount: orderRows.length,
    outletNames,
    lines,
  };
}

export async function sendDailyPickSummaryWhatsApp(
  admin: SupabaseClient,
): Promise<
  | { ok: true; preview: string; summary: DailyPickSummary }
  | { ok: false; error: string; skipped?: boolean; preview?: string }
> {
  const summary = await loadDailyPickSummary(admin);
  const preview = formatDailyPickSummaryWhatsAppMessage(summary);

  const wasenderKey = process.env.WASENDER_API_KEY?.trim();
  const groupJid = process.env.WHATSAPP_ORDERS_GROUP_JID?.trim();
  const skip = whatsAppSkipReason({ wasenderKey, groupJid });
  if (skip) return { ok: false, skipped: true, error: skip, preview };

  const sent = await sendWasenderGroupText({
    apiKey: wasenderKey!,
    groupJid: groupJid!,
    text: preview,
  });
  if (!sent.ok) return { ok: false, error: sent.error, preview };
  return { ok: true, preview, summary };
}
