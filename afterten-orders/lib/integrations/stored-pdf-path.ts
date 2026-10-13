import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredPdfHit = { ok: true; pdfPath: string; fileName: string; cached: true };

/** When pdf_path is already on the row, skip expensive render/upload on repeat ensure-* calls. */
export function storedPdfHit(
  dbPath: string | null | undefined,
  requiredPrefix: string,
): StoredPdfHit | null {
  const t = String(dbPath ?? "").trim();
  if (!t.startsWith(requiredPrefix)) return null;
  const fileName = t.split("/").pop()?.trim();
  if (!fileName) return null;
  return { ok: true, pdfPath: t, fileName, cached: true };
}

export function hitToResult(hit: StoredPdfHit): {
  ok: true;
  pdfPath: string;
  fileName: string;
} {
  return { ok: true, pdfPath: hit.pdfPath, fileName: hit.fileName };
}

/** One signed URL per unique storage path (parallel). */
export async function batchSignedStorageUrls(
  admin: SupabaseClient,
  dbPaths: Iterable<string | null | undefined>,
  ttlSeconds = 3600,
): Promise<Map<string, string | null>> {
  const unique = new Set<string>();
  for (const p of dbPaths) {
    const t = p?.trim();
    if (t) unique.add(t);
  }

  const out = new Map<string, string | null>();
  if (unique.size === 0) return out;

  await Promise.all(
    [...unique].map(async (trimmed) => {
      const slash = trimmed.indexOf("/");
      if (slash <= 0) {
        out.set(trimmed, null);
        return;
      }
      const bucket = trimmed.slice(0, slash);
      const key = trimmed.slice(slash + 1);
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(key, ttlSeconds);
      out.set(trimmed, error || !data?.signedUrl ? null : data.signedUrl);
    }),
  );

  return out;
}
