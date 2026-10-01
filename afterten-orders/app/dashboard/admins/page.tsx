import { requirePortalAdmin } from "@/lib/portal/require-portal-admin";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { MakeAdminButton } from "./MakeAdminButton";
import styles from "./admins.module.css";

type ListedUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
};

async function listAuthUsers(): Promise<ListedUser[]> {
  const admin = createAdminClient();
  const users: ListedUser[] = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      if (!u.email) continue;
      users.push({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  users.sort((a, b) => a.email.localeCompare(b.email));
  return users;
}

async function loadAdminUserIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("portal_admins").select("user_id").eq("active", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.user_id as string));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default async function AdminsPage() {
  await requirePortalAdmin();

  let users: ListedUser[] = [];
  let adminIds = new Set<string>();
  let loadError: string | null = null;

  try {
    [users, adminIds] = await Promise.all([listAuthUsers(), loadAdminUserIds()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load users.";
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Portal admins</h1>
      <p className={styles.lead}>
        Users appear here after they sign in with Google at least once. Click{" "}
        <strong>Make admin</strong> for dashboard-only access. That removes any outlet app profile
        for the same account — admins must not use Expo Go.
      </p>

      {loadError && (
        <p className={styles.lead} style={{ color: "var(--afterten-red)" }}>
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local (server only)."
            : null}
        </p>
      )}

      <div className={styles.tableWrap}>
        {!loadError && users.length === 0 && (
          <p className={styles.empty}>No signed-in users yet. Ask them to use Continue with Google once.</p>
        )}
        {!loadError && users.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>First signed in</th>
                <th>Last sign-in</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{formatDate(u.lastSignIn)}</td>
                  <td>
                    <MakeAdminButton userId={u.id} email={u.email} isAdmin={adminIds.has(u.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
