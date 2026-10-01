"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function assertCallerIsPortalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Not signed in." };
  }
  const { data: isAdmin, error } = await supabase.rpc("is_portal_admin");
  if (error || !isAdmin) {
    return { ok: false as const, error: "Only portal admins can manage admins." };
  }
  return { ok: true as const };
}

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
  return { ok: true as const };
}
