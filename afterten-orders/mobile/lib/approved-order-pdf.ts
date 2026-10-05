import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PORTAL_URL = "https://aftertentransfers.app";

function portalBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_PORTAL_URL?.trim() || DEFAULT_PORTAL_URL;
  return raw.replace(/\/$/, "");
}

export async function downloadApprovedOrderPdf(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch(`${portalBaseUrl()}/api/outlet-app/ensure-approved-order-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: orderId }),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg =
      (typeof body?.error === "string" && body.error) ||
      `Could not build PDF (HTTP ${res.status}).`;
    return { ok: false, error: msg };
  }

  const pdfPath = typeof body?.pdf_path === "string" ? body.pdf_path : "";
  const fileName =
    typeof body?.file_name === "string" && body.file_name.trim()
      ? body.file_name.trim()
      : "approved-order.pdf";
  if (!pdfPath.startsWith("approved-orders/")) {
    return { ok: false, error: "Approved PDF path missing." };
  }

  const storageKey = pdfPath.replace(/^approved-orders\//, "");
  const { data, error } = await supabase.storage.from("approved-orders").download(storageKey);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not download PDF." };
  }

  try {
    const dest = new File(Paths.cache, fileName);
    const buffer = await data.arrayBuffer();
    dest.write(new Uint8Array(buffer));

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(dest.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Approved order PDF",
      });
    }
    return { ok: true, fileName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Download failed." };
  }
}
