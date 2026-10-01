import Link from "next/link";
import { getCachedOutletStaffList } from "@/lib/portal/outlet-data-cache";
import page from "@/app/dashboard/dashboard-page.module.css";
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
    <div className={page.pageShellWide}>
      <h1 className={page.pageTitle}>Outlet Users</h1>
      <p className={page.lead}>Outlet app accounts — email + password sign-in on Expo only (no Google).</p>

      {loadError && (
        <p className={page.msgErr}>
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local."
            : null}
        </p>
      )}

      {!loadError && (
        <section className={page.card}>
          <div className={styles.listHeader}>
            <h2 className={page.sectionTitle}>Outlet app accounts</h2>
            <Link href="/dashboard/outlet-users/new" className={styles.createBtn}>
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
                    <th>Alias</th>
                    <th>Email</th>
                    <th>Outlet</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.userId}>
                      <td>{s.alias ?? "—"}</td>
                      <td>{s.email}</td>
                      <td>
                        {s.outletId} — {s.outletName}
                      </td>
                      <td>
                        <span className={s.active ? styles.badgeActive : styles.badgeOff}>
                          {s.active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/outlet-users/${s.userId}/edit`}
                          className={styles.editBtn}
                        >
                          Edit
                        </Link>
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
