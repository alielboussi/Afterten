"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveOutletProductAllowlist } from "./product-actions";
import styles from "./outlet-users.module.css";

export type ProductPickRow = {
  productId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string | null;
};

type Props = {
  outletId: string;
  outletLabel: string;
  products: ProductPickRow[];
  /** When false, UI treats all products as selected (default “show all”). */
  usesCustomAllowlist: boolean;
  initialAllowedProductIds: string[];
  returnPath: string;
};

export function OutletProductPicker({
  outletId,
  outletLabel,
  products,
  usesCustomAllowlist,
  initialAllowedProductIds,
  returnPath,
}: Props) {
  const router = useRouter();
  const allIds = useMemo(() => products.map((p) => p.productId), [products]);

  const initialSelected = useMemo(() => {
    if (!usesCustomAllowlist) return new Set(allIds);
    return new Set(initialAllowedProductIds);
  }, [usesCustomAllowlist, initialAllowedProductIds, allIds]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allIds));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await saveOutletProductAllowlist(outletId, [...selected]);
    setBusy(false);
    if (!result.ok) {
      setMessage({ type: "err", text: result.error });
      return;
    }
    setMessage({
      type: "ok",
      text:
        result.mode === "all"
          ? "All products will show in the outlet app."
          : result.mode === "none"
            ? "No products will show until you allow at least one."
            : "Custom product list saved for this outlet.",
    });
    router.refresh();
  }

  return (
    <form className={styles.productPicker} onSubmit={onSave}>
      <p className="at-form-hint">
        Choose which catalog items <strong>{outletLabel}</strong> ({outletId}) can see in the Expo app.
        By default all products show until you save a custom list. Use <strong>Select all</strong> to restore
        the full catalog.
      </p>

      <div className={styles.pickerToolbar}>
        <button type="button" className="at-form-toolbarBtn" onClick={selectAll}>
          Select all
        </button>
        <button type="button" className="at-form-toolbarBtn" onClick={selectNone}>
          Clear all
        </button>
        <span className={styles.pickerCount}>
          {selected.size} / {products.length} selected
        </span>
      </div>

      {products.length === 0 ? (
        <p className={styles.muted}>No products in catalog yet. Add products first.</p>
      ) : (
        <ul className={styles.productPickList}>
          {products.map((p) => {
            const on = selected.has(p.productId);
            return (
              <li key={p.productId}>
                <label className={styles.productPickRow}>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.productId)} />
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className={styles.pickThumb} />
                  ) : (
                    <span className={styles.pickThumbPlaceholder} />
                  )}
                  <span className={styles.pickBody}>
                    <span className={styles.pickName}>{p.name}</span>
                    <span className={styles.pickMeta}>
                      {p.productId} · {p.uom} · K{p.unitCost.toFixed(2)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {message ? (
        <p className={message.type === "ok" ? "at-form-msgOk" : "at-form-msgErr"} role="alert">
          {message.text}
        </p>
      ) : null}

      <div className="at-form-actions">
        <button type="button" className="at-form-cancelBtn" onClick={() => router.push(returnPath)}>
          Back
        </button>
        <button type="submit" className="at-form-submitBtn" disabled={busy || products.length === 0}>
          {busy ? "Saving…" : "Save product access"}
        </button>
      </div>
    </form>
  );
}
