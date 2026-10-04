import { getSupervisorsListData } from "@/lib/portal/supervisors-list-cache";
import { SupervisorAliasField, SupervisorApprovalControl } from "./SupervisorsTable";
import styles from "../admins/admins.module.css";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default async function SupervisorsPage() {
  let supervisors: Awaited<ReturnType<typeof getSupervisorsListData>> = [];
  let loadError: string | null = null;

  try {
    supervisors = await getSupervisorsListData();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load supervisors.";
  }

  return (
    <div className="at-page-shell-wide">
      <h1 className="at-page-title">Supervisors</h1>
      <p className="at-page-lead">
        Users appear here after they sign in with Google on the <strong>Supervisor</strong> Android app.
        Set an <strong>alias</strong>, then click <strong>Approve supervisor</strong> before they can view
        outlet orders.
      </p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local."
            : null}
        </p>
      )}

      <div className="at-page-card">
        {!loadError && supervisors.length === 0 && (
          <p className={styles.empty}>
            No supervisor sign-ins yet. Ask them to open the supervisor app and use Continue with Google once.
          </p>
        )}
        {!loadError && supervisors.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Alias</th>
                  <th>First sign-in</th>
                  <th>Last sign-in</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s) => (
                  <tr key={s.userId}>
                    <td>{s.email}</td>
                    <td>
                      <SupervisorAliasField userId={s.userId} initialAlias={s.alias} />
                    </td>
                    <td>{formatDate(s.createdAt)}</td>
                    <td>{formatDate(s.lastSignIn)}</td>
                    <td>
                      <SupervisorApprovalControl userId={s.userId} approved={s.approved} />
                      {s.approved ? (
                        <span className={styles.inlineOk}>Approved {formatDate(s.approvedAt)}</span>
                      ) : (
                        <span className={styles.empty}>Pending approval</span>
                      )}
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
