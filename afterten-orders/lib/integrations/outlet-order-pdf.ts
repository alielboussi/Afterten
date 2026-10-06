import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOGO_PATH = resolveLogoPath();

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

async function loadLogoPng(): Promise<Buffer | null> {
  try {
    if (!existsSync(LOGO_PATH)) return null;
    return await sharp(LOGO_PATH).png().resize(120, 120, { fit: "inside" }).toBuffer();
  } catch {
    return null;
  }
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** 2 mm in PDF points (72 pt / inch, 25.4 mm / inch). */
const BORDER_PT = (2 * 72) / 25.4;
const PAD = 28;
const CONTENT_LEFT = PAD + BORDER_PT;
const CONTENT_RIGHT = PAGE_W - PAD - BORDER_PT;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
/** Product / qty column split — keep a gap so long names never overlap qty. */
const PDF_PRODUCT_COL_W = CONTENT_WIDTH * 0.46;
const PDF_COL_QTY_X = CONTENT_LEFT + CONTENT_WIDTH * 0.5;
const PDF_COL_UOM_X = CONTENT_LEFT + CONTENT_WIDTH * 0.62;
const PDF_COL_AMT_X = CONTENT_LEFT + CONTENT_WIDTH * 0.78;
const FOOTER_Y = PAGE_H - PAD - 14;
const RED = "#DC2626";

export type OrderPdfLine = {
  name: string;
  qty: string;
  uom: string;
  amount: string;
  isSub: boolean;
};

export type OrderPdfInput = {
  outletName: string;
  outletId: string;
  orderNumber: string;
  placedAtLabel: string;
  employeeName: string;
  grandTotalFormatted: string;
  lines: OrderPdfLine[];
  signaturePng: Buffer | null;
};

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function buildOrderPdfFileName(
  outletName: string,
  orderNumber: string,
  createdAt: Date,
): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lusaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(createdAt);
  const outletPart = sanitizeFilePart(outletName) || "Outlet";
  const orderPart = sanitizeFilePart(orderNumber) || "order";
  return `${outletPart}_${orderPart}_${date}.pdf`;
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

function drawPageNumbers(doc: InstanceType<typeof PDFDocument>) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    drawPageBorder(doc);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#57534e")
      .text(`Page ${i + 1} of ${total}`, CONTENT_LEFT, FOOTER_Y, {
        width: CONTENT_WIDTH,
        align: "center",
      });
  }
}

function drawTableHeader(doc: InstanceType<typeof PDFDocument>, y: number): number {
  const colProduct = CONTENT_LEFT;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#57534e");
  doc.text("PRODUCT", colProduct, y, { width: PDF_PRODUCT_COL_W });
  doc.text("QTY", PDF_COL_QTY_X, y, { width: CONTENT_WIDTH * 0.1, align: "center" });
  doc.text("UOM", PDF_COL_UOM_X, y, { width: CONTENT_WIDTH * 0.12, align: "center" });
  doc.text("AMOUNT", PDF_COL_AMT_X, y, { width: CONTENT_WIDTH * 0.2, align: "right" });
  return y + 16;
}

function contentBottomLimit(): number {
  return FOOTER_Y - 12;
}

