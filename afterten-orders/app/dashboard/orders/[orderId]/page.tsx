import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { loadPortalOrderLineRows } from "@/lib/portal/order-lines-display";

export const dynamic = "force-dynamic";

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
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

type PageProps = { params: Promise<{ orderId: string }> };

export default async function PortalOrderDetailPage({ params }: PageProps) {
  const { orderId } = await params;
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, order_number, outlet_id, outlet_name, status, employee_name, grand_total, created_at, supervisor_accepted_at, loaded_at, updated_at, driver_id, outlets(active)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) notFound();

  let driverName: string | null = null;
  if (order.driver_id) {
    const { data: driver } = await admin
      .from("delivery_drivers")
      .select("name")
      .eq("id", order.driver_id)
      .maybeSingle();
    driverName = driver?.name ?? null;
  }

  const lines = await loadPortalOrderLineRows(admin, orderId);

  const outletJoin = order.outlets as { active?: boolean } | { active?: boolean }[] | null;
  const outletActive = Array.isArray(outletJoin)
    ? outletJoin[0]?.active
    : outletJoin?.active;

  const revised =
    order.supervisor_accepted_at &&
    new Date(order.updated_at).getTime() - new Date(order.supervisor_accepted_at).getTime() >
      2000;

  return (
    <div className="at-page-shell-table">
      <Link href="/dashboard/orders" className="at-backLink">
        ← All orders
      </Link>
      <h1 className="at-page-title">{order.order_number}</h1>
      <p className="at-page-lead">
        {order.outlet_name} ({order.outlet_id}) · {String(order.status)}
      </p>

      <div className="at-page-card" style={{ marginBottom: 16 }}>
        <dl className="at-orderMetaGrid">
          <dt>Order ID</dt>
          <dd>{order.id}</dd>
          <dt>Placed</dt>
          <dd>{formatWhen(order.created_at)}</dd>
          <dt>Accepted</dt>
          <dd>{formatWhen(order.supervisor_accepted_at)}</dd>
          <dt>Loaded</dt>
          <dd>{formatWhen(order.loaded_at)}</dd>
          <dt>Placed by</dt>
          <dd>{order.employee_name?.trim() || "—"}</dd>
          <dt>Grand total</dt>
          <dd>{formatKwacha(Number(order.grand_total))}</dd>
          <dt>Driver</dt>
          <dd>{driverName ?? "—"}</dd>
          <dt>Outlet active</dt>
          <dd>{outletActive === undefined ? "—" : outletActive ? "Yes" : "No"}</dd>
          <dt>Supervisor revised</dt>
          <dd>{revised ? "Yes" : "No"}</dd>
        </dl>
      </div>

      <div className="at-page-card">
        <h2 className="at-page-sectionTitle">Lines</h2>
        <p className="at-orderIdMuted" style={{ marginBottom: 12, textAlign: "center" }}>
          Qty matches the supervisor app (rule-based auto-add). * = stored value differed before
          the server fix; new accepts store the correct qty.
        </p>
        <div className="at-tableWrap at-orders-table">
          <table className="at-table">
            <thead>
              <tr>
                <th>Item ID</th>
                <th>Name</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Units / line</th>
                <th>Total units</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="at-orderIdMuted">{line.id}</span>
                  </td>
                  <td style={{ textAlign: "left" }}>
                    {line.is_auto ? `- ${line.name}` : line.name}
                  </td>
                  <td>
                    {line.display_qty}
                    {line.qty_adjusted ? (
                      <span className="at-orderIdMuted" title={`Stored: ${line.stored_qty}`}>
                        {" "}
                        *
                      </span>
                    ) : null}
                  </td>
                  <td>{line.uom}</td>
                  <td>{line.units_per_order_unit}</td>
                  <td>{line.total_units}</td>
                  <td>{formatKwacha(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
