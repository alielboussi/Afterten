"use client";

import { useState, useTransition } from "react";
import { deleteDeliveryDriver, setDeliveryDriverActive } from "./actions";

type Driver = { id: string; name: string; active: boolean; created_at: string };

export function DriversTable({ drivers }: { drivers: Driver[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; err: boolean } | null>(null);

  return (
    <>
      {message ? (
        <p className={message.err ? "at-page-msgErr" : "at-page-msgOk"} role="status">
          {message.text}
        </p>
      ) : null}
      <table className="at-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.active ? "Active" : "Inactive"}</td>
              <td>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="at-btnSecondary at-btnCompact"
                    disabled={pending}
                    onClick={() => {
                      setMessage(null);
                      startTransition(async () => {
                        await setDeliveryDriverActive(d.id, !d.active);
                      });
                    }}
                  >
                    {d.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="at-btnSecondary at-btnCompact"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Permanently delete driver "${d.name}"?\n\nOrders that used this driver keep the driver name on record.`,
                        )
                      ) {
                        return;
                      }
                      setMessage(null);
                      startTransition(async () => {
                        const result = await deleteDeliveryDriver(d.id);
                        if (!result.ok) {
                          setMessage({ text: result.error, err: true });
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
