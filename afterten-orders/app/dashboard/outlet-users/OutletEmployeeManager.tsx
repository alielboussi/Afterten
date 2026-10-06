"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createOutletEmployee,
  deleteOutletEmployee,
  type OutletEmployeeRow,
  updateOutletEmployee,
} from "./employee-actions";
import styles from "./outlet-users.module.css";

function PasscodeCell({ passcode }: { passcode: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.passwordCell}>
      <span className={styles.passwordValue}>{show ? passcode : "••••••"}</span>
      <button
        type="button"
        className={styles.passwordToggle}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide passcode" : "Show passcode"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

type Props = {
  outletId: string;
  staffUserId: string;
  outletLabel: string;
  initialEmployees: OutletEmployeeRow[];
  returnPath: string;
};

export function OutletEmployeeManager({
  outletId,
  staffUserId,
  outletLabel,
  initialEmployees,
  returnPath,
}: Props) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [newName, setNewName] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  const activeCount = useMemo(() => employees.filter((e) => e.active).length, [employees]);

  function refreshList() {
    router.refresh();
  }

  return (
    <div className={styles.form}>
      <p className={styles.formHint}>
        Employees listed here appear in the outlet order app. Each person needs a passcode to place
        orders for {outletLabel} ({outletId}). Active: {activeCount}.
      </p>

      {message ? <p className={styles.msgOk}>{message}</p> : null}
      {error ? <p className={styles.msgErr}>{error}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Passcode</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.muted}>
                  No employees yet. Add one below.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <EmployeeRow
                  key={emp.id}
                  employee={emp}
                  outletId={outletId}
                  staffUserId={staffUserId}
                  disabled={pending}
                  onChanged={(next) => {
                    setEmployees((prev) => prev.map((e) => (e.id === next.id ? next : e)));
                    setMessage("Employee updated.");
                    setError(null);
                    refreshList();
                  }}
                  onDeleted={() => {
                    setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
                    setMessage("Employee removed.");
                    setError(null);
                    refreshList();
                  }}
                  onError={(msg) => {
                    setError(msg);
                    setMessage(null);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className={styles.fieldRow} style={{ fontSize: "1rem", fontWeight: 700, marginTop: 8 }}>
        Add employee
      </h2>
      <div className={styles.twoCol}>
        <label className={styles.label}>
          Full name
          <input
            className={styles.input}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <label className={styles.label}>
          Passcode (min 4)
          <input
            className={styles.input}
            value={newPasscode}
            onChange={(e) => setNewPasscode(e.target.value)}
            autoComplete="new-password"
            disabled={pending}
          />
        </label>
      </div>
      <button
        type="button"
        className={styles.submitBtn}
        disabled={pending}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await createOutletEmployee({
              outletId,
              staffUserId,
              displayName: newName,
              passcode: newPasscode,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setNewName("");
            setNewPasscode("");
            setMessage("Employee added.");
            refreshList();
          });
        }}
      >
        Add employee
      </button>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={() => router.push(returnPath)}>
          Done
        </button>
      </div>
    </div>
  );
}

function EmployeeRow({
  employee,
  outletId,
  staffUserId,
  disabled,
  onChanged,
  onDeleted,
  onError,
}: {
  employee: OutletEmployeeRow;
  outletId: string;
  staffUserId: string;
  disabled: boolean;
  onChanged: (next: OutletEmployeeRow) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(employee.displayName);
  const [passcode, setPasscode] = useState("");
  const [active, setActive] = useState(employee.active);
  const [pending, startTransition] = useTransition();

  return (
    <tr>
      <td>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled || pending}
        />
      </td>
      <td>
        <PasscodeCell passcode={employee.passcodePlain} />
        <input
          className={styles.input}
          style={{ marginTop: 8 }}
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="New passcode (optional)"
          autoComplete="new-password"
          disabled={disabled || pending}
        />
      </td>
      <td>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={disabled || pending}
          />
          {active ? "Active" : "Disabled"}
        </label>
      </td>
      <td>
        <div className={styles.actionCell}>
          <button
            type="button"
            className={styles.editBtn}
            disabled={disabled || pending}
            onClick={() => {
              startTransition(async () => {
                const result = await updateOutletEmployee({
                  employeeId: employee.id,
                  outletId,
                  staffUserId,
                  displayName: name,
                  passcode: passcode.trim() ? passcode : null,
                  active,
                });
                if (!result.ok) {
                  onError(result.error);
                  return;
                }
                onChanged({
                  ...employee,
                  displayName: name.trim(),
                  active,
                  passcodePlain: passcode.trim() ? passcode.trim() : employee.passcodePlain,
                });
                setPasscode("");
              });
            }}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.editBtn}
            disabled={disabled || pending}
            onClick={() => {
              if (!window.confirm(`Remove ${employee.displayName}?`)) return;
              startTransition(async () => {
                const result = await deleteOutletEmployee({
                  employeeId: employee.id,
                  outletId,
                  staffUserId,
                });
                if (!result.ok) {
                  onError(result.error);
                  return;
                }
                onDeleted();
              });
            }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
