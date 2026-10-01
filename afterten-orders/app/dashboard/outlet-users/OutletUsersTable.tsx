"use client";

import Link from "next/link";
import { useState } from "react";
import type { OutletStaffRow } from "@/lib/portal/outlet-data-cache";
import styles from "./outlet-users.module.css";

function PasswordCell({ password }: { password: string | null }) {
  const [show, setShow] = useState(false);

  if (!password) {
    return <span className={styles.passwordEmpty}>—</span>;
  }

  return (
    <div className={styles.passwordCell}>
      <span className={styles.passwordValue}>{show ? password : "••••••"}</span>
      <button
        type="button"
        className={styles.passwordToggle}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="M3 3l18 18M10.58 10.58A2 2 0 0012 15a2 2 0 001.41-3.41M9.88 4.24A10.94 10.94 0 0112 5c4.48 0 8.5 2.69 10 6.5a11.2 11.2 0 01-2.08 3.19M6.61 6.61A11.2 11.2 0 002 11.5C3.5 15.31 7.52 18 12 18c1.05 0 2.06-.14 3-.4"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
            />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function OutletUsersTable({ staff }: { staff: OutletStaffRow[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Outlet</th>
            <th>Email</th>
            <th>Password</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.userId}>
              <td>{s.alias ?? s.outletName ?? "—"}</td>
              <td>{s.email}</td>
              <td>
                <PasswordCell password={s.outletAppPassword} />
              </td>
              <td>
                <span className={s.active ? styles.badgeActive : styles.badgeOff}>
                  {s.active ? "Active" : "Disabled"}
                </span>
              </td>
              <td>
                <div className={styles.actionCell}>
                  <Link
                    href={`/dashboard/outlet-users/${s.userId}/products`}
                    className={styles.productsBtn}
                  >
                    Products
                  </Link>
                  <Link href={`/dashboard/outlet-users/${s.userId}/edit`} className={styles.editBtn}>
                    Edit
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
