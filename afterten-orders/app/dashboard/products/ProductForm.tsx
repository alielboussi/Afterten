"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct, getNextProductSortOrder, updateProduct, uploadProductImage } from "./actions";
import { prepareCatalogImageFile } from "./prepare-catalog-image";
import { PendingCatalogImagePicker } from "./PendingCatalogImagePicker";
import { ProductImageUpload } from "./ProductImageUpload";
import styles from "./product-styles";

type Initial = {
  id: string;
  productId: string;
  name: string;
  uom: string;
  unitCost: number;
  imageUrl: string;
  active: boolean;
  liveQtyGateEnabled: boolean;
  sortOrder: number;
  qtyStep: number;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  hasVariants: boolean;
};

type Props =
  | {
      mode: "create";
      returnPath: string;
      onCreated?: (info: { id: string; productId: string; hasVariants: boolean }) => void;
      initial?: undefined;
    }
  | { mode: "edit"; returnPath: string; initial: Initial; onCreated?: undefined };

export function ProductForm(props: Props) {
  const { mode, returnPath } = props;
  const router = useRouter();
  const isEdit = mode === "edit";

  const [productId, setProductId] = useState(isEdit ? props.initial.productId : "");
  const [name, setName] = useState(isEdit ? props.initial.name : "");
  const [uom, setUom] = useState(isEdit ? props.initial.uom : "pc");
  const [unitCost, setUnitCost] = useState(isEdit ? String(props.initial.unitCost) : "");
  const [imageUrl, setImageUrl] = useState(isEdit ? props.initial.imageUrl : "");
  const [sortOrder, setSortOrder] = useState(isEdit ? String(props.initial.sortOrder) : "0");
  const [qtyStep, setQtyStep] = useState(isEdit ? String(props.initial.qtyStep) : "1");
  const [minOrderQty, setMinOrderQty] = useState(
    isEdit && props.initial.minOrderQty != null ? String(props.initial.minOrderQty) : "",
  );
  const [maxOrderQty, setMaxOrderQty] = useState(
    isEdit && props.initial.maxOrderQty != null ? String(props.initial.maxOrderQty) : "",
  );
  const [active, setActive] = useState(isEdit ? props.initial.active : true);
  const [liveQtyGateEnabled, setLiveQtyGateEnabled] = useState(
    isEdit ? props.initial.liveQtyGateEnabled : false,
  );
  const [hasVariants, setHasVariants] = useState(isEdit ? props.initial.hasVariants : false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const pendingPreviewRef = useRef<string | null>(null);

  function revokePreviewUrl(url: string | null) {
    if (!url) return;
    window.requestAnimationFrame(() => URL.revokeObjectURL(url));
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

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    void (async () => {
      const result = await getNextProductSortOrder();
      if (cancelled || !result.ok) return;
      setSortOrder(String(result.next));
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const payload = {
      productId,
      name,
      uom,
      unitCost: Number(unitCost),
      imageUrl,
      active,
      liveQtyGateEnabled,
      sortOrder: Number(sortOrder) || 0,
      qtyStep: Number(qtyStep) || 1,
      minOrderQty,
      maxOrderQty,
      hasVariants,
    };

    if (Number.isNaN(payload.unitCost)) {
      setBusy(false);
      setMessage("Enter a valid price.");
      return;
    }

    const result = isEdit
      ? await updateProduct(props.initial.id, payload)
      : await createProduct(payload);

    if (!result.ok) {
      setBusy(false);
      setMessage(result.error);
      return;
    }

    if (!isEdit && pendingImageFile && "id" in result && result.id) {
      let uploadFile = pendingImageFile;
      try {
        uploadFile = await prepareCatalogImageFile(pendingImageFile);
      } catch {
        uploadFile = pendingImageFile;
      }
      const formData = new FormData();
      formData.append("file", uploadFile);
      const upload = await uploadProductImage(result.id, formData);
      if (!upload.ok) {
        setMessage(upload.error);
      } else {
        clearPendingImage();
      }
    }

    setBusy(false);
    if (!isEdit && result.ok && "productId" in result && props.onCreated) {
      props.onCreated({
        id: result.id,
        productId: result.productId,
        hasVariants,
      });
      if (hasVariants) return;
    }
    router.push(returnPath);
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <p className={styles.formHint}>
        Use the same <strong>UUID</strong> as the inventory API. Set qty step (e.g. 1 tray at a time), optional
        min/max order qty, and live qty when stock sync is enabled.
      </p>

      <label className={styles.label}>
        Product UUID (inventory API)
        <input
          className={styles.input}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required
          readOnly={isEdit}
          placeholder="c446a48f-7193-44c8-a828-d6888543de6f"
        />
      </label>

      <div className={styles.twoCol}>
        <label className={styles.label}>
          Product sort order
          <input
            className={styles.input}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            readOnly={!isEdit}
            title={
              isEdit ? undefined : "Catalog order only — not affected by variant sort numbers on other products"
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
            value={qtyStep}
            onChange={(e) => setQtyStep(e.target.value)}
            required
          />
        </label>
      </div>

      <label className={styles.label}>
        Name
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <div className={styles.twoCol}>
        <label className={styles.label}>
          UOM
          <input
            className={styles.input}
            value={uom}
            onChange={(e) => setUom(e.target.value)}
            required
            placeholder="Trays, Bags…"
          />
        </label>
        <label className={styles.label}>
          Price (K)
          <input
            className={styles.input}
            type="number"
            min={0}
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            required
          />
        </label>
      </div>

      <div className={styles.twoCol}>
        <label className={styles.label}>
          Min order qty (optional)
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            value={minOrderQty}
            onChange={(e) => setMinOrderQty(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          Max order qty (optional)
          <input
            className={styles.input}
            type="number"
            min={0}
            step="any"
            value={maxOrderQty}
            onChange={(e) => setMaxOrderQty(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.label}>
        Image
        {isEdit ? (
          <ProductImageUpload
            productDbId={props.initial.id}
            imageUrl={imageUrl || null}
            productName={name || "Product"}
            onUploaded={(url) => setImageUrl(url)}
            onRemoved={() => setImageUrl("")}
          />
        ) : (
          <PendingCatalogImagePicker
            subjectName={name || "Product"}
            file={pendingImageFile}
            previewUrl={pendingImagePreview}
            onPick={setPendingImage}
            onClear={clearPendingImage}
            uploadHint="Tall product photos work best. We trim empty margins when you create the product."
          />
        )}
      </div>

      <label className={styles.checkRow}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (visible in outlet app)
      </label>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={liveQtyGateEnabled}
          onChange={(e) => setLiveQtyGateEnabled(e.target.checked)}
        />
        Enable live qty gate (block order when API qty ≤ 0)
      </label>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={hasVariants}
          onChange={(e) => setHasVariants(e.target.checked)}
        />
        This product has variants (outlets pick a variant in the app)
      </label>

      {message ? (
        <p className={styles.msgErr} role="alert">
          {message}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={() => router.push(returnPath)}>
          Cancel
        </button>
        <button type="submit" className={styles.submitBtn} disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save product" : "Create product"}
        </button>
      </div>
    </form>
  );
}
