"use server";

import { createClient } from "@/lib/supabase/server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";

export async function recordPortalPageView(pagePath: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return;

  const path = pagePath.trim() || "/dashboard";
  await logPortalAudit({
    pagePath: path,
    actionKind: "view",
    actionText: `Viewed ${path}`,
  });
}

export type PortalAuditRow = {
  id: string;
  created_at: string;
  actor_email: string;
  page_path: string;
  action_kind: string;
  action_text: string;
};

export async function fetchPortalAuditLog(offset: number): Promise<
  | { ok: true; rows: PortalAuditRow[]; hasMore: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: canView, error: viewErr } = await supabase.rpc("is_portal_history_viewer");
  if (viewErr || !canView) {
    return { ok: false, error: "Not authorized to view History." };
  }

  const limit = 100;
  const { data, error } = await supabase.rpc("list_portal_audit_log", {
    p_limit: 101,
    p_offset: Math.max(0, offset),
  });

  if (error) return { ok: false, error: error.message };

  const raw = Array.isArray(data) ? data : [];
  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;

  const rows: PortalAuditRow[] = slice.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      created_at: String(r.created_at ?? ""),
      actor_email: String(r.actor_email ?? ""),
      page_path: String(r.page_path ?? ""),
      action_kind: String(r.action_kind ?? ""),
      action_text: String(r.action_text ?? ""),
    };
  });

  return { ok: true, rows, hasMore };
}
