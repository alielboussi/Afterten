import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type ListedSupervisor = {
  userId: string;
  email: string;
  alias: string;
  approved: boolean;
  approvedAt: string | null;
  createdAt: string;
  lastSignIn: string | null;
};

async function fetchSupervisorsListData(): Promise<ListedSupervisor[]> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("supervisor_profiles")
    .select("user_id, email, alias, approved, approved_at, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const lastSignInById = new Map<string, string | null>();
  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error(authError.message);
  for (const u of authPage.users) {
    lastSignInById.set(u.id, u.last_sign_in_at ?? null);
  }

  return (rows ?? []).map((row) => ({
    userId: row.user_id as string,
    email: row.email as string,
    alias: (row.alias as string | null) ?? "",
    approved: Boolean(row.approved),
    approvedAt: (row.approved_at as string | null) ?? null,
    createdAt: row.created_at as string,
    lastSignIn: lastSignInById.get(row.user_id as string) ?? null,
  }));
}

export function getSupervisorsListData() {
  return unstable_cache(fetchSupervisorsListData, ["supervisors-list-v1"], {
    revalidate: 45,
    tags: ["supervisors-list"],
  })();
}
