/** Client-side crop of empty margins (white / transparent) before catalog upload. */

const WHITE_THRESHOLD = 248;
const ALPHA_THRESHOLD = 12;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image."));
    img.src = url;
  });
}

function findContentBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < ALPHA_THRESHOLD) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return null;
  return { left, top, right, bottom };
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, type: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not process image."));
          return;
        }
        const base = name.replace(/\.[^.]+$/, "") || "photo";
        resolve(new File([blob], `${base}.webp`, { type, lastModified: Date.now() }));
      },
      type,
      0.92,
    );
  });
}

/**
 * Trims white/transparent margins and scales so the long edge is at least `minLongEdge` px (max 1200).
 */
export async function prepareCatalogImageFile(file: File, minLongEdge = 512): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 2 || h < 2) return file;

    const stage = document.createElement("canvas");
    stage.width = w;
    stage.height = h;
    const stageCtx = stage.getContext("2d");
    if (!stageCtx) return file;
    stageCtx.drawImage(img, 0, 0);

    const bounds = findContentBounds(stageCtx, w, h);
    if (!bounds) return file;

    const pad = Math.max(2, Math.round(Math.max(w, h) * 0.02));
    const cropLeft = Math.max(0, bounds.left - pad);
    const cropTop = Math.max(0, bounds.top - pad);
    const cropRight = Math.min(w - 1, bounds.right + pad);
    const cropBottom = Math.min(h - 1, bounds.bottom + pad);
    const cropW = cropRight - cropLeft + 1;
    const cropH = cropBottom - cropTop + 1;

    if (cropW < 4 || cropH < 4) return file;

    const longEdge = Math.max(cropW, cropH);
    let outW = cropW;
    let outH = cropH;
    if (longEdge < minLongEdge) {
      const scale = minLongEdge / longEdge;
      outW = Math.round(cropW * scale);
      outH = Math.round(cropH * scale);
    } else if (longEdge > 1200) {
      const scale = 1200 / longEdge;
      outW = Math.round(cropW * scale);
      outH = Math.round(cropH * scale);
    }

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return file;
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, outW, outH);
    outCtx.drawImage(stage, cropLeft, cropTop, cropW, cropH, 0, 0, outW, outH);

    const mime = file.type === "image/png" ? "image/png" : "image/webp";
    return await canvasToFile(out, file.name, mime);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
