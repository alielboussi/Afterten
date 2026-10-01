"use client";

import { useState } from "react";
import { grantPortalAdmin, revokePortalAdmin } from "./actions";
import styles from "./admins.module.css";

export type AdminAccessState = "none" | "active" | "revoked";

export function AdminAccessControl({
  userId,
  email,
  access,
}: {
  userId: string;
  email: string;
  access: AdminAccessState;
}) {
  const [state, setState] = useState(access);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onGrant() {
    setPending(true);
    setMessage(null);
    const result = await grantPortalAdmin(userId, email);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setState("active");
    setMessage("Granted");
    setTimeout(() => setMessage(null), 2500);
  }

  async function onRevoke() {
    if (!window.confirm(`Revoke dashboard access for ${email}?`)) return;
    setPending(true);
    setMessage(null);
    const result = await revokePortalAdmin(userId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setState("revoked");
  }

  if (state === "active") {
    return (
      <div className={styles.actionCell}>
        <button
          type="button"
          className={styles.badgeAdminBtn}
          disabled={pending}
          onClick={() => void onRevoke()}
          title="Click to revoke dashboard access"
        >
          Portal admin
        </button>
        {message && <span className={styles.inlineErr}>{message}</span>}
      </div>
    );
  }

  if (state === "revoked") {
    return (
      <div className={styles.actionCell}>
        <span className={styles.badgeRevoked}>Revoked</span>
        <button type="button" className={styles.makeAdminBtn} disabled={pending} onClick={() => void onGrant()}>
          {pending ? "Saving…" : "Make admin"}
        </button>
        {message && <span className={styles.inlineErr}>{message}</span>}
      </div>
    );
  }

  return (
    <div className={styles.actionCell}>
      <button type="button" className={styles.makeAdminBtn} disabled={pending} onClick={() => void onGrant()}>
        {pending ? "Saving…" : "Make admin"}
      </button>
      {message && <span className={styles.inlineErr}>{message}</span>}
    </div>
  );
}
