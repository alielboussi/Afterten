"use client";

import { useState } from "react";
import { purgeAllOutletOrdersFromPortal } from "./actions";

const CONFIRM_PHRASE = "DELETE ALL ORDERS";

export function DeleteAllOrdersButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPurge() {
    const ok = window.confirm(
      "Permanently delete ALL outlet orders, PDFs, and signatures, and reset order numbers to start at 1?\n\nThis cannot be undone.",
    );
    if (!ok) return;

    const typed = window.prompt(`Type ${CONFIRM_PHRASE} to confirm:`);
    if (typed !== CONFIRM_PHRASE) {
      setFeedback({ ok: false, text: "Cancelled — confirmation phrase did not match." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await purgeAllOutletOrdersFromPortal(CONFIRM_PHRASE);
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error });
        return;
      }
      let text = `Deleted ${result.deletedOrders} order(s). Order numbering reset to 1.`;
      if (result.removedStorageObjects > 0) {
        text += ` Removed ${result.removedStorageObjects} storage file(s).`;
      }
      if (result.storageWarnings) {
        text += ` Warning: ${result.storageWarnings}`;
      }
      setFeedback({ ok: true, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="at-purgeOrdersWrap">
      <button
        type="button"
        className="at-form-dangerBtn at-btnCompact"
        disabled={busy}
        onClick={() => void onPurge()}
      >
        {busy ? "Deleting…" : "Delete all orders (fresh start)"}
      </button>
      {feedback ? (
        <p
          className={feedback.ok ? "at-dailyPickSendOk" : "at-dailyPickSendErr"}
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
