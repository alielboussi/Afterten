import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const ORDER_PDF_BUCKETS = [
  "order-pdfs",
  "approved-orders",
  "driver-handoffs",
  "completed-orders",
  "completed-orders-archive",
] as const;

const SIGNATURES_BUCKET = "signatures";

async function listAllObjectPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return paths;

  for (const entry of data) {
    const name = entry.name;
    if (!name) continue;
    const full = prefix ? `${prefix}/${name}` : name;
    if (entry.id == null) {
      paths.push(...(await listAllObjectPaths(admin, bucket, full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

async function removePaths(admin: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    await admin.storage.from(bucket).remove(chunk);
  }
}

export async function purgeAllOrderRelatedStorage(
  admin: SupabaseClient,
): Promise<{ removedObjects: number; errors: string[] }> {
  const errors: string[] = [];
  let removedObjects = 0;

  for (const bucket of ORDER_PDF_BUCKETS) {
    const paths = await listAllObjectPaths(admin, bucket);
    if (paths.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) errors.push(`${bucket}: ${error.message}`);
      else removedObjects += paths.length;
    }
  }

  const sigPaths = await listAllObjectPaths(admin, SIGNATURES_BUCKET);
  if (sigPaths.length > 0) {
    const { error } = await admin.storage.from(SIGNATURES_BUCKET).remove(sigPaths);
    if (error) errors.push(`${SIGNATURES_BUCKET}: ${error.message}`);
    else removedObjects += sigPaths.length;
  }

  return { removedObjects, errors };
}
