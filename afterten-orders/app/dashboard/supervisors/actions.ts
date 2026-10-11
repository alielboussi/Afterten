"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";
import { UNCATEGORIZED_USERS_TAG } from "@/lib/portal/uncategorized-users";

export type CreateSupervisorInput = {
  email: string;
  alias: string;
};

function isAuthEmailAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already") || m.includes("registered") || m.includes("exists");
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.trim().toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Pre-register a supervisor (Google sign-in on the Supervisor app with this email). */
export async function createSupervisor(input: CreateSupervisorInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const email = input.email.trim().toLowerCase();
  const alias = input.alias.trim();

  if (!email || !email.includes("@")) {
    return { ok: false as const, error: "Enter the Google account email for this supervisor." };
  }
  if (alias.length > 0 && alias.length < 2) {
    return { ok: false as const, error: "Alias must be at least 2 characters (or leave blank)." };
  }
  if (alias.length > 48) {
    return { ok: false as const, error: "Alias must be 48 characters or fewer." };
  }

  const admin = createAdminClient();

  const { data: activeAdmin } = await admin
    .from("portal_admins")
    .select("user_id")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (activeAdmin) {
    return {
      ok: false as const,
      error: "That email is an active portal admin. Use a different Google account for supervisors.",
    };
  }

  const { data: outletProfile } = await admin
    .from("app_profiles")
    .select("user_id")
    .eq("email", email)
    .eq("profile_kind", "outlet_app")
    .eq("active", true)
    .maybeSingle();
  if (outletProfile) {
    return {
      ok: false as const,
      error: "That email is an outlet app user. Supervisors must use a different account.",
    };
  }

  let userId: string | null = null;
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
  } else if (authError && isAuthEmailAlreadyRegistered(authError.message)) {
    userId = await findAuthUserIdByEmail(email);
    if (!userId) {
      return {
        ok: false as const,
        error: "That email exists in Auth but could not be loaded. Try again or use Dashboard triage.",
      };
    }
  } else {
    return { ok: false as const, error: authError?.message ?? "Could not create auth user." };
  }

  await admin.from("portal_admins").update({ active: false }).eq("user_id", userId);
  await admin.from("portal_user_profiles").delete().eq("user_id", userId);
  await admin.from("app_profiles").delete().eq("user_id", userId);

  const { error: profileError } = await admin.from("supervisor_profiles").upsert(
    {
      user_id: userId,
      email,
      alias: alias.length > 0 ? alias : null,
      approved: false,
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return { ok: false as const, error: profileError.message };
  }

  revalidatePath("/dashboard/supervisors");
  revalidateTag("supervisors-list");
  revalidateTag(UNCATEGORIZED_USERS_TAG);
  await logPortalAudit({
    pagePath: "/dashboard/supervisors",
    actionKind: "add",
    actionText: `Added supervisor ${email}${alias ? ` (alias "${alias}")` : ""}.`,
    metadata: { userId, email, alias: alias || null },
  });

  return { ok: true as const };
}

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
  await logPortalAudit({
    pagePath: "/dashboard/supervisors",
    actionKind: "edit",
    actionText: trimmed
      ? `Set supervisor alias for ${userId} to "${trimmed}".`
      : `Cleared supervisor alias for ${userId}.`,
    metadata: { userId },
  });
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
  await logPortalAudit({
    pagePath: "/dashboard/supervisors",
    actionKind: "edit",
    actionText: `Approved supervisor ${userId} (alias "${alias}").`,
    metadata: { userId },
  });
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
  await logPortalAudit({
    pagePath: "/dashboard/supervisors",
    actionKind: "edit",
    actionText: `Revoked supervisor approval for ${userId}.`,
    metadata: { userId },
  });
  return { ok: true as const };
}
