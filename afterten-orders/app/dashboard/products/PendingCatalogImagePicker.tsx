"use client";

import { useRef } from "react";
import styles from "./product-styles";

type Props = {
  subjectName: string;
  file: File | null;
  previewUrl: string | null;
  onPick: (file: File, previewUrl: string) => void;
  onClear: () => void;
  uploadHint?: string;
};

export function PendingCatalogImagePicker({
  subjectName,
  file,
  previewUrl,
  onPick,
  onClear,
  uploadHint = "Uploads when you save.",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    onPick(picked, URL.createObjectURL(picked));
  }

  return (
    <div className={styles.variantFormImageRow}>
      <button
        type="button"
        className={styles.variantThumbBtn}
        title={`Choose photo for ${subjectName || "item"}`}
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className={styles.variantThumbImg} />
        ) : (
          <span className={styles.variantThumbPlaceholder}>Click to add image</span>
        )}
      </button>
      <div className={styles.variantFormImageActions}>
        <button type="button" className={styles.secondaryBtn} onClick={() => inputRef.current?.click()}>
          {file ? "Change image" : "Choose image"}
        </button>
        {file ? (
          <button type="button" className={styles.cancelBtn} onClick={onClear}>
            Remove
          </button>
        ) : null}
        <span className={styles.formHint} style={{ textAlign: "left", margin: 0 }}>
          {uploadHint}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={styles.hiddenFile}
        onChange={(e) => onFileChange(e)}
      />
    </div>
  );
}
