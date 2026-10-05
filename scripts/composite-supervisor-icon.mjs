/**
 * Composite supervisor app icon — crown above clock, inset for Android adaptive safe zone.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const baseIcon = path.join(repoRoot, "afterten-orders/mobile/assets/icon.png");
const crownSrc = path.join(repoRoot, "afterten-orders/supervisor-mobile/assets/crown-source.png");

const outDir = path.join(repoRoot, "afterten-orders/supervisor-mobile/assets");
const previewOut = path.join(outDir, "icon-preview.png");

const SIZE = 1024;
/** Inset so foreground is not clipped by Android adaptive icon mask. */
const CANVAS_INSET = 88;
const CROWN_MAX_WIDTH = 188;
const CROWN_LEFT_OFFSET = -22;
const MIN_GAP_ABOVE_LOGO = 12;
/** Top red frame band height on source icon (1024px), scaled with inner canvas. */
const RED_FRAME_BAND_RATIO = 36 / 1024;
/** Clear space between crown and inner edge of top red frame band. */
const GAP_BELOW_RED_FRAME = 20;
/** First row of clock ornament on base icon (1024px). */
const CLOCK_TOP_RATIO = 218 / 1024;

async function buildIcon() {
  const inner = SIZE - CANVAS_INSET * 2;
  const baseScaled = await sharp(baseIcon).resize(inner, inner, { fit: "fill" }).png().toBuffer();

  const canvas = sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const baseLayer = await canvas
    .composite([{ input: baseScaled, left: CANVAS_INSET, top: CANVAS_INSET }])
    .png()
    .toBuffer();

  const crownBuf = await sharp(crownSrc)
    .trim({ threshold: 12 })
    .resize(CROWN_MAX_WIDTH, CROWN_MAX_WIDTH, { fit: "inside" })
    .png()
    .toBuffer();

  const crownMeta = await sharp(crownBuf).metadata();
  const cw = crownMeta.width ?? CROWN_MAX_WIDTH;
  const ch = crownMeta.height ?? CROWN_MAX_WIDTH;

  const clockTopOnCanvas = CANVAS_INSET + Math.round(CLOCK_TOP_RATIO * inner);
  const redFrameBand = Math.round(RED_FRAME_BAND_RATIO * inner);
  const minTop = CANVAS_INSET + redFrameBand + GAP_BELOW_RED_FRAME;
  const maxTop = clockTopOnCanvas - MIN_GAP_ABOVE_LOGO - ch;
  if (minTop > maxTop) {
    throw new Error("Crown overlaps clock; reduce CROWN_MAX_WIDTH or inset.");
  }
  const top = minTop;
  const left = Math.round((SIZE - cw) / 2) + CROWN_LEFT_OFFSET;

  const composed = await sharp(baseLayer)
    .composite([{ input: crownBuf, left, top }])
    .png()
    .toBuffer();

  await sharp(composed).toFile(previewOut);
  console.log("Preview written:", previewOut, { left, top, cw, ch, inner });

  if (process.argv.includes("--apply")) {
    const iconOut = path.join(outDir, "icon.png");
    const androidOut = path.join(outDir, "android-icon-foreground.png");
    await sharp(composed).toFile(iconOut);
    await sharp(composed).toFile(androidOut);
    console.log("Applied:", iconOut, androidOut);
  }
}

await buildIcon();
