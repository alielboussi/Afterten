"use client";

import { useMemo, useState } from "react";
import type { AdminAccessState } from "./AdminAccessControl";
import { AdminAccessControl } from "./AdminAccessControl";
import { AliasField } from "./AliasField";
import styles from "./admins.module.css";

export type AdminTableUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AdminUsersTable({
  users,
  adminAccess,
  aliases,
}: {
  users: AdminTableUser[];
  adminAccess: Record<string, AdminAccessState>;
  aliases: Record<string, string>;
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const visibleUsers = useMemo(
    () => users.filter((u) => !hiddenIds.has(u.id)),
    [users, hiddenIds],
  );

  function hideUser(userId: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Alias</th>
            <th>First signed in</th>
            <th>Last sign-in</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {visibleUsers.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>
                <AliasField userId={u.id} initialAlias={aliases[u.id] ?? ""} />
              </td>
              <td>{formatDate(u.createdAt)}</td>
              <td>{formatDate(u.lastSignIn)}</td>
              <td>
                <AdminAccessControl
                  userId={u.id}
                  email={u.email}
                  access={adminAccess[u.id] ?? "none"}
                  onUserDeleted={() => hideUser(u.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
