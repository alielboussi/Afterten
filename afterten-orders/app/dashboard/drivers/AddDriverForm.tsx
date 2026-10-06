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
    <form className="at-form-section" onSubmit={onSubmit}>
      <div className="at-driverAddRow">
        <label className="at-form-label at-driverAddField">
          Driver name
          <input
            className="at-form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Banda"
            disabled={pending}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="at-form-submitBtn"
          disabled={pending || name.trim().length < 2}
        >
          {pending ? "Adding…" : "Add driver"}
        </button>
      </div>
      {error ? <p className="at-page-msgErr">{error}</p> : null}
    </form>
  );
}
