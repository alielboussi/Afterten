import { getUncategorizedUsers } from "@/lib/portal/uncategorized-users";
import { NewUserTriagePanel } from "./NewUserTriagePanel";
import { LiveQtyStockAlerts } from "./LiveQtyStockAlerts";

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
        <LiveQtyStockAlerts />
        <h1 className="at-page-title">Dashboard</h1>
      </div>
    </>
  );
}
