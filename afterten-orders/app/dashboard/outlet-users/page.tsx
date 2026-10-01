import Link from "next/link";
import { getCachedOutletStaffList } from "@/lib/portal/outlet-data-cache";
import styles from "@/app/dashboard/outlet-users/outlet-users.module.css";

export default async function OutletUsersPage() {
  let staff: Awaited<ReturnType<typeof getCachedOutletStaffList>> = [];
  let loadError: string | null = null;

  try {
    staff = await getCachedOutletStaffList();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load data.";
  }

  return (
    <div className="at-page-shell-wide">
      <h1 className="at-page-title">Outlet Users</h1>
      <p className="at-page-lead">Outlet app accounts — email + password sign-in on Expo only (no Google).</p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local."
            : null}
        </p>
      )}

      {!loadError && (
        <section className="at-page-card">
          <div className="at-listHeader">
            <h2 className="at-page-sectionTitle">Outlet app accounts</h2>
            <Link href="/dashboard/outlet-users/new" className="at-createBtn">
              Create new
            </Link>
          </div>

          {staff.length === 0 ? (
            <p className={styles.muted}>No outlet users yet. Click Create new to add one.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.userId}>
                      <td>{s.alias ?? s.outletName ?? "—"}</td>
                      <td>{s.email}</td>
                      <td>
                        <span className={s.active ? styles.badgeActive : styles.badgeOff}>
                          {s.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionCell}>
                          <Link
                            href={`/dashboard/outlet-users/${s.userId}/products`}
                            className={styles.productsBtn}
                          >
                            Products
                          </Link>
                          <Link
                            href={`/dashboard/outlet-users/${s.userId}/edit`}
                            className={styles.editBtn}
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
