"use client";

import { useState, useTransition } from "react";
import { createSupervisor } from "./actions";

export function AddSupervisorForm() {
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createSupervisor({ email, alias });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail("");
      setAlias("");
      setSuccess("Supervisor added. They sign in with Google on the Supervisor app, then you approve access.");
    });
  }

  return (
    <form className="at-form-section" onSubmit={onSubmit}>
      <div className="at-driverAddRow">
        <label className="at-form-label at-driverAddField">
          Google email
          <input
            className="at-form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@gmail.com"
            disabled={pending}
            autoComplete="off"
          />
        </label>
        <label className="at-form-label at-driverAddField">
          Alias (optional)
          <input
            className="at-form-input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. JM"
            disabled={pending}
            autoComplete="off"
            maxLength={48}
          />
        </label>
        <button
          type="submit"
          className="at-form-submitBtn"
          disabled={pending || !email.trim().includes("@")}
        >
          {pending ? "Adding…" : "Add supervisor"}
        </button>
      </div>
      <p className="at-page-lead" style={{ marginTop: 8, marginBottom: 0 }}>
        Use the same email they will use for <strong>Continue with Google</strong> in the Supervisor app.
        Set alias and tap <strong>Approve supervisor</strong> in the table when ready.
      </p>
      {error ? <p className="at-page-msgErr">{error}</p> : null}
      {success ? <p className="at-page-msgOk">{success}</p> : null}
    </form>
  );
}
