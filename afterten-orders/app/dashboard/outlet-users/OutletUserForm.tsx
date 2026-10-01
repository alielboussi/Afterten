"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOutletUser, updateOutletUser } from "./actions";
import styles from "@/app/dashboard/outlet-users/outlet-users.module.css";

type OutletOption = { id: string; name: string };

type InitialEdit = {
  userId: string;
  email: string;
  alias: string;
  outletId: string;
  outletName: string;
  active: boolean;
};

type Props =
  | {
      outlets: OutletOption[];
      mode: "create";
      returnPath: string;
      initial?: undefined;
    }
  | {
      outlets: OutletOption[];
      mode: "edit";
      returnPath: string;
      initial: InitialEdit;
    };

export function OutletUserForm(props: Props) {
  const { outlets, mode, returnPath } = props;
  const router = useRouter();
  const isEdit = mode === "edit";

  const [outletId, setOutletId] = useState(
    isEdit ? props.initial.outletId : (outlets[0]?.id ?? ""),
  );
  const [outletName, setOutletName] = useState(
    isEdit ? props.initial.outletName : (outlets[0]?.name ?? ""),
  );
  const [email, setEmail] = useState(isEdit ? props.initial.email : "");
  const [password, setPassword] = useState("");
  const [alias, setAlias] = useState(isEdit ? props.initial.alias : "");
  const [active, setActive] = useState(isEdit ? props.initial.active : true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function onPickOutlet(id: string) {
    setOutletId(id);
    const found = outlets.find((o) => o.id === id);
    if (found) setOutletName(found.name);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    if (isEdit) {
      const result = await updateOutletUser({
        userId: props.initial.userId,
        outletId,
        outletName,
        email,
        alias,
        password,
        active,
      });
      setBusy(false);
      if (!result.ok) {
        setMessage({ type: "err", text: result.error });
        return;
      }
      router.push(returnPath);
      router.refresh();
      return;
    }

    const result = await createOutletUser({
      outletId,
      outletName,
      email,
      password,
      alias,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ type: "err", text: result.error });
      return;
    }
    router.push(returnPath);
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {mode === "create" && (
        <p className={styles.formHint}>
          Creates a Supabase Auth user with <strong>email + password</strong> and an{" "}
          <strong>outlet_app</strong> profile.
        </p>
      )}

      <div className={styles.fieldRow}>
        <label className={styles.label}>
          Outlet
          {outlets.length > 0 ? (
            <select
              className={styles.input}
              value={outletId}
              onChange={(e) => onPickOutlet(e.target.value)}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.muted}>Enter outlet ID and name below.</span>
          )}
        </label>
      </div>

      <div className={styles.twoCol}>
        <label className={styles.label}>
          Outlet ID
          <input
            className={styles.input}
            value={outletId}
            onChange={(e) => setOutletId(e.target.value.toUpperCase())}
            placeholder="BR1"
            required
          />
        </label>
        <label className={styles.label}>
          Outlet name
          <input
            className={styles.input}
            value={outletName}
            onChange={(e) => setOutletName(e.target.value)}
            placeholder="Branch One"
            required
          />
        </label>
      </div>

      <label className={styles.label}>
        Email (login)
        <input
          className={styles.input}
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <div className={styles.twoCol}>
        <label className={styles.label}>
          {isEdit ? "New password (optional)" : "Password"}
          <input
            className={styles.input}
            type="password"
            autoComplete={isEdit ? "new-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={isEdit ? undefined : 8}
            required={!isEdit}
            placeholder={isEdit ? "Leave blank to keep current" : undefined}
          />
        </label>
        <label className={styles.label}>
          Alias (shown in app)
          <input
            className={styles.input}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={48}
            placeholder="e.g. Sam — Branch 1"
            required
          />
        </label>
      </div>

      {isEdit && (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Account active (can sign in to Expo app)
        </label>
      )}

      {message && (
        <p className={message.type === "ok" ? styles.msgOk : styles.msgErr} role="alert">
          {message.text}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={() => router.push(returnPath)}>
          Cancel
        </button>
        <button type="submit" className={styles.submitBtn} disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create outlet user"}
        </button>
      </div>
    </form>
  );
}
