/**
 * Plain-text WhatsApp body for a newly placed outlet order (WasenderAPI).
 */
export type OutletOrderWhatsAppPayload = {
  orderNumber: string;
  outletName: string;
  outletId: string;
  employeeName: string;
  grandTotalFormatted: string;
  placedAtKitwe: string;
  lineCount: number;
};

export function formatOutletOrderWhatsAppMessage(p: OutletOrderWhatsAppPayload): string {
  const lines = [
    "🛒 *New outlet order*",
    "",
    `*Order:* ${p.orderNumber}`,
    `*Outlet:* ${p.outletName} (${p.outletId})`,
    `*Placed by:* ${p.employeeName}`,
    `*Total:* ${p.grandTotalFormatted}`,
    `*When:* ${p.placedAtKitwe} (Kitwe)`,
    `*Lines:* ${p.lineCount}`,
    "",
    "_Afterten Orders_",
  ];
  return lines.join("\n");
}

export type DriverLoadedWhatsAppLine = {
  name: string;
  qty: number;
  uom: string | null;
};

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
  const itemLines = p.lines.map((line) => {
    const uom = line.uom?.trim() ? ` ${line.uom.trim()}` : "";
    return `• ${line.qty} × ${line.name}${uom}`;
  });

  const body = [
    "🚚 *Order loaded & dispatched*",
    "",
    `*Order:* ${p.orderNumber}`,
    `*Order ID:* ${p.orderId}`,
    `*Outlet:* ${p.outletName} (${p.outletId})`,
    `*Driver:* ${p.driverName}`,
    `*When:* ${p.loadedAtKitwe} (Kitwe)`,
    "",
    "*Items:*",
    ...(itemLines.length > 0 ? itemLines : ["• (no lines)"]),
    "",
    "_Afterten Orders_",
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
