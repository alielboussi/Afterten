/**
 * WhatsApp bodies for order alerts (WasenderAPI). Group JID from WHATSAPP_ORDERS_GROUP_JID.
 */
export type OrderWhatsAppLineKind = "product" | "variant" | "auto";

export type OrderWhatsAppLine = {
  product_id: string;
  parent_product_id: string;
  kind: OrderWhatsAppLineKind;
  productName: string;
  variantName: string | null;
  qty: number;
  uom: string | null;
};

const SECTION_RULE = "────────────────";

function formatQty(qty: number): string {
  return Number.isInteger(qty) || qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
}

function formatUomLabel(uom: string | null): string {
  const raw = (uom ?? "").trim() || "Unit";
  if (/\(s\)$/i.test(raw)) return raw;
  return `${raw}(s)`;
}

function lineDisplayName(line: OrderWhatsAppLine): string {
  const variant = line.variantName?.trim();
  if (variant && (line.kind === "variant" || line.kind === "auto")) {
    return variant;
  }
  return line.productName;
}

/** Plain manual product: `1 Case(s) — Mango Juice`. Variant/auto: `• 4 Tray(s) — …` */
export function formatWhatsAppOrderLine(line: OrderWhatsAppLine): string {
  const qty = formatQty(line.qty);
  const uom = formatUomLabel(line.uom);
  const text = `${qty} ${uom} — ${lineDisplayName(line)}`;
  if (line.kind === "product") return text;
  return `• ${text}`;
}

export type WhatsAppProductGroup = {
  headerName: string;
  lines: OrderWhatsAppLine[];
};

function groupNeedsHeader(group: WhatsAppProductGroup): boolean {
  return group.lines.length > 1 || group.lines.some((l) => l.kind === "variant" || l.kind === "auto");
}

/** Manual line + following auto-adds (single-order sequence). */
export function groupContiguousWhatsAppLines(lines: OrderWhatsAppLine[]): WhatsAppProductGroup[] {
  const groups: WhatsAppProductGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i];
    if (head.kind === "auto") {
      groups.push({ headerName: head.productName, lines: [head] });
      i += 1;
      continue;
    }
    const block: OrderWhatsAppLine[] = [head];
    i += 1;
    while (i < lines.length && lines[i].kind === "auto") {
      block.push(lines[i]);
      i += 1;
    }
    groups.push({ headerName: head.productName, lines: block });
  }
  return groups;
}

export function formatWhatsAppProductGroups(groups: WhatsAppProductGroup[]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    if (groupNeedsHeader(group)) {
      out.push(`*${group.headerName}*`);
    }
    for (const line of group.lines) {
      out.push(formatWhatsAppOrderLine(line));
    }
  }
  return out;
}

export function formatWhatsAppGroupedOrderLines(lines: OrderWhatsAppLine[]): string[] {
  return formatWhatsAppProductGroups(groupContiguousWhatsAppLines(lines));
}

function formatItemBulletLines(lines: OrderWhatsAppLine[]): string[] {
  if (lines.length === 0) return ["(no lines)"];
  return formatWhatsAppGroupedOrderLines(lines);
}

export function countWhatsAppOrderItems(lines: OrderWhatsAppLine[]): number {
  return countWhatsAppLineItems(lines);
}

function countWhatsAppLineItems(lines: OrderWhatsAppLine[]): number {
  return lines.length;
}

/** Shared stock-transfer layout for accept + dispatch WhatsApp alerts. */
function buildOrderWhatsAppMessage(input: {
  headline: string;
  detailLines: string[];
  lines: OrderWhatsAppLine[];
  groups?: WhatsAppProductGroup[];
}): string {
  const itemLines = input.groups
    ? formatWhatsAppProductGroups(input.groups)
    : formatItemBulletLines(input.lines);
  return [
    input.headline,
    "",
    ...input.detailLines,
    "",
    SECTION_RULE,
    ...itemLines,
    SECTION_RULE,
    "",
    `📦 ${countWhatsAppLineItems(input.lines)} item${input.lines.length === 1 ? "" : "s"}`,
  ].join("\n");
}

