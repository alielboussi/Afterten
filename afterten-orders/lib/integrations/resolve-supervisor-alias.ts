import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const GENERIC_ALIASES = new Set(["", "supervisor"]);

function isGenericAlias(value: string | null | undefined): boolean {
  return GENERIC_ALIASES.has(String(value ?? "").trim().toLowerCase());
}

async function aliasFromSupervisorUserId(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from("supervisor_profiles")
    .select("alias, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "";
  return String(data.alias ?? "").trim() || String(data.email ?? "").trim();
}

async function soleApprovedSupervisorAlias(admin: SupabaseClient): Promise<string> {
  const { data: rows } = await admin
    .from("supervisor_profiles")
    .select("alias, email")
    .eq("approved", true);
  const labels = (rows ?? [])
    .map((r) => String(r.alias ?? "").trim() || String(r.email ?? "").trim())
    .filter((s) => s.length > 0);
  if (labels.length === 1) return labels[0]!;
  return "";
}

/** Display name for approved PDFs; resolves legacy rows that stored the generic "Supervisor". */
export async function resolveSupervisorDisplayAlias(
  admin: SupabaseClient,
  order: {
    supervisor_accepted_alias?: string | null;
    supervisor_accepted_by?: string | null;
  },
): Promise<string> {
  const stored = String(order.supervisor_accepted_alias ?? "").trim();
  if (!isGenericAlias(stored)) return stored;

  const byUserId = order.supervisor_accepted_by
    ? await aliasFromSupervisorUserId(admin, String(order.supervisor_accepted_by))
    : "";
  if (byUserId) return byUserId;

  const sole = await soleApprovedSupervisorAlias(admin);
  if (sole) return sole;

  return stored || "Supervisor";
}
