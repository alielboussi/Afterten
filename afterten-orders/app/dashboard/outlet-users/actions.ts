"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { assertCallerIsPortalAdmin } from "@/lib/portal/assert-portal-admin-action";
import { deriveOutletCredentials } from "@/lib/portal/outlet-identifiers";
import { OUTLETS_LIST_TAG, OUTLET_USERS_LIST_TAG } from "@/lib/portal/outlet-data-cache";

export type CreateOutletUserInput = {
  outletId: string;
  outletName: string;
  email: string;
  password: string;
  alias: string;
};

export async function createOutletUser(input: CreateOutletUserInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const outletName = input.outletName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const alias = input.alias.trim();
  const derived = deriveOutletCredentials(alias);
  const outletId =
    input.outletId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "") || derived.outletId;

  if (!outletId || outletId.length !== 4) {
    return { ok: false as const, error: "Outlet ID must be exactly 4 characters (from alias)." };
  }
  if (derived.outletId && outletId !== derived.outletId) {
    return {
      ok: false as const,
      error: `Outlet ID must be ${derived.outletId} for alias “${alias}”.`,
    };
  }
  if (email !== derived.email) {
    return {
      ok: false as const,
      error: `Email must be ${derived.email} for this alias.`,
    };
  }
  if (!outletName) {
    return { ok: false as const, error: "Outlet name is required." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false as const, error: "Valid email is required." };
  }
  if (password.length < 6) {
    return { ok: false as const, error: "Password must be at least 6 characters." };
  }
  if (!alias || alias.length > 48) {
    return { ok: false as const, error: "Alias is required (max 48 characters)." };
  }

  const admin = createAdminClient();

  const { data: existingAdmin } = await admin
    .from("portal_admins")
    .select("user_id")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (existingAdmin) {
    return { ok: false as const, error: "That email is a portal admin. Use a different account for the outlet app." };
  }

  const { error: outletError } = await admin.from("outlets").upsert(
    {
      id: outletId,
      name: outletName,
      active: true,
      uses_orders_app: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (outletError) {
    return { ok: false as const, error: outletError.message };
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    const msg = authError?.message ?? "Could not create auth user.";
    if (msg.toLowerCase().includes("already")) {
      return { ok: false as const, error: "That email already exists in Auth. Use another email or reset in Supabase." };
    }
    return { ok: false as const, error: msg };
  }

  const userId = created.user.id;

  await admin.from("portal_admins").update({ active: false }).eq("user_id", userId);
  await admin.from("portal_user_profiles").delete().eq("user_id", userId);

  const { error: profileError } = await admin.from("app_profiles").upsert(
    {
      user_id: userId,
      email,
      outlet_id: outletId,
      outlet_name: outletName,
      alias,
      profile_kind: "outlet_app",
      roles: ["branch"],
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false as const, error: profileError.message };
  }

  await admin.from("outlet_order_counters").upsert(
    { outlet_id: outletId, next_sequence: 1 },
    { onConflict: "outlet_id", ignoreDuplicates: true },
  );

  revalidatePath("/dashboard/outlet-users");
  revalidatePath("/dashboard/outlet-users/new");
  revalidateTag(OUTLET_USERS_LIST_TAG);
  revalidateTag(OUTLETS_LIST_TAG);
  return { ok: true as const, userId, outletId };
}

export type UpdateOutletUserInput = {
  userId: string;
  outletId: string;
  outletName: string;
  email: string;
  alias: string;
  password: string;
  active: boolean;
};

export async function updateOutletUser(input: UpdateOutletUserInput) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  const alias = input.alias.trim();
  const derived = deriveOutletCredentials(alias);
  const outletId =
    input.outletId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "") || derived.outletId;
  const outletName = input.outletName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const { userId } = input;

  if (!userId) return { ok: false as const, error: "Invalid user." };
  if (!outletId || outletId.length !== 4) {
    return { ok: false as const, error: "Outlet ID must be exactly 4 characters." };
  }
  if (outletId !== derived.outletId) {
    return { ok: false as const, error: `Outlet ID must be ${derived.outletId} for alias “${alias}”.` };
  }
  if (email !== derived.email) {
    return { ok: false as const, error: `Email must be ${derived.email} for this alias.` };
  }
  if (!outletName) return { ok: false as const, error: "Outlet name is required." };
  if (!email || !email.includes("@")) return { ok: false as const, error: "Valid email is required." };
  if (!alias || alias.length > 48) {
    return { ok: false as const, error: "Alias is required (max 48 characters)." };
  }
  if (password.length > 0 && password.length < 6) {
    return { ok: false as const, error: "Password must be at least 6 characters or left blank." };
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("app_profiles")
    .select("email")
    .eq("user_id", userId)
    .eq("profile_kind", "outlet_app")
    .maybeSingle();

  if (!profile) return { ok: false as const, error: "Outlet user not found." };

  if (email !== (profile.email as string).toLowerCase()) {
    const { data: existingAdmin } = await admin
      .from("portal_admins")
      .select("user_id")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();
    if (existingAdmin) {
      return { ok: false as const, error: "That email belongs to a portal admin." };
    }
  }

  const { error: outletError } = await admin.from("outlets").upsert(
    {
      id: outletId,
      name: outletName,
      active: true,
      uses_orders_app: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (outletError) return { ok: false as const, error: outletError.message };

  const authUpdate: { email?: string; password?: string } = {};
  if (email !== (profile.email as string).toLowerCase()) authUpdate.email = email;
  if (password.length >= 6) authUpdate.password = password;

  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdate);
    if (authError) return { ok: false as const, error: authError.message };
  }

  const { error: profileError } = await admin
    .from("app_profiles")
    .update({
      email,
      outlet_id: outletId,
      outlet_name: outletName,
      alias,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("profile_kind", "outlet_app");

  if (profileError) return { ok: false as const, error: profileError.message };

  revalidatePath("/dashboard/outlet-users");
  revalidatePath(`/dashboard/outlet-users/${userId}/edit`);
  revalidateTag(OUTLET_USERS_LIST_TAG);
  revalidateTag(OUTLETS_LIST_TAG);
  revalidateTag(`outlet-user-${userId}`);
  return { ok: true as const };
}

export async function setOutletUserActive(userId: string, active: boolean) {
  const gate = await assertCallerIsPortalAdmin();
  if (!gate.ok) return gate;

  if (!userId) return { ok: false as const, error: "Invalid user." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_profiles")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("profile_kind", "outlet_app");

  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/outlet-users");
  revalidateTag(OUTLET_USERS_LIST_TAG);
  revalidateTag(`outlet-user-${userId}`);
  return { ok: true as const };
}
