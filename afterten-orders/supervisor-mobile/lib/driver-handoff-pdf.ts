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

async function ensureHandoffPdf(
  supabase: SupabaseClient,
  orderId: string,
): Promise<
  { ok: true; fileName: string; storageKey: string } | { ok: false; error: string }
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Not signed in." };
  }

  const res = await fetch(`${portalBaseUrl()}/api/outlet-app/ensure-driver-handoff-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: orderId }),
  });

  const raw = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
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
      : "driver-handoff.pdf";
  if (!pdfPath.startsWith("driver-handoffs/")) {
    return { ok: false, error: "Handoff PDF path missing." };
  }

  return { ok: true, fileName, storageKey: pdfPath.replace(/^driver-handoffs\//, "") };
}

export async function downloadDriverHandoffPdf(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  let lastError = "Could not build PDF.";
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await sleep(900);
    const ensured = await ensureHandoffPdf(supabase, orderId);
    if (!ensured.ok) {
      lastError = ensured.error;
      continue;
    }
    const { data, error } = await supabase.storage
      .from("driver-handoffs")
      .download(ensured.storageKey);
    if (error || !data) {
      lastError = error?.message ?? "Could not download PDF.";
      continue;
    }
    try {
      const dest = new File(Paths.cache, ensured.fileName);
      dest.write(new Uint8Array(await data.arrayBuffer()));
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dest.uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Driver handoff PDF",
        });
      }
      return { ok: true, fileName: ensured.fileName };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Download failed." };
    }
  }
  return { ok: false, error: lastError };
}
