"use client";

import { useState } from "react";
import { approveSupervisor, revokeSupervisorApproval, setSupervisorAlias } from "./actions";
import styles from "../admins/admins.module.css";

export function SupervisorAliasField({
  userId,
  initialAlias,
}: {
  userId: string;
  initialAlias: string;
}) {
  const [value, setValue] = useState(initialAlias);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (value.trim() === initialAlias.trim()) return;
    setPending(true);
    setMessage(null);
    const result = await setSupervisorAlias(userId, value);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setValue(value.trim());
    setMessage("Saved");
    setTimeout(() => setMessage(null), 2000);
  }

  return (
    <div className={styles.aliasCell}>
      <input
        className={styles.aliasInput}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="Supervisor alias…"
        maxLength={48}
        disabled={pending}
        aria-label="Supervisor alias"
      />
      {message && (
        <span className={message === "Saved" ? styles.inlineOk : styles.inlineErr} role="status">
          {message}
        </span>
      )}
    </div>
  );
}

export function SupervisorApprovalControl({
  userId,
  approved,
}: {
  userId: string;
  approved: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (approved && !window.confirm("Revoke supervisor app access for this user?")) return;
    setPending(true);
    setMessage(null);
    const result = approved
      ? await revokeSupervisorApproval(userId)
      : await approveSupervisor(userId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
  }

  return (
    <>
      {approved ? (
        <button
          type="button"
          className={styles.badgeAdminBtn}
          disabled={pending}
          onClick={() => void toggle()}
        >
          Supervisor
        </button>
      ) : (
        <button
          type="button"
          className={styles.makeAdminBtnWide}
          disabled={pending}
          onClick={() => void toggle()}
        >
          Approve supervisor
        </button>
      )}
      {message && (
        <span className={styles.inlineErr} role="status">
          {message}
        </span>
      )}
    </>
  );
}
