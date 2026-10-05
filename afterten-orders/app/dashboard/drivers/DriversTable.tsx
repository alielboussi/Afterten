"use client";

import { useTransition } from "react";
import { setDeliveryDriverActive } from "./actions";

type Driver = { id: string; name: string; active: boolean; created_at: string };

export function DriversTable({ drivers }: { drivers: Driver[] }) {
  const [pending, startTransition] = useTransition();

  return (
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
              <button
                type="button"
                className="at-btnSecondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await setDeliveryDriverActive(d.id, !d.active);
                  })
                }
              >
                {d.active ? "Deactivate" : "Activate"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
