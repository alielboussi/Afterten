"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";

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

  revalidatePath("/dashboard/admins");
  revalidatePath("/dashboard");
  revalidateTag("portal-admins-list");
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
  revalidatePath("/dashboard");
  revalidateTag("portal-admins-list");
  revalidateTag(`welcome-${userId}`);
  return { ok: true as const };
}
