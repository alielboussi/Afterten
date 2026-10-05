"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { grantPortalAdmin } from "@/app/dashboard/admins/actions";
import { UNCATEGORIZED_USERS_TAG } from "@/lib/portal/uncategorized-users";

/** Tags only — avoid revalidatePath("/dashboard") while triage modal is open (removeChild crash). */
function revalidateTriageTags() {
  revalidateTag(UNCATEGORIZED_USERS_TAG);
  revalidateTag("portal-admins-list");
  revalidateTag("supervisors-list");
}

export async function triageAssignPortalAdmin(userId: string, email: string) {
  const result = await grantPortalAdmin(userId, email);
  if (!result.ok) return result;

  const admin = createAdminClient();
  await admin.from("supervisor_profiles").delete().eq("user_id", userId);

  revalidateTriageTags();
  return { ok: true as const };
}

export async function triageAssignSupervisor(userId: string, email: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const trimmedEmail = email.trim().toLowerCase();
  if (!userId || !trimmedEmail) {
    return { ok: false as const, error: "Invalid user." };
  }

  const admin = createAdminClient();

  await admin.from("portal_admins").delete().eq("user_id", userId);
  await admin.from("app_profiles").delete().eq("user_id", userId);

  const { error } = await admin.from("supervisor_profiles").upsert(
    {
      user_id: userId,
      email: trimmedEmail,
      approved: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) return { ok: false as const, error: error.message };

  revalidateTriageTags();
  return { ok: true as const };
}

export async function triageRemoveAuthUser(userId: string) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;
  if (!userId) return { ok: false as const, error: "Invalid user." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false as const, error: error.message };

  revalidateTriageTags();
  return { ok: true as const };
}
