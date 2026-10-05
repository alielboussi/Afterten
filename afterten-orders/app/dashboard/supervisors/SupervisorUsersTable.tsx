"use client";

import { useMemo, useState } from "react";
import type { ListedSupervisor } from "@/lib/portal/supervisors-list-cache";
import { DeleteAuthUserButton } from "../DeleteAuthUserButton";
import { SupervisorAliasField, SupervisorApprovalControl } from "./SupervisorsTable";
import styles from "../admins/admins.module.css";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function SupervisorUsersTable({ supervisors }: { supervisors: ListedSupervisor[] }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const visible = useMemo(
    () => supervisors.filter((s) => !hiddenIds.has(s.userId)),
    [supervisors, hiddenIds],
  );

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Alias</th>
            <th>First sign-in</th>
            <th>Last sign-in</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <tr key={s.userId}>
              <td className={styles.emailCell}>{s.email}</td>
              <td>
                <SupervisorAliasField userId={s.userId} initialAlias={s.alias} />
              </td>
              <td className={styles.dateCell}>{formatDate(s.createdAt)}</td>
              <td className={styles.dateCell}>{formatDate(s.lastSignIn)}</td>
              <td>
                <div className={styles.actionCell}>
                  <SupervisorApprovalControl userId={s.userId} approved={s.approved} />
                  {s.approved ? (
                    <span className={styles.inlineOk}>Approved {formatDate(s.approvedAt)}</span>
                  ) : (
                    <span className={styles.pendingHint}>Pending approval</span>
                  )}
                  <DeleteAuthUserButton
                    userId={s.userId}
                    email={s.email}
                    onDeleted={() =>
                      setHiddenIds((prev) => {
                        const next = new Set(prev);
                        next.add(s.userId);
                        return next;
                      })
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
