"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";

export async function setSupervisorAlias(userId: string, alias: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) return { ok: false as const, error: "Invalid user." };

  const trimmed = alias.trim();
  if (trimmed.length > 48) {
    return { ok: false as const, error: "Alias must be 48 characters or fewer." };
  }
  if (trimmed.length > 0 && trimmed.length < 2) {
    return { ok: false as const, error: "Alias must be at least 2 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("supervisor_profiles")
    .update({
      alias: trimmed.length > 0 ? trimmed : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/supervisors");
  revalidateTag("supervisors-list");
  return { ok: true as const };
}

export async function approveSupervisor(userId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) return { ok: false as const, error: "Invalid user." };

  const admin = createAdminClient();
  const { data: row, error: loadErr } = await admin
    .from("supervisor_profiles")
    .select("alias, approved")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadErr) return { ok: false as const, error: loadErr.message };
  if (!row) return { ok: false as const, error: "Supervisor not found." };
  if (row.approved) return { ok: true as const };

  const alias = (row.alias as string | null)?.trim() ?? "";
  if (alias.length < 2) {
    return {
      ok: false as const,
      error: "Set a supervisor alias (at least 2 characters) before approving.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await admin
    .from("supervisor_profiles")
    .update({
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/supervisors");
  revalidateTag("supervisors-list");
  return { ok: true as const };
}

export async function revokeSupervisorApproval(userId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) return { ok: false as const, error: "Invalid user." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("supervisor_profiles")
    .update({
      approved: false,
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/supervisors");
  revalidateTag("supervisors-list");
  return { ok: true as const };
}
