import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { resolveSupervisorDisplayAlias } from "@/lib/integrations/resolve-supervisor-alias";

export type OutletReturnIntegrationRecord = {
  outlet_name: string;
  return_order_id: string;
  employee_name: string;
  supervisor_alias: string;
  supervisor_decision: "accepted" | "rejected";
  image_link: string | null;
  return_id: string;
  outlet_id: string;
  supervisor_decided_at: string;
};

export type OutletReturnsIntegrationResponse = {
  generated_at: string;
  record_count: number;
  next_cursor: string | null;
  records: OutletReturnIntegrationRecord[];
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type ReturnRow = {
  id: string;
  return_number: string;
  outlet_id: string;
  outlet_name: string;
  status: string;
  employee_name: string;
  photo_path: string;
  supervisor_decision_alias: string | null;
  supervisor_decided_at: string | null;
  supervisor_accepted_by: string | null;
  supervisor_rejected_by: string | null;
};

function encodeReturnCursor(decidedAt: string, returnId: string): string {
  return Buffer.from(`${decidedAt}|${returnId}`, "utf8").toString("base64url");
}

function decodeReturnCursor(cursor: string): { decidedAt: string; returnId: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const decidedAt = raw.slice(0, sep);
    const returnId = raw.slice(sep + 1);
    if (!decidedAt || !returnId) return null;
    return { decidedAt, returnId };
  } catch {
    return null;
  }
}

async function signedReturnsPhotoUrl(
  admin: SupabaseClient,
  photoPath: string | null | undefined,
): Promise<string | null> {
  if (!photoPath?.trim().startsWith("returns/")) return null;
  const key = photoPath.trim().replace(/^returns\//, "");
  const { data, error } = await admin.storage.from("returns").createSignedUrl(key, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolveReturnSupervisorAlias(
  admin: SupabaseClient,
  row: ReturnRow,
): Promise<string> {
  const stored = String(row.supervisor_decision_alias ?? "").trim();
  if (stored) return stored;

  const userId = row.supervisor_accepted_by ?? row.supervisor_rejected_by;
  if (userId) {
    return resolveSupervisorDisplayAlias(admin, {
      supervisor_accepted_alias: null,
      supervisor_accepted_by: userId,
    });
  }
  return "Supervisor";
}

export async function fetchOutletReturnsIntegrationExport(options?: {
  limit?: number;
  since?: string | null;
  cursor?: string | null;
}): Promise<OutletReturnsIntegrationResponse> {
  const admin = createAdminClient();
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let query = admin
    .from("outlet_returns")
    .select(
      "id, return_number, outlet_id, outlet_name, status, employee_name, photo_path, supervisor_decision_alias, supervisor_decided_at, supervisor_accepted_by, supervisor_rejected_by",
    )
    .in("status", ["accepted", "rejected"])
    .not("supervisor_decided_at", "is", null)
    .order("supervisor_decided_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options?.since?.trim()) {
    query = query.gte("supervisor_decided_at", options.since.trim());
  }

  const decoded = options?.cursor?.trim() ? decodeReturnCursor(options.cursor.trim()) : null;
  if (decoded) {
    const ts = decoded.decidedAt.replace(/"/g, '\\"');
    const rid = decoded.returnId;
    query = query.or(
      `supervisor_decided_at.lt."${ts}",and(supervisor_decided_at.eq."${ts}",id.lt."${rid}")`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const allRows = (data ?? []) as ReturnRow[];
  const hasMore = allRows.length > limit;
  const rows = hasMore ? allRows.slice(0, limit) : allRows;

  const records: OutletReturnIntegrationRecord[] = await Promise.all(
    rows.map(async (row) => {
      const decision = row.status === "accepted" ? "accepted" : "rejected";
      const [image_link, supervisor_alias] = await Promise.all([
        signedReturnsPhotoUrl(admin, row.photo_path),
        resolveReturnSupervisorAlias(admin, row),
      ]);
      return {
        outlet_name: row.outlet_name,
        return_order_id: row.return_number,
        employee_name: row.employee_name,
        supervisor_alias,
        supervisor_decision: decision,
        image_link,
        return_id: row.id,
        outlet_id: row.outlet_id,
        supervisor_decided_at: String(row.supervisor_decided_at ?? ""),
      };
    }),
  );

  const last = rows[rows.length - 1];
  const next_cursor =
    hasMore && last?.supervisor_decided_at
      ? encodeReturnCursor(String(last.supervisor_decided_at), last.id)
      : null;

  return {
    generated_at: new Date().toISOString(),
    record_count: records.length,
    next_cursor,
    records,
  };
}
