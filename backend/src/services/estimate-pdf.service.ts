import { readFile } from "node:fs/promises";

import PDFDocument from "pdfkit";
import sharp from "sharp";

import { estimatePdfCatalogue } from "../domain/estimate-pdf-catalogue.js";

export interface EstimatePdfLine {
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
  amount: number;
}

export interface EstimatePdfInput {
  id: string;
  version: number;
  status: string;
  propertyType: string;
  subtotal: number;
  gst: number;
  total: number;
  lineItems: EstimatePdfLine[];
  lead: {
    clientName: string;
    clientEmail: string;
    projectName: string;
    location: string;
  };
}

export interface EstimatePdfResult {
  bytes: Buffer;
  filename: string;
}

export interface EstimatePdfService {
  generate(input: EstimatePdfInput): Promise<EstimatePdfResult>;
}

const colors = {
  ink: "#202124",
  muted: "#65676b",
  line: "#dedfe2",
  panel: "#f5f5f5",
  red: "#d62b25"
} as const;

const table = {
  description: { x: 42, width: 160 },
  room: { x: 202, width: 100 },
  quantity: { x: 302, width: 55 },
  rate: { x: 357, width: 78 },
  total: { x: 435, width: 118 }
} as const;

const tableHeaderHeight = 24;
const groupHeaderHeight = 22;
const pageInitializers = new WeakMap<PDFKit.PDFDocument, () => void>();

function safeFilenamePart(value: string): string {
  const part = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return part;
}

function formatInr(value: number): string {
  return `INR ${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2
  }).format(value)}`;
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function collectDocument(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
    doc.end();
  });
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom - 30;
}

function addDocumentPage(doc: PDFKit.PDFDocument): void {
  doc.addPage();
  pageInitializers.get(doc)?.();
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  if (doc.y + requiredHeight > contentBottom(doc)) {
    addDocumentPage(doc);
  }
}

function drawWatermark(doc: PDFKit.PDFDocument, logo: Buffer): void {
  const width = 250;
  const height = 130;
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2;

  doc.save();
  doc.opacity(0.055);
  doc.rotate(-18, { origin: [centerX, centerY] });
  doc.image(logo, centerX - width / 2, centerY - height / 2, {
    fit: [width, height],
    align: "center",
    valign: "center"
  });
  doc.restore();
  doc.opacity(1);
}

function drawPageHeader(doc: PDFKit.PDFDocument, logo: Buffer): void {
  const { left, right, top } = doc.page.margins;
  const width = doc.page.width - left - right;

  doc.image(logo, left, top, { fit: [76, 28] });
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(colors.ink)
    .text("Interior Estimate", left + 250, top + 3, {
      width: width - 250,
      align: "right",
      lineBreak: false
    });
  doc
    .strokeColor(colors.red)
    .lineWidth(2)
    .moveTo(left, top + 38)
    .lineTo(left + width, top + 38)
    .stroke();
  doc.y = top + 52;
}

function drawTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.save();
  doc.rect(doc.page.margins.left, y, width, tableHeaderHeight).fill(colors.panel);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(colors.muted)
    .text("Description", table.description.x + 6, y + 8, {
      width: table.description.width - 12,
      lineBreak: false
    })
    .text("Room", table.room.x + 6, y + 8, {
      width: table.room.width - 12,
      lineBreak: false
    })
    .text("Qty", table.quantity.x + 4, y + 8, {
      width: table.quantity.width - 8,
      align: "right",
      lineBreak: false
    })
    .text("Unit rate", table.rate.x + 4, y + 8, {
      width: table.rate.width - 8,
      align: "right",
      lineBreak: false
    })
    .text("Line total", table.total.x + 4, y + 8, {
      width: table.total.width - 10,
      align: "right",
      lineBreak: false
    });
  doc.restore();
  doc.y = y + tableHeaderHeight;
}

function lineDescription(line: EstimatePdfLine): string {
  return estimatePdfCatalogue.get(line.catalogueId)?.description ?? line.catalogueId;
}

function lineCellText(line: EstimatePdfLine) {
  return {
    description: `${lineDescription(line)}\n${line.specification}`,
    room: line.roomName,
    quantity: `${new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2
    }).format(line.quantity)} ${line.unit}`,
    rate: formatInr(line.rate),
    total: formatInr(line.amount)
  };
}

