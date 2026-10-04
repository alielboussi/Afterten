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
