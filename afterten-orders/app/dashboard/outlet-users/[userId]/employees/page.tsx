import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedOutletStaffUser } from "@/lib/portal/outlet-data-cache";
import { listOutletEmployees } from "../../employee-actions";
import { OutletEmployeeManager } from "../../OutletEmployeeManager";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function OutletUserEmployeesPage({ params }: Props) {
  const { userId } = await params;

  let user: Awaited<ReturnType<typeof getCachedOutletStaffUser>> = null;
  let employees: Awaited<ReturnType<typeof listOutletEmployees>> | null = null;
  let loadError: string | null = null;

  try {
    user = await getCachedOutletStaffUser(userId);
    if (user) {
      employees = await listOutletEmployees(user.outletId);
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load data.";
  }

  if (!loadError && !user) notFound();

  const outletLabel = user?.alias?.trim() || user?.outletName || user?.outletId || "Outlet";

  return (
    <div className="at-page-shell-wide">
      <Link href="/dashboard/outlet-users" className="at-backLink">
        ← Back to Outlet Users
      </Link>
      <h1 className="at-page-title">Outlet employees</h1>
      <p className="at-page-lead">
        Names and passcodes for staff who place orders in the mobile app ({user?.outletId}).
      </p>

      {loadError ? <p className="at-page-msgErr">{loadError}</p> : null}
      {!loadError && employees && !employees.ok ? (
        <p className="at-page-msgErr">
          {employees.error}
          {employees.error.includes("outlet_employees")
            ? " Run migration 20261006184000_outlet_employees.sql on Supabase."
            : null}
        </p>
      ) : null}

      {!loadError && user && employees?.ok ? (
        <section className="at-page-card">
          <OutletEmployeeManager
            outletId={user.outletId}
            staffUserId={userId}
            outletLabel={outletLabel}
            initialEmployees={employees.employees}
            returnPath="/dashboard/outlet-users"
          />
        </section>
      ) : null}
    </div>
  );
}
