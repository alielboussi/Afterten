import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOGO_PATH = resolveLogoPath();
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BORDER_PT = (2 * 72) / 25.4;
const PAD = 28;
const CONTENT_LEFT = PAD + BORDER_PT;
const CONTENT_WIDTH = PAGE_W - 2 * (PAD + BORDER_PT);
const RED = "#DC2626";
const LOGO_SIZE = 56;

function resolveLogoPath(): string {
  const fromModule = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../assets/afterten-logo.png",
  );
  if (existsSync(fromModule)) return fromModule;
  const fromCwd = path.join(process.cwd(), "lib", "assets", "afterten-logo.png");
  if (existsSync(fromCwd)) return fromCwd;
  return fromModule;
}

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** OutletName_EmployeeName_YYYY-MM-DD_HH-mm-ss_Return.pdf (Kitwe). */
export function buildReturnPdfFileName(
  outletName: string,
  employeeName: string,
  createdAt: Date,
): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lusaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(createdAt);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(createdAt)
    .replace(/:/g, "-")
    .replace(/\s/g, "");
  const outletPart = sanitizeFilePart(outletName) || "Outlet";
  const employeePart = sanitizeFilePart(employeeName) || "Employee";
  return `${outletPart}_${employeePart}_${date}_${time}_Return.pdf`;
}

async function loadReturnsBucketImage(
  admin: SupabaseClient,
  dbPath: string | null,
): Promise<Buffer | null> {
  if (!dbPath?.trim()) return null;
  try {
    const normalized = dbPath.trim().replace(/^returns\//, "");
    const { data, error } = await admin.storage.from("returns").download(normalized);
    if (error || !data) return null;
    const raw = Buffer.from(await data.arrayBuffer());
    return sharp(raw).png().toBuffer();
  } catch {
    return null;
  }
}

function drawPageBorder(doc: InstanceType<typeof PDFDocument>) {
  doc
    .save()
    .lineWidth(BORDER_PT)
    .strokeColor(RED)
    .rect(BORDER_PT / 2, BORDER_PT / 2, PAGE_W - BORDER_PT, PAGE_H - BORDER_PT)
    .stroke()
    .restore();
}

async function renderReturnPdf(input: {
  logoBuf: Buffer | null;
  outletName: string;
  outletId: string;
  returnNumber: string;
  submittedAtLabel: string;
  employeeName: string;
  photoPng: Buffer | null;
  signaturePng: Buffer | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPageBorder(doc);

    let y = PAD + BORDER_PT + 8;
    if (input.logoBuf) {
      doc.image(input.logoBuf, (PAGE_W - LOGO_SIZE) / 2, y, { width: LOGO_SIZE, height: LOGO_SIZE });
      y += LOGO_SIZE + 12;
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#1e3a8a");
    doc.text("Product Return", CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 22;

    doc.font("Helvetica").fontSize(11).fillColor("#292524");
    const lines = [
      input.outletName,
      `Outlet code: ${input.outletId}`,
      `Return no.: ${input.returnNumber}`,
      input.submittedAtLabel,
      `Submitted by: ${input.employeeName}`,
    ];
    for (const line of lines) {
      doc.text(line, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
      y += 14;
    }
    y += 10;

    doc.font("Helvetica-Bold").fontSize(12).text("Return photo", CONTENT_LEFT, y);
    y += 16;
    if (input.photoPng && input.photoPng.length > 0) {
      const maxH = 280;
      doc.image(input.photoPng, CONTENT_LEFT, y, {
        fit: [CONTENT_WIDTH, maxH],
        align: "center",
        valign: "center",
      });
      y += maxH + 16;
    } else {
      doc.font("Helvetica").fontSize(10).fillColor("#78716c");
      doc.text("Photo unavailable.", CONTENT_LEFT, y);
      y += 24;
    }

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#292524");
    doc.text(`Signature — ${input.employeeName}`, CONTENT_LEFT, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    y += 18;
    const sigW = Math.min(260, CONTENT_WIDTH);
    const sigX = CONTENT_LEFT + (CONTENT_WIDTH - sigW) / 2;
    if (input.signaturePng && input.signaturePng.length > 0) {
      doc.image(input.signaturePng, sigX, y, { fit: [sigW, 72], align: "center", valign: "center" });
    }

    doc.end();
  });
}

export async function generateAndStoreOutletReturnPdf(
  admin: SupabaseClient,
  returnId: string,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  const { data: row, error: rowErr } = await admin
    .from("outlet_returns")
    .select(
      "id, outlet_id, outlet_name, return_number, employee_name, photo_path, employee_signature_path, created_at, pdf_path",
    )
    .eq("id", returnId)
    .maybeSingle();

  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row) return { ok: false, error: "Return not found." };

  const createdAt = new Date(row.created_at as string);
  const submittedAtLabel = `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(createdAt)} (Kitwe)`;

  let logoBuf: Buffer | null = null;
  try {
    if (existsSync(LOGO_PATH)) logoBuf = await sharp(LOGO_PATH).png().toBuffer();
  } catch {
    logoBuf = null;
  }

  const [photoPng, signaturePng] = await Promise.all([
    loadReturnsBucketImage(admin, row.photo_path as string),
    loadReturnsBucketImage(admin, row.employee_signature_path as string),
  ]);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderReturnPdf({
      logoBuf,
      outletName: String(row.outlet_name),
      outletId: String(row.outlet_id),
      returnNumber: String(row.return_number),
      submittedAtLabel,
      employeeName: String(row.employee_name),
      photoPng,
      signaturePng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return { ok: false, error: msg };
  }

  const fileName = buildReturnPdfFileName(
    String(row.outlet_name),
    String(row.employee_name),
    createdAt,
  );
  const storageKey = `${row.outlet_id}/${row.id}/${fileName}`;
  const pdfPath = `returns/${storageKey}`;

  const { error: uploadErr } = await admin.storage.from("returns").upload(storageKey, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "60",
  });
  if (uploadErr) {
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}` };
  }

  const { error: updateErr } = await admin
    .from("outlet_returns")
    .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq("id", returnId);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, pdfPath, fileName };
}
