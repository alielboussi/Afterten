import { getPortalAdminsListData } from "@/lib/portal/admins-list-cache";
import { AdminUsersTable } from "./AdminUsersTable";
import styles from "./admins.module.css";

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
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Portal Admins</h1>
      <p className="at-page-lead">
        People with dashboard access (Google or email sign-in on this website). Revoke or restore access
        here. New sign-ins are assigned from the <strong>Dashboard</strong> home popup.{" "}
        <strong>Delete user</strong> removes the Supabase Auth account entirely.
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
          <p className={styles.empty}>
            No portal admins yet. When someone new signs in with Google, open <strong>Dashboard</strong>{" "}
            and choose <strong>Portal admin</strong> in the popup.
          </p>
        )}
        {!loadError && users.length > 0 && (
          <AdminUsersTable users={users} adminAccess={adminAccess} aliases={aliases} />
        )}
      </div>
    </div>
  );
}
