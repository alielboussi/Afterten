"use client";

import { useState, useTransition } from "react";
import { addDeliveryDriver } from "./actions";

export function AddDriverForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addDeliveryDriver(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
      <label style={{ flex: "1 1 220px" }}>
        <span className="at-fieldLabel">Driver name</span>
        <input
          className="at-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John Banda"
          disabled={pending}
        />
      </label>
      <button type="submit" className="at-btnPrimary" disabled={pending || name.trim().length < 2}>
        {pending ? "Adding…" : "Add driver"}
      </button>
      {error ? <p className="at-page-msgErr" style={{ width: "100%" }}>{error}</p> : null}
    </form>
  );
}