/** Sent when a supervisor accepts an outlet order (not at placement). */
export type SupervisorAcceptedWhatsAppPayload = {
  orderNumber: string;
  orderId: string;
  outletName: string;
  outletId: string;
  employeeName: string;
  grandTotalFormatted: string;
  acceptedAtKitwe: string;
  lines: OrderWhatsAppLine[];
  groups?: WhatsAppProductGroup[];
};

export function formatSupervisorAcceptedWhatsAppMessage(p: SupervisorAcceptedWhatsAppPayload): string {
  return buildOrderWhatsAppMessage({
    headline: "✅ *Order accepted*",
    detailLines: [
      `📋 *Order:* ${p.orderNumber}`,
      `🏪 *Outlet:* ${p.outletName}`,
      `👤 *Placed by:* ${p.employeeName}`,
      `🕒 *Accepted:* ${p.acceptedAtKitwe}`,
    ],
    lines: p.lines,
    groups: p.groups,
  });
}

/** @deprecated Use formatSupervisorAcceptedWhatsAppMessage — WhatsApp no longer sent on placement. */
export type OutletOrderWhatsAppPayload = {
  orderNumber: string;
  outletName: string;
  outletId: string;
  employeeName: string;
  grandTotalFormatted: string;
  placedAtKitwe: string;
  lineCount: number;
};

/** @deprecated WhatsApp moved to supervisor accept webhook. */
export function formatOutletOrderWhatsAppMessage(p: OutletOrderWhatsAppPayload): string {
  const lines = [
    "🛒 *New outlet order*",
    "",
    `*Order:* ${p.orderNumber}`,
    `*Outlet:* ${p.outletName} (${p.outletId})`,
    `*Placed by:* ${p.employeeName}`,
    `*When:* ${p.placedAtKitwe} (Kitwe)`,
    `📊 *Lines:* ${p.lineCount}`,
  ];
  return lines.join("\n");
}

export type DriverLoadedWhatsAppLine = OrderWhatsAppLine;

export type DriverLoadedWhatsAppPayload = {
  orderNumber: string;
  orderId: string;
  outletName: string;
  outletId: string;
  employeeName: string;
  grandTotalFormatted: string;
  driverName: string;
  loadedAtKitwe: string;
  lines: DriverLoadedWhatsAppLine[];
  groups?: WhatsAppProductGroup[];
};

export function formatDriverLoadedWhatsAppMessage(p: DriverLoadedWhatsAppPayload): string {
  return buildOrderWhatsAppMessage({
    headline: "🚚 *Order dispatched*",
    detailLines: [
      `📋 *Order:* ${p.orderNumber}`,
      `🏪 *Outlet:* ${p.outletName}`,
      `👤 *Placed by:* ${p.employeeName}`,
      `👨‍✈️ *Driver:* ${p.driverName}`,
      `🕒 *Dispatched:* ${p.loadedAtKitwe}`,
    ],
    lines: p.lines,
    groups: p.groups,
  });
}

export function whatsAppSkipReason(env: {
  wasenderKey?: string;
  groupJid?: string;
}): string | null {
  const key = env.wasenderKey?.trim();
  const jid = env.groupJid?.trim();
  if (!key && !jid) {
    return "WhatsApp not configured (WASENDER_API_KEY and WHATSAPP_ORDERS_GROUP_JID missing on server).";
  }
  if (!key) return "WhatsApp not configured (WASENDER_API_KEY missing on server).";
  if (!jid) return "WhatsApp not configured (WHATSAPP_ORDERS_GROUP_JID missing on server).";
  return null;
}

export async function sendWasenderGroupText(input: {
  apiKey: string;
  groupJid: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const groupJid = input.groupJid.trim();
  if (!groupJid) return { ok: false, error: "WhatsApp group JID is not configured." };

  try {
    const res = await fetch("https://www.wasenderapi.com/api/send-message", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: groupJid, text: input.text }),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg =
        (body?.message as string) ||
        (body?.error as string) ||
        `WasenderAPI HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    if (body && body.success === false) {
      return { ok: false, error: String(body.message ?? "WasenderAPI rejected the message.") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WasenderAPI request failed." };
  }
}

export async function sendExpoPushBatch(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) {
    chunks.push(unique.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        chunk.map((to) => ({
          to,
          sound: "default",
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          channelId: "orders",
        })),
      ),
    });
  }
}
