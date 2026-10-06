import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completeOutletOrder } from "./offloading";
import { downloadCompletedOrderPdf } from "./completed-order-pdf";
import { uploadOffloaderSignature } from "./signature-upload";
import { formatPersonName } from "./person-name";

const STORAGE_KEY = "afterten:offline-complete-queue:v1";

export type OfflineCompleteJob = {
  id: string;
  orderId: string;
  outletId: string;
  offloaderName: string;
  signatureLocalUri: string;
  createdAt: string;
};

async function readQueue(): Promise<OfflineCompleteJob[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OfflineCompleteJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(jobs: OfflineCompleteJob[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export async function enqueueOfflineComplete(job: Omit<OfflineCompleteJob, "id" | "createdAt">): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...job,
    id: `${job.orderId}-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  await writeQueue(queue);
}

export async function flushOfflineCompleteQueue(
  supabase: SupabaseClient,
): Promise<{ processed: number; errors: string[] }> {
  const queue = await readQueue();
  if (queue.length === 0) return { processed: 0, errors: [] };

  const remaining: OfflineCompleteJob[] = [];
  const errors: string[] = [];
  let processed = 0;

  for (const job of queue) {
    const uploaded = await uploadOffloaderSignature(
      supabase,
      job.outletId,
      job.orderId,
      job.signatureLocalUri,
    );
    if ("error" in uploaded) {
      errors.push(uploaded.error);
      remaining.push(job);
      continue;
    }
    const done = await completeOutletOrder(
      supabase,
      job.orderId,
      formatPersonName(job.offloaderName),
      uploaded.dbPath,
    );
    if (done.error) {
      errors.push(done.error);
      remaining.push(job);
      continue;
    }
    await downloadCompletedOrderPdf(supabase, job.orderId);
    processed += 1;
  }

  await writeQueue(remaining);
  return { processed, errors };
}

export async function pendingOfflineCompleteCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export function isLikelyNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("failed to fetch") ||
    m.includes("timeout") ||
    m.includes("internet")
  );
}
