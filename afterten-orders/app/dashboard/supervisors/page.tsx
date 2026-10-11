import { getSupervisorsListData } from "@/lib/portal/supervisors-list-cache";
import { AddSupervisorForm } from "./AddSupervisorForm";
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
        Supervisor app accounts (Google sign-in on the Supervisor mobile app). Add someone below or from
        the <strong>Dashboard</strong> popup when they sign in first. Set an <strong>alias</strong>, then{" "}
        <strong>Approve supervisor</strong>.
      </p>

      {loadError && (
        <p className="at-page-msgErr">
          {loadError}
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY")
            ? " Add SUPABASE_SERVICE_ROLE_KEY to afterten-orders/.env.local."
            : null}
        </p>
      )}

      <div className="at-page-card" style={{ marginBottom: 16 }}>
        <AddSupervisorForm />
      </div>

      <div className="at-page-card">
        {!loadError && supervisors.length === 0 && (
          <p className={styles.empty}>
            No supervisors yet. Add one above, or have them sign in on the <strong>Supervisor</strong> app
            with <strong>Continue with Google</strong> (they will show as pending approval).
          </p>
        )}
        {!loadError && supervisors.length > 0 && <SupervisorUsersTable supervisors={supervisors} />}
      </div>
    </div>
  );
}
