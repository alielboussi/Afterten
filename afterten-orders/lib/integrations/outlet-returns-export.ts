import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-server";
import { loadSupervisorAliasMap } from "@/lib/integrations/resolve-supervisor-alias";
import { batchSignedStorageUrls } from "@/lib/integrations/stored-pdf-path";

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
  catalog_line_id: string | null;
  parent_product_id: string | null;
  line_name: string | null;
  line_uom: string | null;
  return_qty: number | null;
  return_units_per_order: number | null;
  return_units_per_order_uom: string | null;
  is_variant: boolean;
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
  catalog_line_id: string | null;
  parent_product_id: string | null;
  line_name: string | null;
  line_uom: string | null;
  return_qty: number | null;
  return_units_per_order: number | null;
  return_units_per_order_uom: string | null;
  is_variant: boolean | null;
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

function resolveReturnSupervisorAliasFromMaps(
  row: ReturnRow,
  aliasByUserId: Map<string, string>,
): string {
  const stored = String(row.supervisor_decision_alias ?? "").trim();
  if (stored) return stored;

  const userId = row.supervisor_accepted_by ?? row.supervisor_rejected_by;
  if (userId) {
    return aliasByUserId.get(String(userId)) ?? "Supervisor";
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
      "id, return_number, outlet_id, outlet_name, status, employee_name, photo_path, supervisor_decision_alias, supervisor_decided_at, supervisor_accepted_by, supervisor_rejected_by, catalog_line_id, parent_product_id, line_name, line_uom, return_qty, return_units_per_order, return_units_per_order_uom, is_variant",
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

  const supervisorUserIds = rows.flatMap((row) => {
    const ids: string[] = [];
    if (row.supervisor_accepted_by) ids.push(String(row.supervisor_accepted_by));
    if (row.supervisor_rejected_by) ids.push(String(row.supervisor_rejected_by));
    return ids;
  });

  const [photoUrlByPath, aliasByUserId] = await Promise.all([
    batchSignedStorageUrls(admin, rows.map((row) => row.photo_path)),
    loadSupervisorAliasMap(admin, supervisorUserIds),
  ]);

  const records: OutletReturnIntegrationRecord[] = rows.map((row) => {
    const decision = row.status === "accepted" ? "accepted" : "rejected";
    const photoKey = row.photo_path?.trim() ?? "";
    const image_link = photoKey ? (photoUrlByPath.get(photoKey) ?? null) : null;
    const supervisor_alias = resolveReturnSupervisorAliasFromMaps(row, aliasByUserId);
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
      catalog_line_id: row.catalog_line_id ?? null,
      parent_product_id: row.parent_product_id ?? null,
      line_name: row.line_name ?? null,
      line_uom: row.line_uom ?? null,
      return_qty: row.return_qty != null ? Number(row.return_qty) : null,
      return_units_per_order:
        row.return_units_per_order != null ? Number(row.return_units_per_order) : null,
      return_units_per_order_uom: row.return_units_per_order_uom ?? null,
      is_variant: Boolean(row.is_variant),
    };
  });

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
