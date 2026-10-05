import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-server";

export type UncategorizedUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
};

export const UNCATEGORIZED_USERS_TAG = "uncategorized-users-list";

/** Auth users with no portal admin, outlet app, or supervisor profile. */
export async function getUncategorizedUsers(): Promise<UncategorizedUser[]> {
  const admin = createAdminClient();

  const [
    { data: authPage, error: authError },
    { data: adminRows, error: adminErr },
    { data: outletRows, error: outletErr },
    { data: supervisorRows, error: supervisorErr },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("portal_admins").select("user_id"),
    admin.from("app_profiles").select("user_id").eq("profile_kind", "outlet_app"),
    admin.from("supervisor_profiles").select("user_id"),
  ]);

  if (authError) throw new Error(authError.message);
  if (adminErr) throw new Error(adminErr.message);
  if (outletErr) throw new Error(outletErr.message);
  if (supervisorErr) throw new Error(supervisorErr.message);

  const assigned = new Set<string>();
  for (const row of adminRows ?? []) assigned.add(row.user_id as string);
  for (const row of outletRows ?? []) assigned.add(row.user_id as string);
  for (const row of supervisorRows ?? []) assigned.add(row.user_id as string);

  const uncategorized: UncategorizedUser[] = [];
  for (const u of authPage.users) {
    if (!u.email) continue;
    if (assigned.has(u.id)) continue;
    uncategorized.push({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
    });
  }

  uncategorized.sort((a, b) => a.email.localeCompare(b.email));
  return uncategorized;
}
