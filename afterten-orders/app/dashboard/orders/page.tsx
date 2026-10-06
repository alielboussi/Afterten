import { createAdminClient } from "@/lib/supabase/admin-server";
import { DailyPickSendButton } from "./DailyPickSendButton";
import { DeleteAllOrdersButton } from "./DeleteAllOrdersButton";
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

function formatPhaseWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatCreated(iso);
}

export default async function OutletOrdersPage() {
  let orders: PortalOrderRow[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("outlet_orders")
      .select(
        "id, order_number, outlet_id, outlet_name, status, grand_total, created_at, supervisor_accepted_at, loaded_at, completed_at",
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
      placed_at_label: formatPhaseWhen(row.created_at as string),
      accepted_at_label: formatPhaseWhen(row.supervisor_accepted_at as string | null),
      loaded_at_label: formatPhaseWhen(row.loaded_at as string | null),
      received_at_label: formatPhaseWhen(row.completed_at as string | null),
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load orders.";
  }

  return (
    <div className="at-page-shell-table">
      <div className="at-ordersPageHeader">
        <div className="at-ordersPageHeaderMain">
          <h1 className="at-page-title">Outlet orders</h1>
          <p className="at-page-lead">
            Every order phase (placed → accepted → dispatched → received) with PDF downloads for each
            stage. WhatsApp resend: accepted after supervisor approval; dispatched after driver
            handoff.
          </p>
        </div>
        <div className="at-ordersPageHeaderActions">
          <DailyPickSendButton />
          <DeleteAllOrdersButton />
        </div>
      </div>

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