function lineRowHeight(doc: PDFKit.PDFDocument, line: EstimatePdfLine): number {
  const cells = lineCellText(line);
  doc.font("Helvetica").fontSize(9);
  const regularCellHeights = [
    doc.heightOfString(cells.description, {
      width: table.description.width - 12
    }),
    doc.heightOfString(cells.room, { width: table.room.width - 12 }),
    doc.heightOfString(cells.quantity, { width: table.quantity.width - 8 }),
    doc.heightOfString(cells.rate, { width: table.rate.width - 8 })
  ];
  doc.font("Helvetica-Bold").fontSize(9);
  const totalHeight = doc.heightOfString(cells.total, {
    width: table.total.width - 10
  });
  const textHeight = Math.max(...regularCellHeights, totalHeight);

  return Math.max(36, textHeight + 16);
}

function drawLineRow(doc: PDFKit.PDFDocument, line: EstimatePdfLine): void {
  const rowHeight = lineRowHeight(doc, line);
  ensureSpace(doc, rowHeight);

  const y = doc.y;
  const cells = lineCellText(line);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.ink)
    .text(cells.description, table.description.x + 6, y + 8, {
      width: table.description.width - 12,
      height: rowHeight - 12
    })
    .text(cells.room, table.room.x + 6, y + 8, {
      width: table.room.width - 12,
      height: rowHeight - 12
    })
    .text(cells.quantity, table.quantity.x + 4, y + 8, {
      width: table.quantity.width - 8,
      align: "right",
      height: rowHeight - 12
    })
    .text(cells.rate, table.rate.x + 4, y + 8, {
      width: table.rate.width - 8,
      align: "right",
      height: rowHeight - 12
    })
    .font("Helvetica-Bold")
    .text(cells.total, table.total.x + 4, y + 8, {
      width: table.total.width - 10,
      align: "right",
      height: rowHeight - 12
    });

  doc
    .strokeColor(colors.line)
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y + rowHeight)
    .lineTo(doc.page.width - doc.page.margins.right, y + rowHeight)
    .stroke();
  doc.y = y + rowHeight;
}

function drawGroupHeader(doc: PDFKit.PDFDocument, label: string): void {
  const y = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(colors.red)
    .text(label, doc.page.margins.left, y + 6, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineBreak: false
    });
  doc.y = y + groupHeaderHeight;
}

function groupedIncludedLines(input: EstimatePdfInput) {
  const groups = new Map<string, { label: string; lines: EstimatePdfLine[] }>();

  for (const line of input.lineItems.filter((item) => item.included)) {
    const entry = estimatePdfCatalogue.get(line.catalogueId);
    const key = entry?.sectionId ?? "legacy";
    const group = groups.get(key) ?? {
      label: entry?.sectionLabel ?? "Additional items",
      lines: []
    };
    group.lines.push(line);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function drawEstimateOverview(
  doc: PDFKit.PDFDocument,
  input: EstimatePdfInput,
  generatedAt: Date
): void {
  const left = doc.page.margins.left;
  const fullWidth = doc.page.width - left - doc.page.margins.right;
  const overviewY = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(colors.ink)
    .text(input.lead.projectName, left, overviewY, {
      width: fullWidth * 0.63
    });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(colors.muted)
    .text(input.lead.clientName, left, doc.y + 4, { width: fullWidth * 0.63 })
    .text(input.lead.clientEmail, left, doc.y + 2, { width: fullWidth * 0.63 })
    .text(input.lead.location, left, doc.y + 2, { width: fullWidth * 0.63 })
    .text(statusLabel(input.propertyType), left, doc.y + 2, {
      width: fullWidth * 0.63
    });

  const detailX = left + fullWidth * 0.65;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(colors.muted)
    .text("ESTIMATE", detailX, overviewY, { width: fullWidth * 0.35, align: "right" })
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(colors.ink)
    .text(`${input.id} / v${input.version}`, detailX, overviewY + 12, {
      width: fullWidth * 0.35,
      align: "right"
    })
    .font("Helvetica")
    .fontSize(8)
    .fillColor(colors.muted)
    .text(statusLabel(input.status), detailX, overviewY + 28, {
      width: fullWidth * 0.35,
      align: "right"
    })
    .text(
      generatedAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }),
      detailX,
      overviewY + 40,
      { width: fullWidth * 0.35, align: "right" }
    );
  doc.y = Math.max(doc.y, overviewY + 84);
}

