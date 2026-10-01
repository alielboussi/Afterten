"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOutletUser, updateOutletUser } from "./actions";
import { deriveOutletCredentials } from "@/lib/portal/outlet-identifiers";

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

  function applyAliasFields(nextAlias: string) {
    setAlias(nextAlias);
    if (!nextAlias.trim()) return;
    const { outletId: nextId, email: nextEmail } = deriveOutletCredentials(nextAlias);
    setOutletId(nextId);
    setEmail(nextEmail);
    if (!isEdit) setOutletName(nextAlias.trim());
  }

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
    <form className="at-form" onSubmit={onSubmit}>
      {mode === "create" && (
        <p className="at-form-hint">
          Outlet ID is the first 4 characters of the alias; email is{" "}
          <strong>xxxx@ordersapp.com</strong> (same 4 characters, lowercase).
        </p>
      )}

      <div className="at-form-grid">
        <label className="at-form-label at-form-span-2">
          Outlet
          {outlets.length > 0 ? (
            <select
              className="at-form-select"
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
            <span className="at-form-hint" style={{ textAlign: "left" }}>
              Enter outlet ID and name below.
            </span>
          )}
        </label>

        <label className="at-form-label">
          Outlet ID
          <input
            className="at-form-input"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="RIVE"
            maxLength={4}
            required
            readOnly={!isEdit}
          />
        </label>
        <label className="at-form-label">
          Outlet name
          <input
            className="at-form-input"
            value={outletName}
            onChange={(e) =>
              isEdit ? setOutletName(e.target.value) : applyAliasFields(e.target.value)
            }
            placeholder="Riverside"
            required
          />
        </label>

        <label className="at-form-label at-form-span-2">
          Email (login)
          <input
            className="at-form-input"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            readOnly={!isEdit}
            required
          />
        </label>

        <label className="at-form-label">
          {isEdit ? "New password (optional)" : "Password"}
          <input
            className="at-form-input"
            type="password"
            autoComplete={isEdit ? "new-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={isEdit ? undefined : 6}
            required={!isEdit}
            placeholder={isEdit ? "Leave blank to keep current" : undefined}
          />
        </label>
        <label className="at-form-label">
          Alias (shown in app)
          <input
            className="at-form-input"
            value={alias}
            onChange={(e) => applyAliasFields(e.target.value)}
            maxLength={48}
            placeholder="Riverside"
            required
          />
        </label>
      </div>

      {isEdit && (
        <label className="at-form-checkRow">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Account active (can sign in to Expo app)
        </label>
      )}

      {message && (
        <p className={message.type === "ok" ? "at-form-msgOk" : "at-form-msgErr"} role="alert">
          {message.text}
        </p>
      )}

      <div className="at-form-actions">
        <button type="button" className="at-form-cancelBtn" onClick={() => router.push(returnPath)}>
          Cancel
        </button>
        <button type="submit" className="at-form-submitBtn" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create outlet user"}
        </button>
      </div>
    </form>
  );
}
