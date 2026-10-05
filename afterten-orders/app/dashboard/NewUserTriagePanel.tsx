"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { UncategorizedUser } from "@/lib/portal/uncategorized-users";
import {
  triageAssignPortalAdmin,
  triageAssignSupervisor,
  triageRemoveAuthUser,
} from "./user-triage-actions";
import styles from "./dashboard-triage.module.css";

type Props = {
  users: UncategorizedUser[];
};

export function NewUserTriagePanel({ users }: Props) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => users.filter((u) => !hiddenIds.has(u.id)),
    [users, hiddenIds],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (dismissed || visible.length === 0) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dismissed, visible.length]);

  if (!mounted || dismissed || visible.length === 0) return null;

  function hideUser(userId: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  }

  async function runAction(
    userId: string,
    email: string,
    action: "admin" | "supervisor" | "delete",
  ) {
    setPendingId(userId);
    setError(null);
    const result =
      action === "admin"
        ? await triageAssignPortalAdmin(userId, email)
        : action === "supervisor"
          ? await triageAssignSupervisor(userId, email)
          : await triageRemoveAuthUser(userId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    hideUser(userId);
    if (visible.length <= 1) {
      setDismissed(true);
    }
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-labelledby="triage-title" aria-modal="true">
      <div className={styles.backdrop} aria-hidden onClick={() => setDismissed(true)} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 id="triage-title" className={styles.title}>
            New sign-ins need a role
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setDismissed(true)}
            aria-label="Dismiss for now"
          >
            ×
          </button>
        </div>
        <p className={styles.lead}>
          These Google accounts signed in but are not portal admins, outlet users, or supervisors yet.
          Choose where each person belongs.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <ul className={styles.list}>
          {visible.map((u) => (
            <li key={u.id} className={styles.row}>
              <div className={styles.emailBlock}>
                <strong>{u.email}</strong>
                {u.lastSignIn ? (
                  <span className={styles.meta}>Last sign-in {new Date(u.lastSignIn).toLocaleString()}</span>
                ) : null}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnAdmin}
                  disabled={pendingId === u.id}
                  onClick={() => void runAction(u.id, u.email, "admin")}
                >
                  Portal admin
                </button>
                <button
                  type="button"
                  className={styles.btnSupervisor}
                  disabled={pendingId === u.id}
                  onClick={() => void runAction(u.id, u.email, "supervisor")}
                >
                  Supervisor
                </button>
                <Link
                  href="/dashboard/outlet-users/new"
                  className={styles.btnOutlet}
                  onClick={() => hideUser(u.id)}
                >
                  Outlet user
                </Link>
                <button
                  type="button"
                  className={styles.btnDelete}
                  disabled={pendingId === u.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${u.email} from Supabase Auth? They can sign in again later if needed.`,
                      )
                    ) {
                      void runAction(u.id, u.email, "delete");
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>
          Outlet staff are created under <strong>Outlet Users → Create new</strong> (alias-based email +
          password, not Google).
        </p>
      </div>
    </div>,
    document.body,
  );
}
