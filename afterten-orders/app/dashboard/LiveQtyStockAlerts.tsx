import Link from "next/link";
import { fetchLiveQtyOutOfStockAlerts } from "@/lib/portal/live-qty-stock-alerts";

function formatWhen(iso: string | null): string {
  if (!iso) return "Never synced";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function LiveQtyStockAlerts() {
  let alerts: Awaited<ReturnType<typeof fetchLiveQtyOutOfStockAlerts>> = [];
  let loadError: string | null = null;

  try {
    alerts = await fetchLiveQtyOutOfStockAlerts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load live qty alerts.";
  }

  if (loadError) {
    return (
      <section className="at-page-card at-liveQtyAlertCard">
        <h2 className="at-page-sectionTitle">Live qty — out of stock</h2>
        <p className="at-page-msgErr">{loadError}</p>
      </section>
    );
  }

  if (alerts.length === 0) {
    return (
      <section className="at-page-card at-liveQtyAlertCard at-liveQtyAlertCardOk">
        <h2 className="at-page-sectionTitle">Live qty — stock OK</h2>
      </section>
    );
  }

  return (
    <section className="at-page-card at-liveQtyAlertCard at-liveQtyAlertCardWarn">
      <h2 className="at-page-sectionTitle">
        Live qty — {alerts.length} out of stock
      </h2>
      <div className="at-tableWrap">
        <table className="at-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Inventory UUID</th>
              <th>Live qty</th>
              <th>Last sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alerts.map((row) => (
              <tr key={row.inventoryProductId}>
                <td className="at-nameCell">
                  {row.displayName}
                  {row.kind === "variant" && row.parentName ? (
                    <div className="at-orderIdMuted">Variant · {row.parentName}</div>
                  ) : null}
                </td>
                <td>
                  <span className="at-orderIdMuted">{row.inventoryProductId}</span>
                </td>
                <td>{row.liveQty}</td>
                <td>{formatWhen(row.syncedAt)}</td>
                <td>
                  <Link className="at-btnSecondary at-btnCompact" href={row.editHref}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
