"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { logPortalAudit } from "@/lib/portal/portal-audit";
import { UNCATEGORIZED_USERS_TAG } from "@/lib/portal/uncategorized-users";

export async function grantPortalAdmin(userId: string, email: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const trimmedEmail = email.trim().toLowerCase();
  if (!userId || !trimmedEmail) {
    return { ok: false as const, error: "Invalid user." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("portal_admins").upsert(
    {
      user_id: userId,
      email: trimmedEmail,
      active: true,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { ok: false as const, error: error.message };
  }

  // Portal admins must not use the Expo outlet app.
  await admin.from("app_profiles").delete().eq("user_id", userId);
  await admin.from("supervisor_profiles").delete().eq("user_id", userId);

  revalidatePath("/dashboard/admins");
  revalidatePath("/dashboard/supervisors");
  revalidateTag("portal-admins-list");
  revalidateTag("supervisors-list");
  revalidateTag(UNCATEGORIZED_USERS_TAG);
  await logPortalAudit({
    pagePath: "/dashboard/admins",
    actionKind: "add",
    actionText: `Granted portal admin to ${trimmedEmail}.`,
    metadata: { userId },
  });
  return { ok: true as const };
}

export async function revokePortalAdmin(userId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) {
    return { ok: false as const, error: "Invalid user." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) {
    return { ok: false as const, error: "You cannot revoke your own admin access." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("portal_admins")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/dashboard/admins");
  revalidateTag("portal-admins-list");
  await logPortalAudit({
    pagePath: "/dashboard/admins",
    actionKind: "edit",
    actionText: `Revoked portal admin for user ${userId}.`,
    metadata: { userId },
  });
  return { ok: true as const };
}

export async function setPortalUserAlias(userId: string, alias: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) {
    return { ok: false as const, error: "Invalid user." };
  }

  const trimmed = alias.trim();
  if (trimmed.length > 48) {
    return { ok: false as const, error: "Alias must be 48 characters or fewer." };
  }

  const admin = createAdminClient();

  if (trimmed.length === 0) {
    const { error } = await admin.from("portal_user_profiles").delete().eq("user_id", userId);
    if (error) return { ok: false as const, error: error.message };
  } else {
    const { error } = await admin.from("portal_user_profiles").upsert(
      { user_id: userId, alias: trimmed, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath("/dashboard/admins");
  revalidateTag("portal-admins-list");
  revalidateTag(`welcome-${userId}`);
  await logPortalAudit({
    pagePath: "/dashboard/admins",
    actionKind: "edit",
    actionText: trimmed
      ? `Set portal alias for ${userId} to "${trimmed}".`
      : `Cleared portal alias for ${userId}.`,
    metadata: { userId },
  });
  return { ok: true as const };
}

/** Permanently removes a Supabase Auth user and related portal rows. */
export async function deletePortalAuthUser(userId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) {
    return { ok: false as const, error: "Invalid user." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) {
    return { ok: false as const, error: "You cannot delete your own account." };
  }

  const admin = createAdminClient();

  const { data: targetAdmin } = await admin
    .from("portal_admins")
    .select("active")
    .eq("user_id", userId)
    .maybeSingle();

  if (targetAdmin?.active) {
    const { count, error: countErr } = await admin
      .from("portal_admins")
      .select("*", { count: "exact", head: true })
      .eq("active", true);
    if (countErr) return { ok: false as const, error: countErr.message };
    if ((count ?? 0) <= 1) {
      return {
        ok: false as const,
        error: "Cannot delete the only active portal admin. Grant another admin first.",
      };
    }
  }

  await admin.from("portal_admins").delete().eq("user_id", userId);
  await admin.from("portal_user_profiles").delete().eq("user_id", userId);
  await admin.from("app_profiles").delete().eq("user_id", userId);
  await admin.from("supervisor_profiles").delete().eq("user_id", userId);
  await admin.from("supervisor_push_tokens").delete().eq("user_id", userId);

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return { ok: false as const, error: deleteErr.message };
  }

  revalidatePath("/dashboard/admins");
  revalidatePath("/dashboard/supervisors");
  revalidatePath("/dashboard/outlet-users");
  revalidateTag("portal-admins-list");
  revalidateTag(UNCATEGORIZED_USERS_TAG);
  await logPortalAudit({
    pagePath: "/dashboard/admins",
    actionKind: "delete",
    actionText: `Deleted auth user ${userId} and related portal rows.`,
    metadata: { userId },
  });
  return { ok: true as const };
}
