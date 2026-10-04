import "server-only";

import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOGO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets/afterten-logo.png",
);

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
  const colQty = CONTENT_LEFT + CONTENT_WIDTH * 0.52;
  const colUom = CONTENT_LEFT + CONTENT_WIDTH * 0.64;
  const colAmt = CONTENT_LEFT + CONTENT_WIDTH * 0.78;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#57534e");
  doc.text("PRODUCT", colProduct, y, { width: CONTENT_WIDTH * 0.5 });
  doc.text("QTY", colQty, y, { width: CONTENT_WIDTH * 0.1, align: "center" });
  doc.text("UOM", colUom, y, { width: CONTENT_WIDTH * 0.12, align: "center" });
  doc.text("AMOUNT", colAmt, y, { width: CONTENT_WIDTH * 0.2, align: "right" });
  return y + 16;
}

function contentBottomLimit(): number {
  return FOOTER_Y - 12;
}

export async function renderOutletOrderPdf(input: OrderPdfInput): Promise<Buffer> {
  const logoBuf = await sharp(LOGO_PATH).png().resize(120, 120, { fit: "inside" }).toBuffer();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.image(logoBuf, CONTENT_LEFT, PAD + BORDER_PT, { width: 72 });

    const headerY = PAD + BORDER_PT + 4;
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
      const colQty = CONTENT_LEFT + CONTENT_WIDTH * 0.52;
      const colUom = CONTENT_LEFT + CONTENT_WIDTH * 0.64;
      const colAmt = CONTENT_LEFT + CONTENT_WIDTH * 0.78;

      doc.font(line.isSub ? "Helvetica" : "Helvetica-Bold");
      doc.text(line.name, colProduct, y, { width: CONTENT_WIDTH * 0.5 - 8 });
      doc.text(line.qty, colQty, y, { width: CONTENT_WIDTH * 0.1, align: "center" });
      doc.text(line.uom, colUom, y, { width: CONTENT_WIDTH * 0.12, align: "center" });
      doc.text(line.amount, colAmt, y, { width: CONTENT_WIDTH * 0.2, align: "right" });
      y += rowHeight;
    }

    ensureSpace(22, false);
    y += 4;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#292524");
    doc.text("Total", CONTENT_LEFT + CONTENT_WIDTH * 0.52, y);
    doc.fillColor(RED).text(input.grandTotalFormatted, CONTENT_LEFT + CONTENT_WIDTH * 0.78, y, {
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

export async function loadSignaturePng(
  admin: SupabaseClient,
  signaturePath: string | null,
): Promise<Buffer | null> {
  if (!signaturePath?.trim()) return null;
  const normalized = signaturePath.trim().replace(/^signatures\//, "");
  const { data, error } = await admin.storage.from("signatures").download(normalized);
  if (error || !data) return null;
  const raw = Buffer.from(await data.arrayBuffer());
  return sharp(raw).png().toBuffer();
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

  const pdfBuffer = await renderOutletOrderPdf({
    outletName: String(order.outlet_name),
    outletId: String(order.outlet_id),
    orderNumber: String(order.order_number),
    placedAtLabel: `${placedAtLabel} (Kitwe)`,
    employeeName: String(order.employee_name ?? "").trim() || "—",
    grandTotalFormatted: grandFormatted,
    lines,
    signaturePng,
  });

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
  });
  if (uploadErr) return { ok: false, error: uploadErr.message };

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

function formatKwacha(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [intPart, decPart] = safe.toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K ${withCommas}.${decPart}`;
}
