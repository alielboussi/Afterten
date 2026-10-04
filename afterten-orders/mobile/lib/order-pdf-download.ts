import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PORTAL_URL = "https://aftertentransfers.app";

function portalBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_PORTAL_URL?.trim() || DEFAULT_PORTAL_URL;
  return raw.replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify(title: string, body: string) {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Orders & PDFs",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

async function ensurePdfInStorageBucket(
  supabase: SupabaseClient,
  orderId: string,
): Promise<
  | { ok: true; pdfPath: string; fileName: string; storageKey: string }
  | { ok: false; error: string }
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch(`${portalBaseUrl()}/api/outlet-app/ensure-order-pdf`, {
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
      : "order.pdf";
  if (!pdfPath.startsWith("order-pdfs/")) {
    return { ok: false, error: "PDF path missing after upload." };
  }

  const storageKey = pdfPath.replace(/^order-pdfs\//, "");

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.storage.from("order-pdfs").download(storageKey);
    if (!error && data) {
      return { ok: true, pdfPath, fileName, storageKey };
    }
    await sleep(400);
  }

  return { ok: false, error: "PDF saved but not readable yet. Try again shortly." };
}

export async function waitForOrderPdfAndOpen(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  await notify("Order PDF", "Building and saving your order PDF…");

  const ensured = await ensurePdfInStorageBucket(supabase, orderId);
  if (!ensured.ok) {
    return ensured;
  }

  const { fileName, storageKey } = ensured;

  const { data: signed, error: signErr } = await supabase.storage
    .from("order-pdfs")
    .createSignedUrl(storageKey, 3600);

  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: signErr?.message ?? "Could not access PDF." };
  }

  await notify("Order PDF", `Downloading ${fileName}…`);

  try {
    const dest = new File(Paths.cache, fileName);
    await File.downloadFileAsync(signed.signedUrl, dest);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(dest.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "View order PDF",
      });
    }

    await notify("PDF ready", `${fileName} saved — tap to view from share sheet.`);
    return { ok: true, fileName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Download failed." };
  }
}
