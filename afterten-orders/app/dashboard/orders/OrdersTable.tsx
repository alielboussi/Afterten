"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { sendOrderWhatsAppFromPortal } from "./actions";

export type PortalOrderRow = {
  id: string;
  order_number: string;
  outlet_id: string;
  outlet_name: string;
  status: string;
  grand_total_label: string;
  created_at_label: string;
};

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  accepted: "Accepted",
  loaded: "Loaded",
  completed: "Completed",
};

function statusClass(status: string): string {
  switch (status) {
    case "placed":
      return "at-orderStatusPlaced";
    case "accepted":
      return "at-orderStatusAccepted";
    case "loaded":
      return "at-orderStatusLoaded";
    case "completed":
      return "at-orderStatusCompleted";
    default:
      return "at-orderStatusPlaced";
  }
}

function pdfHref(orderId: string, kind: "placed" | "approved" | "handoff") {
  return `/api/portal/orders/pdf?orderId=${encodeURIComponent(orderId)}&kind=${kind}`;
}

export function OrdersTable({ orders }: { orders: PortalOrderRow[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ orderId: string; text: string; err: boolean } | null>(
    null,
  );

  function sendWa(orderId: string, alert: "accepted" | "dispatched") {
    setMessage(null);
    startTransition(async () => {
      const result = await sendOrderWhatsAppFromPortal(orderId, alert);
      if (!result.ok) {
        setMessage({ orderId, text: result.error, err: true });
        return;
      }
      setMessage({ orderId, text: "WhatsApp sent.", err: false });
    });
  }

  const canApproved = (status: string) =>
    status === "accepted" || status === "loaded" || status === "completed";
  const canHandoff = (status: string) => status === "loaded" || status === "completed";

  return (
    <div className="at-tableWrap at-orders-table">
      <table className="at-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Outlet</th>
            <th>Status</th>
            <th>Total</th>
            <th>Placed</th>
            <th />
            <th>PDF</th>
            <th>WhatsApp</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>{o.order_number}</strong>
                <div className="at-orderIdMuted">{o.id}</div>
              </td>
              <td>
                {o.outlet_name}
                <div className="at-orderIdMuted">{o.outlet_id}</div>
              </td>
              <td>
                <span className={`at-orderStatusPill ${statusClass(o.status)}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </td>
              <td>{o.grand_total_label}</td>
              <td>{o.created_at_label}</td>
              <td>
                <Link className="at-btnSecondary at-btnCompact" href={`/dashboard/orders/${o.id}`}>
                  View
                </Link>
              </td>
              <td>
                <div className="at-orderActions">
                  <a className="at-btnSecondary at-btnCompact" href={pdfHref(o.id, "placed")}>
                    Original
                  </a>
                  {canApproved(o.status) ? (
                    <a className="at-btnSecondary at-btnCompact" href={pdfHref(o.id, "approved")}>
                      Approved
                    </a>
                  ) : null}
                  {canHandoff(o.status) ? (
                    <a className="at-btnSecondary at-btnCompact" href={pdfHref(o.id, "handoff")}>
                      Handoff
                    </a>
                  ) : null}
                </div>
              </td>
              <td>
                <div className="at-orderActions">
                  {canApproved(o.status) ? (
                    <button
                      type="button"
                      className="at-btnSecondary at-btnCompact"
                      disabled={pending}
                      onClick={() => sendWa(o.id, "accepted")}
                    >
                      Accepted
                    </button>
                  ) : (
                    <span className="at-orderActionMuted">—</span>
                  )}
                  {canHandoff(o.status) ? (
                    <button
                      type="button"
                      className="at-btnSecondary at-btnCompact"
                      disabled={pending}
                      onClick={() => sendWa(o.id, "dispatched")}
                    >
                      Dispatched
                    </button>
                  ) : (
                    <span className="at-orderActionMuted">—</span>
                  )}
                </div>
                {message?.orderId === o.id ? (
                  <p
                    className={message.err ? "at-page-msgErr" : "at-page-msgOk"}
                    role="status"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    {message.text}
                  </p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