export async function renderOutletOrderPdf(input: OrderPdfInput): Promise<Buffer> {
  const logoBuf = await loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (logoBuf) {
      doc.image(logoBuf, CONTENT_LEFT, PAD + BORDER_PT, { width: 72 });
    }

    const headerY = logoBuf ? PAD + BORDER_PT + 4 : PAD + BORDER_PT + 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a");
    const headerLines = [
      input.outletName,
      `Outlet code: ${input.outletId}`,
      `Order no.: ${input.orderNumber}`,
      input.placedAtLabel,
    ];
    let hy = headerY;
    for (const line of headerLines) {
      doc.text(line, CONTENT_LEFT, hy, { width: CONTENT_WIDTH, align: "center" });
      hy += 14;
    }

    let y = Math.max(hy + 8, PAD + BORDER_PT + 78);
    y = drawTableHeader(doc, y);

    const rowHeight = 14;
    const signatureBlockHeight = 132;

    const ensureSpace = (needed: number, repeatHeader: boolean) => {
      if (y + needed <= contentBottomLimit()) return;
      doc.addPage();
      y = PAD + BORDER_PT + 8;
      if (repeatHeader) {
        y = drawTableHeader(doc, y);
      }
    };

    doc.font("Helvetica").fontSize(9).fillColor("#292524");
    for (const line of input.lines) {
      ensureSpace(rowHeight + 4, true);
      const colProduct = CONTENT_LEFT + (line.isSub ? 8 : 0);

      doc.font(line.isSub ? "Helvetica" : "Helvetica-Bold");
      doc.text(line.name, colProduct, y, { width: PDF_PRODUCT_COL_W - (line.isSub ? 8 : 0) });
      doc.text(line.qty, PDF_COL_QTY_X, y, { width: CONTENT_WIDTH * 0.1, align: "center" });
      doc.text(line.uom, PDF_COL_UOM_X, y, { width: CONTENT_WIDTH * 0.12, align: "center" });
      doc.text(line.amount, PDF_COL_AMT_X, y, { width: CONTENT_WIDTH * 0.2, align: "right" });
      y += rowHeight;
    }

    ensureSpace(22, false);
    y += 4;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#292524");
    doc.text("Total", PDF_COL_QTY_X, y);
    doc.fillColor(RED).text(input.grandTotalFormatted, PDF_COL_AMT_X, y, {
      width: CONTENT_WIDTH * 0.2,
      align: "right",
    });
    y += 22;

    ensureSpace(signatureBlockHeight, false);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#292524");
    doc.text("Order Placed By", CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 18;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#292524");
    doc.text(input.employeeName, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 24;

    const boxX = CONTENT_LEFT + CONTENT_WIDTH * 0.12;
    const boxW = CONTENT_WIDTH * 0.76;
    const boxH = 72;
    doc.lineWidth(1).strokeColor("#d6d3d1").rect(boxX, y, boxW, boxH).stroke();

    if (input.signaturePng && input.signaturePng.length > 0) {
      doc.image(input.signaturePng, boxX + 6, y + 4, {
        fit: [boxW - 12, boxH - 8],
        align: "center",
        valign: "center",
      });
    }

    drawPageNumbers(doc);
    doc.end();
  });
}

export type CombinedOrderPdfInput = {
  outletName: string;
  outletId: string;
  orderNumber: string;
  placedAtLabel: string;
  acceptedAtLabel: string;
  loadedAtLabel: string;
  completedAtLabel: string;
  employeeName: string;
  supervisorAlias: string;
  driverName: string;
  offloaderName: string;
  grandTotalFormatted: string;
  lines: OrderPdfLine[];
  employeeSignaturePng: Buffer | null;
  driverSignaturePng: Buffer | null;
  offloaderSignaturePng: Buffer | null;
};

const LEGAL_DISCLAIMER =
  "The above names and signatories show above, approve and witness that all information included in this document is accurate and liable for legal use.";

