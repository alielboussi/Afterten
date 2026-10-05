import { createAdminClient } from "@/lib/supabase/admin-server";
import { DriversTable } from "./DriversTable";
import { AddDriverForm } from "./AddDriverForm";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  let drivers: { id: string; name: string; active: boolean; created_at: string }[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("delivery_drivers")
      .select("id, name, active, created_at")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    drivers = (data ?? []) as typeof drivers;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load drivers.";
  }

  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Delivery drivers</h1>
      <p className="at-page-lead">
        Names appear in the supervisor <strong>Delivery Loading</strong> app when signing a driver
        handoff.
      </p>

      {loadError ? <p className="at-page-msgErr">{loadError}</p> : null}

      <div className="at-page-card" style={{ marginBottom: 16 }}>
        <AddDriverForm />
      </div>

      <div className="at-page-card">
        {!loadError && drivers.length === 0 ? (
          <p>No drivers yet. Add a name above.</p>
        ) : (
          <DriversTable drivers={drivers} />
        )}
      </div>
    </div>
  );
}
