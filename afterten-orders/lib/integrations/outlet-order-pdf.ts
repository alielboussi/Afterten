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

const LOGO_SIZE = 56;

function drawDocumentHeader(
  doc: InstanceType<typeof PDFDocument>,
  logoBuf: Buffer | null,
  headerLines: string[],
): number {
  let y = PAD + BORDER_PT + 6;

  if (logoBuf) {
    doc.image(logoBuf, (PAGE_W - LOGO_SIZE) / 2, y, { width: LOGO_SIZE, height: LOGO_SIZE });
    y += LOGO_SIZE + 10;
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a8a");
  for (const line of headerLines) {
    doc.text(line, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 14;
  }

  return y + 10;
}

function drawSignatureSection(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  captionLine: string,
  signaturePng: Buffer | null,
  whenLabel?: string,
): number {
  if (whenLabel?.trim()) {
    doc.font("Helvetica").fontSize(10).fillColor("#57534e");
    doc.text(whenLabel.trim(), CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
    y += 14;
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#292524");
  doc.text(captionLine, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y += 22;

  const boxW = 220;
  const boxH = 52;
  const boxX = CONTENT_LEFT + (CONTENT_WIDTH - boxW) / 2;

  if (signaturePng && signaturePng.length > 0) {
    doc.lineWidth(1).strokeColor("#d6d3d1").rect(boxX, y, boxW, boxH).stroke();
    doc.image(signaturePng, boxX + 4, y + 3, {
      fit: [boxW - 8, boxH - 6],
      align: "center",
      valign: "center",
    });
  }

  return y + boxH + 18;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** 2 mm in PDF points (72 pt / inch, 25.4 mm / inch). */
const BORDER_PT = (2 * 72) / 25.4;
const PAD = 28;
const CONTENT_LEFT = PAD + BORDER_PT;
const CONTENT_RIGHT = PAGE_W - PAD - BORDER_PT;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const FOOTER_Y = PAGE_H - PAD - 14;
const RED = "#DC2626";
const TABLE_LINE = "#78716c";
const TABLE_HEADER_BG = "#ececec";

const COL_PRODUCT_W = CONTENT_WIDTH * 0.32;
const COL_QTY_W = CONTENT_WIDTH * 0.08;
const COL_UOM_W = CONTENT_WIDTH * 0.14;
const COL_PRICE_W = CONTENT_WIDTH * 0.14;
const COL_AMT_W = CONTENT_WIDTH - COL_PRODUCT_W - COL_QTY_W - COL_UOM_W - COL_PRICE_W;
const COL_PRODUCT_X = CONTENT_LEFT;
const COL_QTY_X = COL_PRODUCT_X + COL_PRODUCT_W;
const COL_UOM_X = COL_QTY_X + COL_QTY_W;
const COL_PRICE_X = COL_UOM_X + COL_UOM_W;
const COL_AMT_X = COL_PRICE_X + COL_PRICE_W;
const TABLE_RIGHT = CONTENT_LEFT + CONTENT_WIDTH;
const CELL_PAD_X = 5;
const HEADER_ROW_H = 22;
const MIN_ROW_H = 18;
const TOTAL_ROW_H = 22;

export type OrderPdfLine = {
  name: string;
  qty: string;
  uom: string;
  price: string;
  amount: string;
  isSub: boolean;
};

const LEGAL_DISCLAIMER =
  "The above names and signatories show above, approve and witness that all information included in this document is accurate and liable for legal use.";

function drawLegalDisclaimer(doc: InstanceType<typeof PDFDocument>, y: number): number {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#44403c");
  const h = doc.heightOfString(LEGAL_DISCLAIMER, { width: CONTENT_WIDTH, align: "center" });
  doc.text(LEGAL_DISCLAIMER, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  return y + h + 10;
}

export type OrderPdfInput = {
  outletName: string;
  outletId: string;
  orderNumber: string;
  placedAtLabel: string;
  grandTotalFormatted: string;
  lines: OrderPdfLine[];
  signatureCaption: string;
  signaturePng: Buffer | null;
  signatureWhenLabel?: string;
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

function contentBottomLimit(): number {
  return FOOTER_Y - 12;
}

type TableSegment = { top: number; rowEnds: number[] };

function paintTableBorders(doc: InstanceType<typeof PDFDocument>, top: number, rowEnds: number[]) {
  if (rowEnds.length === 0) return;
  const bottom = rowEnds[rowEnds.length - 1]!;
  doc.save().lineWidth(0.75).strokeColor(TABLE_LINE);
  doc.rect(CONTENT_LEFT, top, CONTENT_WIDTH, bottom - top).stroke();
  for (const x of [COL_QTY_X, COL_UOM_X, COL_PRICE_X, COL_AMT_X]) {
    doc.moveTo(x, top).lineTo(x, bottom).stroke();
  }
  for (const yEnd of rowEnds) {
    doc.moveTo(CONTENT_LEFT, yEnd).lineTo(TABLE_RIGHT, yEnd).stroke();
  }
  doc.restore();
}

function drawTableHeaderRow(doc: InstanceType<typeof PDFDocument>, top: number): number {
  doc.save().fillColor(TABLE_HEADER_BG).rect(CONTENT_LEFT, top, CONTENT_WIDTH, HEADER_ROW_H).fill().restore();
  const textY = top + 7;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#44403c");
  doc.text("PRODUCT", COL_PRODUCT_X + CELL_PAD_X, textY, {
    width: COL_PRODUCT_W - CELL_PAD_X * 2,
  });
  doc.text("QTY", COL_QTY_X, textY, { width: COL_QTY_W, align: "center" });
  doc.text("UOM", COL_UOM_X, textY, { width: COL_UOM_W, align: "center" });
  doc.text("PRICE", COL_PRICE_X + CELL_PAD_X, textY, {
    width: COL_PRICE_W - CELL_PAD_X * 2,
    align: "right",
  });
  doc.text("AMOUNT", COL_AMT_X + CELL_PAD_X, textY, {
    width: COL_AMT_W - CELL_PAD_X * 2,
    align: "right",
  });
  return top + HEADER_ROW_H;
}

function measureLineRowHeight(doc: InstanceType<typeof PDFDocument>, line: OrderPdfLine): number {
  const indent = line.isSub ? 10 : 0;
  const nameW = COL_PRODUCT_W - CELL_PAD_X * 2 - indent;
  doc.font(line.isSub ? "Helvetica" : "Helvetica-Bold").fontSize(9);
  const textH = doc.heightOfString(line.name, { width: nameW });
  return Math.max(MIN_ROW_H, textH + 8);
}

function drawTableBodyRow(
  doc: InstanceType<typeof PDFDocument>,
  top: number,
  line: OrderPdfLine,
  rowH: number,
): number {
  const textY = top + 5;
  const indent = line.isSub ? 10 : 0;
  doc.font(line.isSub ? "Helvetica" : "Helvetica-Bold").fontSize(9).fillColor("#292524");
  doc.text(line.name, COL_PRODUCT_X + CELL_PAD_X + indent, textY, {
    width: COL_PRODUCT_W - CELL_PAD_X * 2 - indent,
  });
  doc.font("Helvetica").fontSize(9);
  doc.text(line.qty, COL_QTY_X, textY, { width: COL_QTY_W, align: "center" });
  doc.text(line.uom, COL_UOM_X, textY, { width: COL_UOM_W, align: "center" });
  doc.text(line.price, COL_PRICE_X + CELL_PAD_X, textY, {
    width: COL_PRICE_W - CELL_PAD_X * 2,
    align: "right",
  });
  doc.text(line.amount, COL_AMT_X + CELL_PAD_X, textY, {
    width: COL_AMT_W - CELL_PAD_X * 2,
    align: "right",
  });
  return top + rowH;
}

function drawTableTotalRow(
  doc: InstanceType<typeof PDFDocument>,
  top: number,
  grandTotalFormatted: string,
): number {
  doc.save().fillColor("#fafaf9").rect(CONTENT_LEFT, top, CONTENT_WIDTH, TOTAL_ROW_H).fill().restore();
  const textY = top + 6;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#292524");
  doc.text("Total", COL_PRODUCT_X + CELL_PAD_X, textY, {
    width: COL_PRODUCT_W + COL_QTY_W + COL_UOM_W + COL_PRICE_W - CELL_PAD_X * 2,
    align: "right",
  });
  doc.fillColor(RED).text(grandTotalFormatted, COL_AMT_X + CELL_PAD_X, textY, {
    width: COL_AMT_W - CELL_PAD_X * 2,
    align: "right",
  });
  return top + TOTAL_ROW_H;
}

type TablePagination = {
  fits: (y: number, needed: number) => boolean;
  newPage: () => number;
};

function drawOrderLinesTable(
  doc: InstanceType<typeof PDFDocument>,
  startY: number,
  lines: OrderPdfLine[],
  grandTotalFormatted: string,
  pagination: TablePagination,
): number {
  const segments: TableSegment[] = [];
  let tableTop = startY;
  let rowEnds: number[] = [];
  let y = drawTableHeaderRow(doc, tableTop);
  rowEnds.push(y);

  const flushSegment = () => {
    if (rowEnds.length > 0) {
      segments.push({ top: tableTop, rowEnds: [...rowEnds] });
    }
  };

  const beginSegment = (top: number) => {
    tableTop = top;
    rowEnds = [];
    y = drawTableHeaderRow(doc, tableTop);
    rowEnds.push(y);
  };

  for (const line of lines) {
    const rowH = measureLineRowHeight(doc, line);
    if (!pagination.fits(y, rowH)) {
      flushSegment();
      beginSegment(pagination.newPage());
    }
    y = drawTableBodyRow(doc, y, line, rowH);
    rowEnds.push(y);
  }

  if (!pagination.fits(y, TOTAL_ROW_H)) {
    flushSegment();
    beginSegment(pagination.newPage());
  }
  y = drawTableTotalRow(doc, y, grandTotalFormatted);
  rowEnds.push(y);
  flushSegment();

  for (const seg of segments) {
    paintTableBorders(doc, seg.top, seg.rowEnds);
  }

  return y + 12;
}

async function loadLogoPng(): Promise<Buffer | null> {
  try {
    if (!existsSync(LOGO_PATH)) return null;
    return await sharp(LOGO_PATH).png().resize(LOGO_SIZE, LOGO_SIZE, { fit: "inside" }).toBuffer();
  } catch {
    return null;
  }
}

export async function renderOutletOrderPdf(input: OrderPdfInput): Promise<Buffer> {
  const logoBuf = await loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headerLines = [
      input.outletName,
      `Outlet code: ${input.outletId}`,
      `Order no.: ${input.orderNumber}`,
      input.placedAtLabel,
    ];
    let y = drawDocumentHeader(doc, logoBuf, headerLines);
    y = drawOrderLinesTable(doc, y, input.lines, input.grandTotalFormatted, {
      fits: (currentY, needed) => currentY + needed <= contentBottomLimit(),
      newPage: () => {
        doc.addPage();
        return PAD + BORDER_PT + 8;
      },
    });

    const signatureBlockHeight = input.signatureWhenLabel?.trim() ? 112 : 92;
    doc.font("Helvetica-Bold").fontSize(9);
    const disclaimerHeight =
      doc.heightOfString(LEGAL_DISCLAIMER, { width: CONTENT_WIDTH, align: "center" }) + 10;
    const ensureSpace = (needed: number) => {
      if (y + needed <= contentBottomLimit()) return;
      doc.addPage();
      y = PAD + BORDER_PT + 8;
    };

    ensureSpace(signatureBlockHeight + disclaimerHeight);
    y = drawSignatureSection(
      doc,
      y,
      input.signatureCaption,
      input.signaturePng,
      input.signatureWhenLabel,
    );
    y = drawLegalDisclaimer(doc, y);

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

export async function renderCombinedOrderPdf(input: CombinedOrderPdfInput): Promise<Buffer> {
  const logoBuf = await loadLogoPng();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ensureSpace = (yPos: number, needed: number): number => {
      if (yPos + needed <= contentBottomLimit()) return yPos;
      doc.addPage();
      return PAD + BORDER_PT + 8;
    };

    const headerLines = [
      input.outletName,
      `Outlet code: ${input.outletId}`,
      `Order no.: ${input.orderNumber}`,
      input.placedAtLabel,
    ];
    let y = drawDocumentHeader(doc, logoBuf, headerLines);
    y = drawOrderLinesTable(doc, y, input.lines, input.grandTotalFormatted, {
      fits: (currentY, needed) => currentY + needed <= contentBottomLimit(),
      newPage: () => {
        doc.addPage();
        return PAD + BORDER_PT + 8;
      },
    });

    y = ensureSpace(y, 130);
    y = drawSignatureSection(
      doc,
      y,
      `Order Placed By : ${input.employeeName}`,
      input.employeeSignaturePng,
    );

    y = ensureSpace(y, 110);
    y = drawSignatureSection(
      doc,
      y,
      `Order Approved By Supervisor Name: ${input.supervisorAlias}`,
      null,
      input.acceptedAtLabel,
    );

    y = ensureSpace(y, 130);
    y = drawSignatureSection(
      doc,
      y,
      `Order Signed By Driver Name : ${input.driverName}`,
      input.driverSignaturePng,
      input.loadedAtLabel,
    );

    y = ensureSpace(y, 130);
    y = drawSignatureSection(
      doc,
      y,
      `Order Received By : ${input.offloaderName}`,
      input.offloaderSignaturePng,
      input.completedAtLabel,
    );

    y = ensureSpace(y, 80);
    doc.font("Helvetica-Bold").fontSize(9);
    const disclaimerHeight =
      doc.heightOfString(LEGAL_DISCLAIMER, { width: CONTENT_WIDTH, align: "center" }) + 10;
    y = ensureSpace(y, disclaimerHeight);
    y = drawLegalDisclaimer(doc, y);

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

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("name, qty, uom, unit_cost, line_total, sort_order")
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

  const lines: OrderPdfLine[] = (items ?? []).map((row) =>
    mapOrderItemToPdfLine(row, false),
  );

  const signaturePng = await loadSignaturePng(
    admin,
    order.employee_signature_path as string | null,
  );

  const employeeName = String(order.employee_name ?? "").trim() || "—";

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `${placedAtLabel} (Kitwe)`,
      grandTotalFormatted: grandFormatted,
      lines,
      signatureCaption: `Order Placed By : ${employeeName}`,
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
    cacheControl: "60",
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
      "id, outlet_id, outlet_name, order_number, employee_name, employee_signature_path, grand_total, created_at, status, approved_pdf_path, supervisor_accepted_alias, supervisor_accepted_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (!["accepted", "loaded", "completed"].includes(String(order.status))) {
    return { ok: false, error: "Order is not supervisor-approved yet." };
  }

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, unit_cost, line_total, sort_order")
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
    const pid = String(row.product_id ?? "").toLowerCase();
    return mapOrderItemToPdfLine(row, autoAddedIds.has(pid));
  });

  const supervisorAlias =
    String(order.supervisor_accepted_alias ?? "").trim() || "Supervisor";
  const acceptedWhen = formatKitwePdfLabel(order.supervisor_accepted_at as string, "Accepted");

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `${placedAtLabel} (Kitwe)`,
      grandTotalFormatted: grandFormatted,
      lines,
      signatureCaption: `Order Approved By Supervisor Name: ${supervisorAlias}`,
      signaturePng: null,
      signatureWhenLabel: acceptedWhen !== "—" ? acceptedWhen : undefined,
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
      cacheControl: "60",
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

  const { data: driver } = await admin
    .from("delivery_drivers")
    .select("name")
    .eq("id", order.driver_id as string)
    .maybeSingle();

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, unit_cost, line_total, sort_order")
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
    const pid = String(row.product_id ?? "").toLowerCase();
    return mapOrderItemToPdfLine(row, autoAddedIds.has(pid));
  });

  const signaturePng = await loadDriverSignaturePng(
    admin,
    order.driver_signature_path as string | null,
  );

  const driverName = String(driver?.name ?? "Driver").trim() || "Driver";

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderOutletOrderPdf({
      outletName: String(order.outlet_name),
      outletId: String(order.outlet_id),
      orderNumber: String(order.order_number),
      placedAtLabel: `Loaded ${loadedLabel} (Kitwe)`,
      grandTotalFormatted: formatKwacha(
        (items ?? []).reduce((sum, row) => sum + Number(row.line_total ?? 0), 0),
      ),
      lines,
      signatureCaption: `Order Signed By Driver Name : ${driverName}`,
      signaturePng,
      signatureWhenLabel: `Loaded ${loadedLabel} (Kitwe)`,
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
      cacheControl: "60",
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

  const { data: driver } = await admin
    .from("delivery_drivers")
    .select("name")
    .eq("id", order.driver_id as string)
    .maybeSingle();

  const { data: items, error: itemsErr } = await admin
    .from("outlet_order_items")
    .select("product_id, name, qty, uom, unit_cost, line_total, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (itemsErr) return { ok: false, error: itemsErr.message };

  const autoAddedIds = await loadAutoAddedProductIds(admin);
  const grandTotal = Number(order.grand_total ?? 0);

  const lines: OrderPdfLine[] = (items ?? []).map((row) => {
    const pid = String(row.product_id ?? "").toLowerCase();
    return mapOrderItemToPdfLine(row, autoAddedIds.has(pid));
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
      cacheControl: "60",
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

function mapOrderItemToPdfLine(
  row: {
    name: unknown;
    qty: unknown;
    uom: unknown;
    unit_cost: unknown;
    line_total: unknown;
  },
  isSub: boolean,
): OrderPdfLine {
  const qty = Number(row.qty ?? 0);
  const unitCost = Number(row.unit_cost ?? 0);
  const lineTotal = Number(row.line_total ?? 0);
  return {
    name: String(row.name ?? ""),
    qty: Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
    uom: String(row.uom ?? ""),
    price: formatLineAmountPdf(unitCost),
    amount: formatLineAmountPdf(lineTotal),
    isSub,
  };
}

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}

function formatLineAmountPdf(lineTotal: number): string {
  return formatKwacha(lineTotal);
}
