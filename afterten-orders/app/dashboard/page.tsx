import { getUncategorizedUsers } from "@/lib/portal/uncategorized-users";
import { NewUserTriagePanel } from "./NewUserTriagePanel";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  let uncategorized: Awaited<ReturnType<typeof getUncategorizedUsers>> = [];
  try {
    uncategorized = await getUncategorizedUsers();
  } catch {
    uncategorized = [];
  }

  return (
    <>
      <NewUserTriagePanel users={uncategorized} />
      <div className="at-page-shell">
        <h1 className="at-page-title">Dashboard</h1>
        <p className="at-page-lead">
          New Google sign-ins are assigned on this page (portal admin, supervisor, or outlet).{" "}
          <strong>Portal Admins</strong> lists dashboard access only.{" "}
          <strong>Supervisors</strong> lists the supervisor app.{" "}
          <strong>Outlet Users</strong> lists Expo Orders app accounts.
        </p>
      </div>
    </>
  );
}
