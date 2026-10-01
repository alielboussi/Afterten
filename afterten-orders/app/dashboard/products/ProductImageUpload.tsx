"use client";

import { useEffect, useRef, useState } from "react";
import { uploadProductImage } from "./actions";
import styles from "./product-styles";

type Props = {
  productDbId: string;
  imageUrl: string | null;
  productName: string;
  /** @deprecated use layout */
  compact?: boolean;
  layout?: "default" | "compact" | "card";
};

export function ProductImageUpload({
  productDbId,
  imageUrl,
  productName,
  compact,
  layout: layoutProp,
}: Props) {
  const layout = layoutProp ?? (compact ? "compact" : "default");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl);

  useEffect(() => {
    setPreview(imageUrl);
  }, [imageUrl]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadProductImage(productDbId, formData);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPreview(result.imageUrl);
  }

  if (layout === "card") {
    return (
      <div className="at-prod-uploadCard">
        <button
          type="button"
          className="at-prod-uploadBtn"
          disabled={pending}
          title={`Upload image for ${productName}`}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="at-prod-thumbImg" />
          ) : (
            <span className="at-prod-thumbPlaceholder">
              {pending ? "…" : "Click to add photo"}
            </span>
          )}
          {pending ? <span className="at-prod-uploadOverlay">Uploading…</span> : null}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="at-prod-hiddenFile"
          onChange={(e) => void onFileChange(e)}
        />
        {error ? <span className="at-form-msgErr">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className={layout === "compact" ? styles.thumbUploadCompact : styles.thumbUploadWrap}>
      <button
        type="button"
        className={styles.thumbUploadBtn}
        disabled={pending}
        title={`Upload image for ${productName}`}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className={styles.thumb} />
        ) : (
          <span className={styles.thumbPlaceholder}>
            {pending ? "…" : layout === "compact" ? "Add" : "Click to add image"}
          </span>
        )}
        {pending ? <span className={styles.thumbOverlay}>Uploading…</span> : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={styles.hiddenFile}
        onChange={(e) => void onFileChange(e)}
      />
      {error && layout !== "compact" ? <span className={styles.thumbErr}>{error}</span> : null}
    </div>
  );
}
