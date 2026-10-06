"use client";

import { useState } from "react";
import { sendDailyPickSummaryFromPortal } from "./actions";

export function DailyPickSendButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSend() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendDailyPickSummaryFromPortal();
      if (!result.ok) {
        setFeedback({
          ok: false,
          text: result.error ?? "Could not send daily pick summary.",
        });
        return;
      }
      setFeedback({
        ok: true,
        text: `Daily pick sent (${result.orderCount} order${result.orderCount === 1 ? "" : "s"}).`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="at-dailyPickSendWrap">
      <button
        type="button"
        className="at-btnSecondary at-btnCompact"
        disabled={busy}
        onClick={() => void onSend()}
      >
        {busy ? "Sending…" : "Test daily pick WhatsApp"}
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