function drawSignatureBlock(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  sectionTitle: string,
  whenLabel: string,
  signerLabel: string,
  signerName: string,
  signaturePng: Buffer | null,
): number {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#292524");
  doc.text(sectionTitle, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y += 16;
  if (whenLabel) {
    doc.font("Helvetica").fontSize(10).fillColor("#57534e");
    doc.text(whenLabel, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 14;
  }
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#57534e");
  doc.text(signerLabel, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y += 14;
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#292524");
  doc.text(signerName, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y += 22;

  const boxX = CONTENT_LEFT + CONTENT_WIDTH * 0.12;
  const boxW = CONTENT_WIDTH * 0.76;
  const boxH = 72;
  doc.lineWidth(1).strokeColor("#d6d3d1").rect(boxX, y, boxW, boxH).stroke();
  if (signaturePng && signaturePng.length > 0) {
    doc.image(signaturePng, boxX + 6, y + 4, {
      fit: [boxW - 12, boxH - 8],
      align: "center",
      valign: "center",
    });
  }
  return y + boxH + 20;
}

export async function renderCombinedOrderPdf(input: CombinedOrderPdfInput): Promise<Buffer> {
  const logoBuf = await loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ensureSpace = (y: number, needed: number, repeatHeader: boolean): number => {
      if (y + needed <= contentBottomLimit()) return y;
      doc.addPage();
      let ny = PAD + BORDER_PT + 8;
      if (repeatHeader) {
        ny = drawTableHeader(doc, ny);
      }
      return ny;
    };

    if (logoBuf) {
      doc.image(logoBuf, CONTENT_LEFT, PAD + BORDER_PT, { width: 72 });
    }

    const headerY = logoBuf ? PAD + BORDER_PT + 4 : PAD + BORDER_PT + 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a");
    const headerLines = [
      input.outletName,
      `Outlet code: ${input.outletId}`,
      `Order no.: ${input.orderNumber}`,
      input.placedAtLabel,
    ];
    let y = headerY;
    for (const line of headerLines) {
      doc.text(line, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
      y += 14;
    }

    y = Math.max(y + 8, PAD + BORDER_PT + 78);
    y = drawTableHeader(doc, y);

    const rowHeight = 14;
    doc.font("Helvetica").fontSize(9).fillColor("#292524");
    for (const line of input.lines) {
      y = ensureSpace(y, rowHeight + 4, true);
      const colProduct = CONTENT_LEFT + (line.isSub ? 8 : 0);
      doc.font(line.isSub ? "Helvetica" : "Helvetica-Bold");
      doc.text(line.name, colProduct, y, { width: PDF_PRODUCT_COL_W - (line.isSub ? 8 : 0) });
      doc.text(line.qty, PDF_COL_QTY_X, y, { width: CONTENT_WIDTH * 0.1, align: "center" });
      doc.text(line.uom, PDF_COL_UOM_X, y, { width: CONTENT_WIDTH * 0.12, align: "center" });
      doc.text(line.amount, PDF_COL_AMT_X, y, { width: CONTENT_WIDTH * 0.2, align: "right" });
      y += rowHeight;
    }

    y = ensureSpace(y, 22, false);
    y += 4;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#292524");
    doc.text("Total", PDF_COL_QTY_X, y);
    doc.fillColor(RED).text(input.grandTotalFormatted, PDF_COL_AMT_X, y, {
      width: CONTENT_WIDTH * 0.2,
      align: "right",
    });
    y += 28;

    y = ensureSpace(y, 160, false);
    y = drawSignatureBlock(
      doc,
      y,
      "Order placed",
      "",
      "Order placed by",
      input.employeeName,
      input.employeeSignaturePng,
    );

    y = ensureSpace(y, 120, false);
    y = drawSignatureBlock(
      doc,
      y,
      "Supervisor acceptance",
      input.acceptedAtLabel,
      "Accepted by",
      input.supervisorAlias,
      null,
    );

    y = ensureSpace(y, 160, false);
    y = drawSignatureBlock(
      doc,
      y,
      "Dispatch",
      input.loadedAtLabel,
      "Driver",
      input.driverName,
      input.driverSignaturePng,
    );

    y = ensureSpace(y, 160, false);
    y = drawSignatureBlock(
      doc,
      y,
      "Received at outlet",
      input.completedAtLabel,
      "Received by",
      input.offloaderName,
      input.offloaderSignaturePng,
    );

    y = ensureSpace(y, 80, false);
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#292524");
    doc.text(LEGAL_DISCLAIMER, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });

    drawPageNumbers(doc);
    doc.end();
  });
}

async function loadAutoAddedProductIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data: rules, error: rulesErr } = await admin
    .from("product_order_rules")
    .select("id")
    .eq("active", true);
  if (rulesErr || !rules?.length) return new Set();

  const ruleIds = rules.map((r) => r.id as string);
  const { data: adds, error: addsErr } = await admin
    .from("product_order_rule_additions")
    .select("added_product_id")
    .in("rule_id", ruleIds);
  if (addsErr || !adds?.length) return new Set();

  return new Set(adds.map((a) => String(a.added_product_id ?? "").toLowerCase()).filter(Boolean));
}

