"use client";

import { useState } from "react";
import { grantPortalAdmin } from "./actions";
import styles from "./admins.module.css";

export function MakeAdminButton({
  userId,
  email,
  isAdmin,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (isAdmin) {
    return <span className={styles.badgeAdmin}>Portal admin</span>;
  }

  async function onClick() {
    setPending(true);
    setMessage(null);
    const result = await grantPortalAdmin(userId, email);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage("Granted — they can open the dashboard after signing in again.");
  }

  return (
    <div className={styles.actionCell}>
      <button type="button" className={styles.makeAdminBtn} disabled={pending} onClick={onClick}>
        {pending ? "Saving…" : "Make admin"}
      </button>
      {message && <span className={styles.inlineOk}>{message}</span>}
    </div>
  );
}