function drawTotals(doc: PDFKit.PDFDocument, input: EstimatePdfInput): void {
  ensureSpace(doc, 174);
  doc.y += 16;

  const labelX = doc.page.width - doc.page.margins.right - 220;
  const amountX = labelX + 100;
  const amountWidth = 120;
  const row = (label: string, amount: number, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 11 : 9.5)
      .fillColor(bold ? colors.ink : colors.muted)
      .text(label, labelX, y, { width: 100, lineBreak: false })
      .fillColor(colors.ink)
      .text(formatInr(amount), amountX, y, {
        width: amountWidth,
        align: "right",
        lineBreak: false
      });
    doc.y = y + (bold ? 24 : 20);
  };

  row("Subtotal", input.subtotal);
  row("GST @ 18%", input.gst);
  doc
    .strokeColor(colors.red)
    .lineWidth(1)
    .moveTo(labelX, doc.y - 5)
    .lineTo(amountX + amountWidth, doc.y - 5)
    .stroke();
  row("Final total", input.total, true);

  const terms = [
    "Valid for 30 days.",
    "Rates are subject to material market changes.",
    "Final scope depends on site measurement.",
    "GST is applied as shown."
  ];
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(colors.muted)
    .text(terms.join("\n"), doc.page.margins.left, doc.y + 6, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: 2
    });
}

function drawPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom - 12;

    doc
      .strokeColor(colors.line)
      .lineWidth(0.5)
      .moveTo(left, y - 7)
      .lineTo(left + width, y - 7)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(colors.muted)
      .text("Lisno Interiors", left, y, {
        width: width / 2,
        lineBreak: false
      })
      .text(`Page ${index + 1} of ${range.count}`, left, y, {
        width,
        align: "right",
        lineBreak: false
      });
  }
}

export function createEstimatePdfService(options?: {
  now?: () => Date;
  logoSvg?: Buffer;
}): EstimatePdfService {
  const now = options?.now ?? (() => new Date());
  const logoPngPromise = (async () => {
    const logoSvg =
      options?.logoSvg ??
      (await readFile(new URL("../assets/lisno-logo.svg", import.meta.url)));
    const logoPng = await sharp(logoSvg).png().toBuffer();
    return logoPng;
  })();

  return {
    async generate(input) {
      const logoPng = await logoPngPromise;
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 54, right: 42, bottom: 54, left: 42 },
        bufferPages: true,
        autoFirstPage: false
      });

      pageInitializers.set(doc, () => {
        drawWatermark(doc, logoPng);
        drawPageHeader(doc, logoPng);
      });
      addDocumentPage(doc);
      drawEstimateOverview(doc, input, now());
      doc.y += 8;

      for (const group of groupedIncludedLines(input)) {
        const firstRowHeight = lineRowHeight(doc, group.lines[0]);
        ensureSpace(doc, groupHeaderHeight + tableHeaderHeight + firstRowHeight);
        drawGroupHeader(doc, group.label);
        drawTableHeader(doc);

        for (const [index, line] of group.lines.entries()) {
          if (index === 0) {
            drawLineRow(doc, line);
            continue;
          }

          const pageCount = doc.bufferedPageRange().count;
          const rowHeight = lineRowHeight(doc, line);
          ensureSpace(doc, groupHeaderHeight + tableHeaderHeight + rowHeight);
          if (doc.bufferedPageRange().count > pageCount) {
            drawGroupHeader(doc, `${group.label} (continued)`);
            drawTableHeader(doc);
          }
          drawLineRow(doc, line);
        }
        doc.y += 8;
      }

      drawTotals(doc, input);
      drawPageNumbers(doc);

      const projectPart =
        safeFilenamePart(input.lead.projectName) ||
        safeFilenamePart(input.id) ||
        "estimate";
      return {
        bytes: await collectDocument(doc),
        filename: `lisno-${projectPart}-estimate-v${input.version}.pdf`
      };
    }
  };
}
