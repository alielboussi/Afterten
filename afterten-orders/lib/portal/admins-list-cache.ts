import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";
import type { AdminAccessState } from "@/app/dashboard/admins/AdminAccessControl";

export type ListedPortalUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
};

export type PortalAdminsListData = {
  users: ListedPortalUser[];
  adminAccess: Record<string, AdminAccessState>;
  aliases: Record<string, string>;
};

async function fetchPortalAdminsListData(): Promise<PortalAdminsListData> {
  const admin = createAdminClient();

  const [{ data: adminRows, error: adminErr }, { data: aliasRows, error: aliasErr }] =
    await Promise.all([
      admin.from("portal_admins").select("user_id, email, active, created_at").order("email"),
      admin.from("portal_user_profiles").select("user_id, alias"),
    ]);

  if (adminErr) throw new Error(adminErr.message);
  if (aliasErr) throw new Error(aliasErr.message);

  const lastSignInById = new Map<string, string | null>();
  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error(authError.message);
  for (const u of authPage.users) {
    lastSignInById.set(u.id, u.last_sign_in_at ?? null);
  }

  const users: ListedPortalUser[] = [];
  const adminAccess: Record<string, AdminAccessState> = {};

  for (const row of adminRows ?? []) {
    const userId = row.user_id as string;
    users.push({
      id: userId,
      email: row.email as string,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
      lastSignIn: lastSignInById.get(userId) ?? null,
    });
    adminAccess[userId] = row.active ? "active" : "revoked";
  }

  const aliases: Record<string, string> = {};
  for (const row of aliasRows ?? []) {
    aliases[row.user_id as string] = (row.alias as string) ?? "";
  }

  return { users, adminAccess, aliases };
}

/** Cached ~90s — Portal Admins lists portal_admins rows only. */
export function getPortalAdminsListData() {
  return unstable_cache(fetchPortalAdminsListData, ["portal-admins-list-v2"], {
    revalidate: 90,
    tags: ["portal-admins-list"],
  })();
}
