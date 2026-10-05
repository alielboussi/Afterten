/**
 * WhatsApp bodies for order alerts (WasenderAPI). Group JID from WHATSAPP_ORDERS_GROUP_JID.
 */
export type OrderWhatsAppLineKind = "product" | "variant" | "auto";

export type OrderWhatsAppLine = {
  kind: OrderWhatsAppLineKind;
  productName: string;
  variantName: string | null;
  qty: number;
  uom: string | null;
};

function formatQty(qty: number): string {
  return Number.isInteger(qty) || qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
}

function formatItemBulletLines(lines: OrderWhatsAppLine[]): string[] {
  if (lines.length === 0) return ["📭 (no lines)"];
  return lines.map((line) => {
    const uom = line.uom?.trim() ? ` ${line.uom.trim()}` : "";
    const qty = formatQty(line.qty);

    if (line.kind === "product") {
      return `📦 ${line.productName} x ${qty}${uom}`;
    }

    const variantPart = line.variantName?.trim() ? ` *${line.variantName.trim()}*` : "";
    if (line.kind === "variant") {
      return `- 📦 *${line.productName}* x ${qty}${variantPart}${uom}`;
    }

    return `- 📦 *${line.productName}* x ${qty}${variantPart}${uom}`;
  });
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
};

export function formatSupervisorAcceptedWhatsAppMessage(p: SupervisorAcceptedWhatsAppPayload): string {
  const body = [
    "✅ *Order accepted*",
    "",
    `📋 *Order:* ${p.orderNumber}`,
    `🏪 *Outlet:* ${p.outletName}`,
    `👤 *Placed by:* ${p.employeeName}`,
    `💰 *Total:* ${p.grandTotalFormatted}`,
    `🕐 *Accepted:* ${p.acceptedAtKitwe} (Kitwe)`,
    "",
    "🛍️ *Items:*",
    ...formatItemBulletLines(p.lines),
  ];
  return body.join("\n");
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
    `*Total:* ${p.grandTotalFormatted}`,
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
  driverName: string;
  loadedAtKitwe: string;
  lines: DriverLoadedWhatsAppLine[];
};

export function formatDriverLoadedWhatsAppMessage(p: DriverLoadedWhatsAppPayload): string {
  const body = [
    "🚚 *Order dispatched*",
    "",
    `📋 *Order:* ${p.orderNumber}`,
    `🏪 *Outlet:* ${p.outletName}`,
    `👨‍✈️ *Driver:* ${p.driverName}`,
    `🕐 *Dispatched:* ${p.loadedAtKitwe} (Kitwe)`,
    "",
    "🛍️ *Items:*",
    ...formatItemBulletLines(p.lines),
  ];
  return body.join("\n");
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
