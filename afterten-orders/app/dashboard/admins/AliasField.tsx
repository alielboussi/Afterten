"use client";

import { useState } from "react";
import { setPortalUserAlias } from "./actions";
import styles from "./admins.module.css";

export function AliasField({
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
    const result = await setPortalUserAlias(userId, value);
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
        placeholder="Set alias…"
        maxLength={48}
        disabled={pending}
        aria-label="Portal alias"
      />
      {message && (
        <span className={message === "Saved" ? styles.inlineOk : styles.inlineErr} role="status">
          {message}
        </span>
      )}
    </div>
  );
}
