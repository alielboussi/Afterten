import "server-only";

import { createClient } from "@/lib/supabase/server";

export const PORTAL_HISTORY_VIEWER_EMAIL = "alielboussi00@gmail.com";

export type PortalAuditKind = "view" | "add" | "edit" | "delete" | "send" | "other";

export function isPortalHistoryViewerEmail(email: string | undefined | null): boolean {
  return email?.trim().toLowerCase() === PORTAL_HISTORY_VIEWER_EMAIL.toLowerCase();
}

export async function logPortalAudit(input: {
  pagePath: string;
  actionKind: PortalAuditKind;
  actionText: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_portal_audit_event", {
      p_page_path: input.pagePath,
      p_action_kind: input.actionKind,
      p_action_text: input.actionText,
      p_metadata: input.metadata ?? null,
    });
  } catch {
    /* audit must not break primary flows */
  }
}