async function loadDriverSignaturePng(
  admin: SupabaseClient,
  signaturePath: string | null,
): Promise<Buffer | null> {
  if (!signaturePath?.trim()) return null;
  try {
    const normalized = signaturePath.trim().replace(/^driver-signatures\//, "");
    const { data, error } = await admin.storage.from("driver-signatures").download(normalized);
    if (error || !data) return null;
    const raw = Buffer.from(await data.arrayBuffer());
    return sharp(raw).png().toBuffer();
  } catch {
    return null;
  }
}

export async function loadSignaturePng(
  admin: SupabaseClient,
  signaturePath: string | null,
): Promise<Buffer | null> {
  if (!signaturePath?.trim()) return null;
  try {
    const normalized = signaturePath.trim().replace(/^signatures\//, "");
    const { data, error } = await admin.storage.from("signatures").download(normalized);
    if (error || !data) return null;
    const raw = Buffer.from(await data.arrayBuffer());
    return sharp(raw).png().toBuffer();
  } catch {
    return null;
  }
}

export async function generateAndStoreOutletOrderPdf(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, outlet_id, outlet_name, order_number, employee_name, employee_signature_path, grand_total, created_at, pdf_path",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };

  const existingPath =
    typeof order.pdf_path === "string" && order.pdf_path.trim() ? order.pdf_path.trim() : null;
  if (existingPath) {
    const existingKey = existingPath.replace(/^order-pdfs\//, "");
    const { data: existingFile, error: existingErr } = await admin.storage
      .from("order-pdfs")
      .download(existingKey);
    if (!existingErr && existingFile) {
      const fileName = existingKey.split("/").pop() ?? "order.pdf";
      return { ok: true, pdfPath: existingPath, fileName };
    }
  }

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("name, qty, uom, line_total, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (itemsErr) return { ok: false, error: itemsErr.message };

  const placedAtLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(order.created_at as string));

  const grandTotal = Number(order.grand_total ?? 0);
  const grandFormatted = formatKwacha(grandTotal);

  const lines: OrderPdfLine[] = (items ?? []).map((row) => {
    const qty = Number(row.qty ?? 0);
    const lt = Number(row.line_total ?? 0);
    return {
      name: String(row.name ?? ""),
      qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
      uom: String(row.uom ?? ""),
      amount: lt > 0 ? formatKwacha(lt) : "",
      isSub: false,
    };
  });

  const signaturePng = await loadSignaturePng(
    admin,
    order.employee_signature_path as string | null,
  );

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `${placedAtLabel} (Kitwe)`,
      employeeName: String(order.employee_name ?? "").trim() || "—",
      grandTotalFormatted: grandFormatted,
      lines,
      signaturePng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return { ok: false, error: msg };
  }

  const fileName = buildOrderPdfFileName(
    String(order.outlet_name),
    String(order.order_number),
    new Date(order.created_at as string),
  );
  const storageKey = `${order.outlet_id}/${order.id}/${fileName}`;
  const pdfPath = `order-pdfs/${storageKey}`;

  const { error: uploadErr } = await admin.storage.from("order-pdfs").upload(storageKey, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
    cacheControl: "3600",
  });
  if (uploadErr) {
    return {
      ok: false,
      error: `Storage upload failed: ${uploadErr.message}. Check order-pdfs bucket and SUPABASE_SERVICE_ROLE_KEY on the portal.`,
    };
  }

  const { data: storedFile, error: verifyErr } = await admin.storage
    .from("order-pdfs")
    .download(storageKey);
  if (verifyErr || !storedFile) {
    return {
      ok: false,
      error: verifyErr?.message ?? "PDF was not found in storage after upload.",
    };
  }

  const { error: updateErr } = await admin
    .from("outlet_orders")
    .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, pdfPath, fileName };
}

