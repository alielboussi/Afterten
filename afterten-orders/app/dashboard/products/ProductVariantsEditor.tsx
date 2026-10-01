"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteProductVariant,
  listProductVariants,
  saveProductVariant,
  setProductHasVariants,
  type ProductVariantInput,
} from "./variant-actions";
import styles from "./product-styles";

type VariantRow = {
  id: string;
  variant_id: string;
  name: string;
  uom: string;
  unit_cost: number;
  image_url: string | null;
  sort_order: number;
  qty_step: number;
  min_order_qty: number | null;
  max_order_qty: number | null;
  active: boolean;
  live_qty_gate_enabled: boolean;
};

type Props = {
  productDbId: string;
  parentProductId: string;
  hasVariants: boolean;
};

function emptyDraft(): ProductVariantInput {
  return {
    variantId: "",
    name: "",
    uom: "pc",
    unitCost: 0,
    imageUrl: "",
    sortOrder: 0,
    qtyStep: 1,
    minOrderQty: "",
    maxOrderQty: "",
    active: true,
    liveQtyGateEnabled: false,
  };
}

export function ProductVariantsEditor({ productDbId, parentProductId, hasVariants: initialHasVariants }: Props) {
  const [hasVariants, setHasVariants] = useState(initialHasVariants);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [draft, setDraft] = useState<ProductVariantInput>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listProductVariants(parentProductId);
    if (result.ok) {
      setRows(result.rows as VariantRow[]);
    } else {
      setMessage(result.error);
    }
  }, [parentProductId]);

  useEffect(() => {
    setHasVariants(initialHasVariants);
  }, [initialHasVariants]);

  useEffect(() => {
    if (!hasVariants) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await listProductVariants(parentProductId);
      if (cancelled) return;
      if (result.ok) {
        setRows(result.rows as VariantRow[]);
      } else {
        setMessage(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasVariants, parentProductId]);

  async function onToggleHasVariants(checked: boolean) {
    setBusy(true);
    setMessage(null);
    const result = await setProductHasVariants(productDbId, parentProductId, checked);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setHasVariants(checked);
    if (!checked) setRows([]);
  }

  function startEdit(row: VariantRow) {
    setEditingId(row.id);
    setDraft({
      id: row.id,
      variantId: row.variant_id,
      name: row.name,
      uom: row.uom,
      unitCost: Number(row.unit_cost),
      imageUrl: row.image_url ?? "",
      sortOrder: row.sort_order,
      qtyStep: Number(row.qty_step),
      minOrderQty: row.min_order_qty != null ? String(row.min_order_qty) : "",
      maxOrderQty: row.max_order_qty != null ? String(row.max_order_qty) : "",
      active: row.active,
      liveQtyGateEnabled: row.live_qty_gate_enabled,
    });
  }

  async function onSaveVariant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await saveProductVariant(parentProductId, draft);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setDraft(emptyDraft());
    setEditingId(null);
    setHasVariants(true);
    await load();
  }

  async function onDelete(rowId: string) {
    if (!confirm("Delete this variant?")) return;
    setBusy(true);
    const result = await deleteProductVariant(rowId, parentProductId);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    await load();
    if (editingId === rowId) {
      setEditingId(null);
      setDraft(emptyDraft());
    }
  }

  return (
    <section className={styles.variantsSection}>
      <h2 className={styles.variantsTitle}>Variants</h2>
      <p className={styles.formHint}>
        Each variant uses its own inventory <strong>UUID</strong>. Outlets pick a variant in the app; the parent
        product shows without a qty field when variants exist.
      </p>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={hasVariants}
          disabled={busy}
          onChange={(e) => void onToggleHasVariants(e.target.checked)}
        />
        This product has variants
      </label>

      {hasVariants ? (
        <>
          <ul className={styles.variantList}>
            {rows.map((row) => (
              <li key={row.id} className={styles.variantListItem}>
                <div>
                  <strong>{row.name}</strong>
                  <span className={styles.variantMeta}>
                    {row.variant_id.slice(0, 8)}… · {row.uom} · K{Number(row.unit_cost).toFixed(2)}
                  </span>
                </div>
                <div className={styles.variantListActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => startEdit(row)}>
                    Edit
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={() => void onDelete(row.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <form className={styles.variantForm} onSubmit={(e) => void onSaveVariant(e)}>
            <h3 className={styles.variantsSubTitle}>{editingId ? "Edit variant" : "Add variant"}</h3>
            <label className={styles.label}>
              Variant UUID (inventory API)
              <input
                className={styles.input}
                value={draft.variantId}
                onChange={(e) => setDraft((d) => ({ ...d, variantId: e.target.value }))}
                required
                readOnly={Boolean(editingId)}
                placeholder="Separate UUID per variant"
              />
            </label>
            <label className={styles.label}>
              Name
              <input
                className={styles.input}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </label>
            <div className={styles.twoCol}>
              <label className={styles.label}>
                UOM
                <input
                  className={styles.input}
                  value={draft.uom}
                  onChange={(e) => setDraft((d) => ({ ...d, uom: e.target.value }))}
                  required
                />
              </label>
              <label className={styles.label}>
                Price (K)
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.unitCost}
                  onChange={(e) => setDraft((d) => ({ ...d, unitCost: Number(e.target.value) }))}
                  required
                />
              </label>
            </div>
            <label className={styles.label}>
              Image URL (optional)
              <input
                className={styles.input}
                type="url"
                value={draft.imageUrl}
                onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
              />
            </label>
            <div className={styles.twoCol}>
              <label className={styles.label}>
                Sort
                <input
                  className={styles.input}
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
                />
              </label>
              <label className={styles.label}>
                +/- By
                <input
                  className={styles.input}
                  type="number"
                  min={0.001}
                  step="any"
                  value={draft.qtyStep}
                  onChange={(e) => setDraft((d) => ({ ...d, qtyStep: Number(e.target.value) || 1 }))}
                />
              </label>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              />
              Active
            </label>
            <button type="submit" className={styles.submitBtn} disabled={busy}>
              {busy ? "Saving…" : editingId ? "Update variant" : "Add variant"}
            </button>
            {editingId ? (
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </form>
        </>
      ) : null}

      {message ? (
        <p className={styles.msgErr} role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
