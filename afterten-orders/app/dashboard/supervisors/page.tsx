import { getSupervisorsListData } from "@/lib/portal/supervisors-list-cache";
import { SupervisorUsersTable } from "./SupervisorUsersTable";
import styles from "../admins/admins.module.css";

export const dynamic = "force-dynamic";

export default async function SupervisorsPage() {
  let supervisors: Awaited<ReturnType<typeof getSupervisorsListData>> = [];
  let loadError: string | null = null;

  try {
    supervisors = await getSupervisorsListData();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load supervisors.";
  }

  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Supervisors</h1>
      <p className="at-page-lead">
        Supervisor app accounts only (Google sign-in on the Supervisor mobile app). New supervisors are
        added from the <strong>Dashboard</strong> popup or when they complete Google sign-in on the app.
        Set an <strong>alias</strong>, then <strong>Approve supervisor</strong>.
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
            No supervisor sign-ins yet. In the <strong>Supervisor</strong> app (not Orders), tap{" "}
            <strong>Continue with Google</strong> and finish sign-in—you should see{" "}
            <strong>Awaiting approval</strong>. If the app shows an error, open Supabase SQL Editor and
            run{" "}
            <code>select email, approved from supervisor_profiles;</code> to confirm a row exists (same
            project as <code>NEXT_PUBLIC_SUPABASE_URL</code>).
          </p>
        )}
        {!loadError && supervisors.length > 0 && <SupervisorUsersTable supervisors={supervisors} />}
      </div>
    </div>
  );
}