export async function generateAndStoreApprovedOrderPdf(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, outlet_id, outlet_name, order_number, employee_name, employee_signature_path, grand_total, created_at, status, approved_pdf_path",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (!["accepted", "loaded", "completed"].includes(String(order.status))) {
    return { ok: false, error: "Order is not supervisor-approved yet." };
  }

  const existingPath =
    typeof order.approved_pdf_path === "string" && order.approved_pdf_path.trim()
      ? order.approved_pdf_path.trim()
      : null;
  if (existingPath) {
    const existingKey = existingPath.replace(/^approved-orders\//, "");
    const { data: existingFile, error: existingErr } = await admin.storage
      .from("approved-orders")
      .download(existingKey);
    if (!existingErr && existingFile) {
      const fileName = existingKey.split("/").pop() ?? "order.pdf";
      return { ok: true, pdfPath: existingPath, fileName };
    }
  }

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, line_total, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (itemsErr) return { ok: false, error: itemsErr.message };

  const autoAddedIds = await loadAutoAddedProductIds(admin);

  const placedAtLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(order.created_at as string));

  const grandTotal = Number(order.grand_total ?? 0);
  const grandFormatted = formatKwacha(grandTotal);

  const lines: OrderPdfLine[] = (items ?? []).map((row) => {
    const qty = Number(row.qty ?? 0);
    const lt = Number(row.line_total ?? 0);
    const pid = String(row.product_id ?? "").toLowerCase();
    return {
      name: String(row.name ?? ""),
      qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
      uom: String(row.uom ?? ""),
      amount: lt > 0 ? formatKwacha(lt) : "",
      isSub: autoAddedIds.has(pid),
    };
  });

  const signaturePng = await loadSignaturePng(
    admin,
    order.employee_signature_path as string | null,
  );

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `${placedAtLabel} (Kitwe)`,
      employeeName: String(order.employee_name ?? "").trim() || "—",
      grandTotalFormatted: grandFormatted,
      lines,
      signaturePng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return { ok: false, error: msg };
  }

  const fileName = buildOrderPdfFileName(
    String(order.outlet_name),
    String(order.order_number),
    new Date(order.created_at as string),
  );
  const storageKey = `${order.outlet_id}/${order.id}/${fileName}`;
  const pdfPath = `approved-orders/${storageKey}`;

  const { error: uploadErr } = await admin.storage
    .from("approved-orders")
    .upload(storageKey, new Uint8Array(pdfBuffer), {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return {
      ok: false,
      error: `Storage upload failed: ${uploadErr.message}. Check approved-orders bucket.`,
    };
  }

  const { error: updateErr } = await admin
    .from("outlet_orders")
    .update({ approved_pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, pdfPath, fileName };
}

export async function generateAndStoreDriverHandoffPdf(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, outlet_id, outlet_name, order_number, employee_name, driver_id, driver_signature_path, loaded_at, created_at, status, handoff_pdf_path",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (!["loaded", "completed"].includes(String(order.status))) {
    return { ok: false, error: "Order is not loaded yet." };
  }

  const existingPath =
    typeof order.handoff_pdf_path === "string" && order.handoff_pdf_path.trim()
      ? order.handoff_pdf_path.trim()
      : null;
  if (existingPath) {
    const existingKey = existingPath.replace(/^driver-handoffs\//, "");
    const { data: existingFile, error: existingErr } = await admin.storage
      .from("driver-handoffs")
      .download(existingKey);
    if (!existingErr && existingFile) {
      const fileName = existingKey.split("/").pop() ?? "handoff.pdf";
      return { ok: true, pdfPath: existingPath, fileName };
    }
  }

  const { data: driver } = await admin
    .from("delivery_drivers")
    .select("name")
    .eq("id", order.driver_id as string)
    .maybeSingle();

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (itemsErr) return { ok: false, error: itemsErr.message };

  const autoAddedIds = await loadAutoAddedProductIds(admin);
  const loadedLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date((order.loaded_at as string) ?? (order.created_at as string)));

  const lines: OrderPdfLine[] = (items ?? []).map((row) => {
    const qty = Number(row.qty ?? 0);
    const pid = String(row.product_id ?? "").toLowerCase();
    return {
      name: String(row.name ?? ""),
      qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
      uom: String(row.uom ?? ""),
      amount: "",
      isSub: autoAddedIds.has(pid),
    };
  });

  const signaturePng = await loadDriverSignaturePng(
    admin,
    order.driver_signature_path as string | null,
  );

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `Loaded ${loadedLabel} (Kitwe)`,
      employeeName: String(driver?.name ?? "Driver"),
      grandTotalFormatted: "—",
      lines,
      signaturePng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return { ok: false, error: msg };
  }

  const fileName = buildOrderPdfFileName(
    String(order.outlet_name),
    `${String(order.order_number)}_handoff`,
    new Date((order.loaded_at as string) ?? (order.created_at as string)),
  );
  const storageKey = `${order.outlet_id}/${order.id}/${fileName}`;
  const pdfPath = `driver-handoffs/${storageKey}`;

  const { error: uploadErr } = await admin.storage
    .from("driver-handoffs")
    .upload(storageKey, new Uint8Array(pdfBuffer), {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}.` };
  }

  const { error: updateErr } = await admin
    .from("outlet_orders")
    .update({ handoff_pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, pdfPath, fileName };
}

function formatKitwePdfLabel(iso: string | null | undefined, prefix?: string): string {
  if (!iso) return "—";
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lusaka",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return prefix ? `${prefix} ${label} (Kitwe)` : `${label} (Kitwe)`;
}

export async function generateAndStoreCompletedOrderPdf(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ ok: true; pdfPath: string; fileName: string } | { ok: false; error: string }> {
  const { data: order, error: orderErr } = await admin
    .from("outlet_orders")
    .select(
      "id, outlet_id, outlet_name, order_number, employee_name, employee_signature_path, grand_total, created_at, status, supervisor_accepted_at, supervisor_accepted_alias, loaded_at, driver_id, driver_signature_path, completed_at, offloader_name, offloader_signature_path, completed_pdf_path",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (String(order.status) !== "completed") {
    return { ok: false, error: "Order is not completed yet." };
  }

  const existingPath =
    typeof order.completed_pdf_path === "string" && order.completed_pdf_path.trim()
      ? order.completed_pdf_path.trim()
      : null;
  if (existingPath) {
    const existingKey = existingPath.replace(/^completed-orders\//, "");
    const { data: existingFile, error: existingErr } = await admin.storage
      .from("completed-orders")
      .download(existingKey);
    if (!existingErr && existingFile) {
      const fileName = existingKey.split("/").pop() ?? "order.pdf";
      return { ok: true, pdfPath: existingPath, fileName };
    }
  }

  const { data: driver } = await admin
    .from("delivery_drivers")
    .select("name")
    .eq("id", order.driver_id as string)
    .maybeSingle();

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, line_total, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (itemsErr) return { ok: false, error: itemsErr.message };

  const autoAddedIds = await loadAutoAddedProductIds(admin);
  const grandTotal = Number(order.grand_total ?? 0);

  const lines: OrderPdfLine[] = (items ?? []).map((row) => {
    const qty = Number(row.qty ?? 0);
    const lt = Number(row.line_total ?? 0);
    const pid = String(row.product_id ?? "").toLowerCase();
    return {
      name: String(row.name ?? ""),
      qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
      uom: String(row.uom ?? ""),
      amount: lt > 0 ? formatKwacha(lt) : "",
      isSub: autoAddedIds.has(pid),
    };
  });

  const [employeeSignaturePng, driverSignaturePng, offloaderSignaturePng] = await Promise.all([
    loadSignaturePng(admin, order.employee_signature_path as string | null),
    loadDriverSignaturePng(admin, order.driver_signature_path as string | null),
    loadSignaturePng(admin, order.offloader_signature_path as string | null),
  ]);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderCombinedOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: formatKitwePdfLabel(order.created_at as string),
      acceptedAtLabel: formatKitwePdfLabel(order.supervisor_accepted_at as string, "Accepted"),
      loadedAtLabel: formatKitwePdfLabel(
        (order.loaded_at as string) ?? (order.created_at as string),
        "Dispatched",
      ),
      completedAtLabel: formatKitwePdfLabel(order.completed_at as string, "Completed"),
      employeeName: String(order.employee_name ?? "").trim() || "—",
      supervisorAlias: String(order.supervisor_accepted_alias ?? "").trim() || "Supervisor",
      driverName: String(driver?.name ?? "Driver"),
      offloaderName: String(order.offloader_name ?? "").trim() || "—",
      grandTotalFormatted: formatKwacha(grandTotal),
      lines,
      employeeSignaturePng,
      driverSignaturePng,
      offloaderSignaturePng,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF render failed.";
    return { ok: false, error: msg };
  }

  const fileName = buildOrderPdfFileName(
    String(order.outlet_name),
    `${String(order.order_number)}_completed`,
    new Date((order.completed_at as string) ?? (order.created_at as string)),
  );
  const storageKey = `${order.outlet_id}/${order.id}/${fileName}`;
  const pdfPath = `completed-orders/${storageKey}`;

  const { error: uploadErr } = await admin.storage
    .from("completed-orders")
    .upload(storageKey, new Uint8Array(pdfBuffer), {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadErr) {
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}.` };
  }

  const { error: updateErr } = await admin
    .from("outlet_orders")
    .update({ completed_pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, pdfPath, fileName };
}

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}
