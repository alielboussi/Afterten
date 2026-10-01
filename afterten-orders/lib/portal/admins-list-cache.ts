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

  const users: ListedPortalUser[] = [];
  // One page is enough for current scale (~25 outlets); avoids slow multi-page Auth scans.
  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error(authError.message);
  for (const u of authPage.users) {
    if (!u.email) continue;
    users.push({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
    });
  }
  users.sort((a, b) => a.email.localeCompare(b.email));

  const [{ data: adminRows, error: adminErr }, { data: aliasRows, error: aliasErr }] =
    await Promise.all([
      admin.from("portal_admins").select("user_id, active"),
      admin.from("portal_user_profiles").select("user_id, alias"),
    ]);

  if (adminErr) throw new Error(adminErr.message);
  if (aliasErr) throw new Error(aliasErr.message);

  const adminAccess: Record<string, AdminAccessState> = {};
  for (const row of adminRows ?? []) {
    adminAccess[row.user_id as string] = row.active ? "active" : "revoked";
  }

  const aliases: Record<string, string> = {};
  for (const row of aliasRows ?? []) {
    aliases[row.user_id as string] = (row.alias as string) ?? "";
  }

  return { users, adminAccess, aliases };
}

/** Cached ~45s — Portal Admins page hits Supabase Auth once, not on every click. */
export function getPortalAdminsListData() {
  return unstable_cache(fetchPortalAdminsListData, ["portal-admins-list-v1"], {
    revalidate: 90,
    tags: ["portal-admins-list"],
  })();
}
