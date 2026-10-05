import { createAdminClient } from "@/lib/supabase/admin-server";
import { OrdersTable, type PortalOrderRow } from "./OrdersTable";

export const dynamic = "force-dynamic";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

function formatCreated(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default async function OutletOrdersPage() {
  let orders: PortalOrderRow[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("outlet_orders")
      .select(
        "id, order_number, outlet_id, outlet_name, status, grand_total, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    orders = (data ?? []).map((row) => ({
      id: String(row.id),
      order_number: String(row.order_number),
      outlet_id: String(row.outlet_id),
      outlet_name: String(row.outlet_name),
      status: String(row.status),
      grand_total_label: formatKwacha(Number(row.grand_total)),
      created_at_label: formatCreated(String(row.created_at)),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load orders.";
  }

  return (
    <div className="at-page-shell-table">
      <h1 className="at-page-title">Outlet orders</h1>
      <p className="at-page-lead">
        All outlet orders with current status. Download PDFs or resend WhatsApp group alerts
        (accepted when supervisor approved; dispatched after driver handoff).
      </p>

      {loadError ? <p className="at-page-msgErr">{loadError}</p> : null}

      <div className="at-page-card">
        {!loadError && orders.length === 0 ? (
          <p>No orders yet.</p>
        ) : (
          <OrdersTable orders={orders} />
        )}
      </div>
    </div>
  );
}
