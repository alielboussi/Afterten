import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateAndStoreApprovedOrderPdf,
  generateAndStoreDriverHandoffPdf,
  generateAndStoreOutletOrderPdf,
} from "@/lib/integrations/outlet-order-pdf";

export type PortalOrderPdfKind = "placed" | "approved" | "handoff";

export function parseOrderStoragePath(
  fullPath: string,
): { bucket: string; key: string } | null {
  const trimmed = fullPath.trim();
  const buckets = ["order-pdfs", "approved-orders", "driver-handoffs"] as const;
  for (const bucket of buckets) {
    const prefix = `${bucket}/`;
    if (trimmed.startsWith(prefix)) {
      return { bucket, key: trimmed.slice(prefix.length) };
    }
  }
  return null;
}

export async function ensurePortalOrderPdf(
  admin: SupabaseClient,
  orderId: string,
  kind: PortalOrderPdfKind,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  if (kind === "placed") {
    return generateAndStoreOutletOrderPdf(admin, orderId);
  }
  if (kind === "approved") {
    return generateAndStoreApprovedOrderPdf(admin, orderId);
  }
  return generateAndStoreDriverHandoffPdf(admin, orderId);
}

export async function createPortalOrderPdfSignedUrl(
  admin: SupabaseClient,
  pdfPath: string,
  fileName: string,
  expiresInSeconds = 120,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const parsed = parseOrderStoragePath(pdfPath);
  if (!parsed) return { ok: false, error: "Invalid PDF path." };

  const { data, error } = await admin.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.key, expiresInSeconds, { download: fileName });

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create download link." };
  }
  return { ok: true, url: data.signedUrl };
}
