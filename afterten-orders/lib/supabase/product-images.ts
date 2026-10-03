export const PRODUCT_IMAGES_BUCKET = "product-images";

export function productImageStoragePath(productUuid: string, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  return `${productUuid.toLowerCase()}/cover.${safeExt}`;
}

export function variantImageStoragePath(parentProductUuid: string, variantUuid: string, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  return `${parentProductUuid.toLowerCase()}/variants/${variantUuid.toLowerCase()}/cover.${safeExt}`;
}

export function publicProductImageUrl(supabaseUrl: string, storagePath: string) {
  const base = supabaseUrl.replace(/\/$/, "");
  const encoded = storagePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}
