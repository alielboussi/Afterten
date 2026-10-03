"use client";

import { useEffect, useRef, useState } from "react";
import { clearVariantImage, uploadVariantImage } from "./variant-actions";
import { prepareCatalogImageFile } from "./prepare-catalog-image";
import styles from "./product-styles";

type Props = {
  variantRowId: string;
  parentProductId: string;
  variantId: string;
  variantName: string;
  imageUrl: string | null;
  compact?: boolean;
  onUploaded?: (imageUrl: string) => void;
  onRemoved?: () => void;
};

export function VariantImageUpload({
  variantRowId,
  parentProductId,
  variantId,
  variantName,
  imageUrl,
  compact = false,
  onUploaded,
  onRemoved,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(imageUrl);
  }, [imageUrl]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPending(true);
    setError(null);

    let uploadFile = file;
    try {
      uploadFile = await prepareCatalogImageFile(file);
    } catch {
      uploadFile = file;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    const result = await uploadVariantImage(variantRowId, parentProductId, variantId, formData);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(result.imageUrl);
    onUploaded?.(result.imageUrl);
  }

  async function onRemoveImage() {
    if (!preview || pending) return;
    if (!confirm(`Remove photo for ${variantName}?`)) return;

    setPending(true);
    setError(null);
    const result = await clearVariantImage(variantRowId);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(null);
    onRemoved?.();
  }

  const thumb = (
    <button
      type="button"
      className={`${styles.variantThumbBtn}${compact ? ` ${styles.variantThumbBtnCompact}` : ""}`}
      disabled={pending}
      title={`Upload photo for ${variantName}`}
      onClick={() => inputRef.current?.click()}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className={styles.variantThumbImg} />
      ) : (
        <span className={compact ? styles.variantThumbPlaceholderCompact : styles.variantThumbPlaceholder}>
          {pending ? "…" : "Photo"}
        </span>
      )}
    </button>
  );

  if (compact) {
    return (
      <div className={`${styles.variantThumbWrap} ${styles.variantThumbWrapCompact}`}>
        {thumb}
        {preview ? (
          <button
            type="button"
            className={styles.variantImageRemoveBtn}
            disabled={pending}
            onClick={() => void onRemoveImage()}
          >
            Remove
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className={styles.hiddenFile}
          onChange={(e) => void onFileChange(e)}
        />
        {error ? <span className={styles.thumbErr}>{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={styles.variantFormImageRow}>
      <div className={styles.variantThumbWrap}>{thumb}</div>
      <div className={styles.variantFormImageActions}>
        <button type="button" className={styles.secondaryBtn} onClick={() => inputRef.current?.click()}>
          {preview ? "Change image" : "Choose image"}
        </button>
        {preview ? (
          <button type="button" className={styles.cancelBtn} disabled={pending} onClick={() => void onRemoveImage()}>
            Remove image
          </button>
        ) : null}
        <span className={styles.formHint} style={{ textAlign: "left", margin: 0 }}>
          Tall product photos work best. We trim empty margins on upload.
        </span>
        {error ? <span className={styles.thumbErr}>{error}</span> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={styles.hiddenFile}
        onChange={(e) => void onFileChange(e)}
      />
    </div>
  );
}
