"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteProductVariant,
  listProductVariants,
  saveProductVariant,
  uploadVariantImage,
  type ProductVariantInput,
} from "./variant-actions";
import { prepareCatalogImageFile } from "./prepare-catalog-image";
import { PendingCatalogImagePicker } from "./PendingCatalogImagePicker";
import { VariantImageUpload } from "./VariantImageUpload";
import { VariantSortableList } from "./VariantSortableList";
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

function nextVariantSortOrder(rows: VariantRow[]): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.sort_order)) + 1;
}

function emptyDraft(sortOrder = 1): ProductVariantInput {
  return {
    variantId: "",
    name: "",
    uom: "pc",
    unitCost: 0,
    imageUrl: "",
    sortOrder,
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
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const pendingPreviewRef = useRef<string | null>(null);

  function revokePreviewUrl(url: string | null) {
    if (!url) return;
    window.requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
    });
  }

  function clearPendingImage() {
    revokePreviewUrl(pendingPreviewRef.current);
    pendingPreviewRef.current = null;
    setPendingImageFile(null);
    setPendingImagePreview(null);
  }

  function setPendingImage(file: File, previewUrl: string) {
    revokePreviewUrl(pendingPreviewRef.current);
    pendingPreviewRef.current = previewUrl;
    setPendingImageFile(file);
    setPendingImagePreview(previewUrl);
  }

  useEffect(() => {
    return () => {
      revokePreviewUrl(pendingPreviewRef.current);
      pendingPreviewRef.current = null;
    };
  }, []);

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

  useEffect(() => {
    if (editingId) return;
    const next = nextVariantSortOrder(rows);
    setDraft((d) => (d.sortOrder === next ? d : { ...d, sortOrder: next }));
  }, [rows, editingId]);

  function startEdit(row: VariantRow) {
    clearPendingImage();
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

    if (pendingImageFile && result.id && draft.variantId) {
      const formData = new FormData();
      let uploadFile = pendingImageFile;
      try {
        uploadFile = await prepareCatalogImageFile(pendingImageFile);
      } catch {
        uploadFile = pendingImageFile;
      }
      formData.append("file", uploadFile);
      const upload = await uploadVariantImage(result.id, parentProductId, draft.variantId, formData);
      if (!upload.ok) {
        setMessage(upload.error);
      }
    }

    clearPendingImage();
    setDraft(emptyDraft(nextVariantSortOrder(rows)));
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
      clearPendingImage();
      setDraft(emptyDraft(nextVariantSortOrder(rows)));
    }
  }

  return (
    <section className={styles.variantsSection}>
      <h2 className={styles.variantsTitle}>Variants</h2>
      <p className={styles.formHint}>
        Each variant uses its own inventory <strong>UUID</strong>. Drag the <strong>⋮⋮</strong> handle to
        set order in the outlet app (sort numbers update automatically).
      </p>

      {!hasVariants ? (
        <p className={styles.formHint}>
          Enable <strong>This product has variants</strong> on the product form above and save to add variant lines
          here.
        </p>
      ) : (
        <>
          <VariantSortableList
            parentProductId={parentProductId}
            rows={rows}
            onRowsChange={(next) => setRows(next as VariantRow[])}
            onReload={load}
            onEdit={(row) => {
              const full = rows.find((r) => r.id === row.id);
              if (full) startEdit(full);
            }}
            onDelete={(rowId) => void onDelete(rowId)}
            reorderDisabled={Boolean(editingId) || busy}
            onReorderError={(err) => setMessage(err)}
          />

          <form className={styles.variantForm} onSubmit={(e) => void onSaveVariant(e)}>
            <h3 className={styles.variantsSubTitle}>{editingId ? "Edit variant" : "Add variant"}</h3>
            <label className={styles.label}>
              Variant UUID (inventory API)
              <input
                className={styles.input}
                value={draft.variantId}
                onChange={(e) => setDraft((d) => ({ ...d, variantId: e.target.value.trim() }))}
                required
                placeholder="Separate UUID per variant"
              />
              {editingId ? (
                <span className={styles.formHint} style={{ textAlign: "left", marginTop: 4 }}>
                  Must match inventory API. If you change it, re-upload the variant photo if the image breaks.
                </span>
              ) : null}
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
            <div className={styles.label}>
              Image
              {editingId ? (
                <VariantImageUpload
                  variantRowId={editingId}
                  parentProductId={parentProductId}
                  variantId={draft.variantId}
                  variantName={draft.name || "Variant"}
                  imageUrl={draft.imageUrl || null}
                  onUploaded={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
                  onRemoved={() => setDraft((d) => ({ ...d, imageUrl: "" }))}
                />
              ) : (
                <PendingCatalogImagePicker
                  subjectName={draft.name}
                  file={pendingImageFile}
                  previewUrl={pendingImagePreview}
                  onPick={setPendingImage}
                  onClear={clearPendingImage}
                  uploadHint="Tall product photos work best. We trim empty margins on upload."
                />
              )}
            </div>
            <div className={styles.twoCol}>
              <label className={styles.label}>
                Min order qty (optional)
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.minOrderQty}
                  onChange={(e) => setDraft((d) => ({ ...d, minOrderQty: e.target.value }))}
                />
              </label>
              <label className={styles.label}>
                Max order qty (optional)
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="any"
                  value={draft.maxOrderQty}
                  onChange={(e) => setDraft((d) => ({ ...d, maxOrderQty: e.target.value }))}
                />
              </label>
            </div>
            <div className={styles.twoCol}>
              <label className={styles.label}>
                Variant sort
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sortOrder: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  readOnly={!editingId}
                  title={
                    editingId
                      ? undefined
                      : "Per-product only — not tied to product catalog sort. Next number on this product."
                  }
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
                  clearPendingImage();
                  setDraft(emptyDraft(nextVariantSortOrder(rows)));
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </form>
        </>
      )}

      {message ? (
        <p className={styles.msgErr} role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
