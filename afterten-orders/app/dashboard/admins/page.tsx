import { getPortalAdminsListData } from "@/lib/portal/admins-list-cache";
import { AdminAccessControl } from "./AdminAccessControl";
import { AliasField } from "./AliasField";
import styles from "./admins.module.css";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default async function AdminsPage() {
  let users: Awaited<ReturnType<typeof getPortalAdminsListData>>["users"] = [];
  let adminAccess: Record<string, "none" | "active" | "revoked"> = {};
  let aliases: Record<string, string> = {};
  let loadError: string | null = null;

  try {
    const data = await getPortalAdminsListData();
    users = data.users;
    adminAccess = data.adminAccess;
    aliases = data.aliases;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load users.";
  }

  return (
    <div className="at-page-shell-wide">
      <h1 className="at-page-title">Portal Admins</h1>
      <p className="at-page-lead">
        Users appear here after they sign in with Google at least once. Click{" "}
        <strong>Make admin</strong> for dashboard-only access. Click a green{" "}
        <strong>Portal admin</strong> pill to revoke. Set an <strong>alias</strong> per user (welcome
        banner and portal display). Outlet app access is removed when granting admin.
      </p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local (server only)."
            : null}
        </p>
      )}

      <div className="at-page-card">
        {!loadError && users.length === 0 && (
          <p className={styles.empty}>No signed-in users yet. Ask them to use Continue with Google once.</p>
        )}
        {!loadError && users.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Alias</th>
                <th>First signed in</th>
                <th>Last sign-in</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <AliasField userId={u.id} initialAlias={aliases[u.id] ?? ""} />
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{formatDate(u.lastSignIn)}</td>
                  <td>
                    <AdminAccessControl
                      userId={u.id}
                      email={u.email}
                      access={adminAccess[u.id] ?? "none"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
