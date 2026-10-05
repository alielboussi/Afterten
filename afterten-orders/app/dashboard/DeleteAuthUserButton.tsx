"use client";

import { useState } from "react";
import { deletePortalAuthUser } from "@/app/dashboard/admins/actions";
import adminStyles from "@/app/dashboard/admins/admins.module.css";

export function DeleteAuthUserButton({
  userId,
  email,
  onDeleted,
}: {
  userId: string;
  email: string;
  onDeleted?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      `Permanently delete ${email} from Supabase Auth?\n\nThis removes all portal, outlet, and supervisor access.`,
    );
    if (!ok) return;

    setPending(true);
    setMessage(null);
    const result = await deletePortalAuthUser(userId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    onDeleted?.();
  }

  return (
    <div className={adminStyles.deleteInAction}>
      <button
        type="button"
        className={adminStyles.deleteUserBtn}
        disabled={pending}
        onClick={() => void onDelete()}
      >
        {pending ? "Deleting…" : "Delete user"}
      </button>
      {message ? <span className={adminStyles.inlineErr}>{message}</span> : null}
    </div>
  );
}
