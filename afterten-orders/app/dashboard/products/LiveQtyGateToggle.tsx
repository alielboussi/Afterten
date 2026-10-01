"use client";

import { useState } from "react";
import { setProductLiveQtyGate } from "./actions";

export function LiveQtyGateToggle({
  productId,
  initialEnabled,
}: {
  productId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle() {
    const next = !enabled;
    setPending(true);
    setError(null);
    const result = await setProductLiveQtyGate(productId, next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnabled(next);
  }

  return (
    <div className="at-liveQty-wrap">
      <button
        type="button"
        className={`at-liveQty-toggle ${enabled ? "at-liveQty-toggleOn" : ""}`}
        disabled={pending}
        onClick={() => void onToggle()}
        aria-pressed={enabled}
        title={
          enabled
            ? "Live qty gate on — orders blocked when API qty ≤ 0"
            : "Live qty gate off — testing mode"
        }
      >
        <span className="at-liveQty-knob" />
      </button>
      <span className="at-liveQty-label">{enabled ? "Live qty on" : "Live qty off"}</span>
      {error ? <span className="at-form-msgErr">{error}</span> : null}
    </div>
  );
}
