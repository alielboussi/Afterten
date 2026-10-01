import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "afterten-orders", "mobile", "assets");
const logoPath = path.join(assets, "afterten-logo.jpg");

const SIZE = 1024;
const CORNER = 224;
const BORDER = 28;
/** Logo inside white panel (~620px fits ornate clock without clipping on adaptive). */
const LOGO_MAX = 620;

function squircleFrameSvg(opts) {
  const inner = SIZE - BORDER * 2;
  const innerRx = CORNER - BORDER;
  const bg = opts.transparentOutside ? "none" : "#FFFFFF";
  const clip = opts.transparentOutside
    ? `<defs><clipPath id="c"><rect width="${SIZE}" height="${SIZE}" rx="${CORNER}"/></clipPath></defs>
       <g clip-path="url(#c)">`
    : "";
  const clipEnd = opts.transparentOutside ? "</g>" : "";

  return Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      ${clip}
      <rect width="${SIZE}" height="${SIZE}" rx="${CORNER}" fill="#DC2626"/>
      <rect x="${BORDER}" y="${BORDER}" width="${inner}" height="${inner}" rx="${innerRx}" fill="#FFFFFF"/>
      ${clipEnd}
    </svg>`,
  );
}

async function composeIcon(sharp, frameSvg, logoPng) {
  return sharp(frameSvg).composite([{ input: logoPng, gravity: "center" }]).png().toBuffer();
}

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("Install sharp in repo root: npm install sharp --save-dev");
    process.exit(1);
  }

  const logoPng = await sharp(logoPath)
    .resize(LOGO_MAX, LOGO_MAX, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  const opaqueFrame = squircleFrameSvg({ transparentOutside: false });
  const androidFrame = squircleFrameSvg({ transparentOutside: true });

  const iconPng = await composeIcon(sharp, opaqueFrame, logoPng);
  const androidForeground = await composeIcon(sharp, androidFrame, logoPng);

  for (const name of ["icon.png", "splash-icon.png", "favicon.png", "android-icon-monochrome.png"]) {
    writeFileSync(path.join(assets, name), iconPng);
  }

  writeFileSync(path.join(assets, "android-icon-foreground.png"), androidForeground);

  const whiteBg = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  writeFileSync(path.join(assets, "android-icon-background.png"), whiteBg);

  writeFileSync(path.join(assets, "..", "..", "app", "icon.png"), iconPng);

  console.log("Icons: squircle flush to red border; Android foreground with transparent outside corners.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
