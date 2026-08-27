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

export type EstimatePdfProfile = "standard" | "compact_client_delivery";

export function scaleEstimateTextSize(
  size: number,
  profile: EstimatePdfProfile
): number {
  if (profile === "standard") return size;
  return Math.max(7, Math.round(size * 0.85 * 2) / 2);
}

export interface EstimatePdfService {
  generate(
    input: EstimatePdfInput,
    options?: { profile?: EstimatePdfProfile }
  ): Promise<EstimatePdfResult>;
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
const pageHeaderContentOffset = 52;
const minimumRowHeight = 36;
const rowVerticalPadding = 16;
const oversizedRowReservation = 120;
const pageInitializers = new WeakMap<PDFKit.PDFDocument, () => void>();
const rowContinuationInitializers = new WeakMap<
  PDFKit.PDFDocument,
  () => void
>();

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

function drawPageHeader(
  doc: PDFKit.PDFDocument,
  logo: Buffer,
  profile: EstimatePdfProfile
): void {
  const { left, right, top } = doc.page.margins;
  const width = doc.page.width - left - right;

  doc.image(logo, left, top, { fit: [76, 28] });
  doc
    .font("Helvetica-Bold")
    .fontSize(scaleEstimateTextSize(15, profile))
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
  doc.y = top + pageHeaderContentOffset;
}

function drawTableHeader(doc: PDFKit.PDFDocument, profile: EstimatePdfProfile): void {
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.save();
  doc.rect(doc.page.margins.left, y, width, tableHeaderHeight).fill(colors.panel);
  doc
    .font("Helvetica-Bold")
    .fontSize(scaleEstimateTextSize(8, profile))
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

type LineCellText = ReturnType<typeof lineCellText>;

function measureLineCells(
  doc: PDFKit.PDFDocument,
  cells: LineCellText,
  profile: EstimatePdfProfile
): number {
  doc.font("Helvetica").fontSize(scaleEstimateTextSize(9, profile));
  const regularCellHeights = [
    doc.heightOfString(cells.description, {
      width: table.description.width - 12
    }),
    doc.heightOfString(cells.room, { width: table.room.width - 12 }),
    doc.heightOfString(cells.quantity, { width: table.quantity.width - 8 }),
    doc.heightOfString(cells.rate, { width: table.rate.width - 8 })
  ];
  doc.font("Helvetica-Bold").fontSize(scaleEstimateTextSize(9, profile));
  const totalHeight = doc.heightOfString(cells.total, {
    width: table.total.width - 10
  });
  const textHeight = Math.max(...regularCellHeights, totalHeight);

  return Math.max(minimumRowHeight, textHeight + rowVerticalPadding);
}

function lineRowHeight(
  doc: PDFKit.PDFDocument,
  line: EstimatePdfLine,
  profile: EstimatePdfProfile
): number {
  return measureLineCells(doc, lineCellText(line), profile);
}

function measureLineCell(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  bold = false,
  profile: EstimatePdfProfile
): number {
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(scaleEstimateTextSize(9, profile));
  return doc.heightOfString(text, { width });
}

function takeTextFragment(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
  bold = false,
  profile: EstimatePdfProfile
): { fragment: string; remaining: string } {
  const normalized = text.trimStart();
  if (!normalized) {
    return { fragment: "", remaining: "" };
  }
  if (measureLineCell(doc, normalized, width, bold, profile) <= maxHeight) {
    return { fragment: normalized, remaining: "" };
  }

  const characters = Array.from(normalized);
  let low = 1;
  let high = characters.length;
  let fittingLength = 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = characters.slice(0, middle).join("");
    if (measureLineCell(doc, candidate, width, bold, profile) <= maxHeight) {
      fittingLength = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  let splitLength = fittingLength;
  for (let index = fittingLength - 1; index > 0; index -= 1) {
    if (
      index >= Math.floor(fittingLength / 2) &&
      /\s/u.test(characters[index])
    ) {
      splitLength = index;
      break;
    }
  }
  const fragment = characters.slice(0, splitLength).join("").trimEnd();
  const remaining = characters.slice(splitLength).join("").trimStart();

  return {
    fragment: fragment || characters[0],
    remaining: fragment ? remaining : characters.slice(1).join("").trimStart()
  };
}

function splitLineCells(
  doc: PDFKit.PDFDocument,
  cells: LineCellText,
  maxHeight: number,
  profile: EstimatePdfProfile
): { fragment: LineCellText; remaining: LineCellText } {
  const description = takeTextFragment(
    doc,
    cells.description,
    table.description.width - 12,
    maxHeight,
    false,
    profile
  );
  const room = takeTextFragment(
    doc,
    cells.room,
    table.room.width - 12,
    maxHeight,
    false,
    profile
  );
  const quantity = takeTextFragment(
    doc,
    cells.quantity,
    table.quantity.width - 8,
    maxHeight,
    false,
    profile
  );
  const rate = takeTextFragment(
    doc,
    cells.rate,
    table.rate.width - 8,
    maxHeight,
    false,
    profile
  );
  const total = takeTextFragment(
    doc,
    cells.total,
    table.total.width - 10,
    maxHeight,
    true,
    profile
  );

  return {
    fragment: {
      description: description.fragment,
      room: room.fragment,
      quantity: quantity.fragment,
      rate: rate.fragment,
      total: total.fragment
    },
    remaining: {
      description: description.remaining,
      room: room.remaining,
      quantity: quantity.remaining,
      rate: rate.remaining,
      total: total.remaining
    }
  };
}

function drawLineRowFragment(
  doc: PDFKit.PDFDocument,
  cells: LineCellText,
  rowHeight: number,
  profile: EstimatePdfProfile
): void {
  const y = doc.y;
  const drawCell = (
    text: string,
    x: number,
    width: number,
    options?: { align?: "right"; bold?: boolean }
  ) => {
    if (!text) {
      return;
    }
    doc
      .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(scaleEstimateTextSize(9, profile))
      .fillColor(colors.ink)
      .text(text, x, y + 8, {
        width,
        height: rowHeight - rowVerticalPadding,
        align: options?.align
      });
  };

  drawCell(
    cells.description,
    table.description.x + 6,
    table.description.width - 12
  );
  drawCell(cells.room, table.room.x + 6, table.room.width - 12);
  drawCell(
    cells.quantity,
    table.quantity.x + 4,
    table.quantity.width - 8,
    { align: "right" }
  );
  drawCell(cells.rate, table.rate.x + 4, table.rate.width - 8, {
    align: "right"
  });
  drawCell(cells.total, table.total.x + 4, table.total.width - 10, {
    align: "right",
    bold: true
  });

  doc
    .strokeColor(colors.line)
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y + rowHeight)
    .lineTo(doc.page.width - doc.page.margins.right, y + rowHeight)
    .stroke();
  doc.y = y + rowHeight;
}

function drawLineRow(
  doc: PDFKit.PDFDocument,
  line: EstimatePdfLine,
  profile: EstimatePdfProfile
): void {
  let remaining = lineCellText(line);
  let continuation = false;

  while (Object.values(remaining).some(Boolean)) {
    if (
      continuation ||
      contentBottom(doc) - doc.y < minimumRowHeight
    ) {
      addDocumentPage(doc);
      rowContinuationInitializers.get(doc)?.();
    }

    const availableHeight = contentBottom(doc) - doc.y;
    const maxTextHeight = availableHeight - rowVerticalPadding;
    const split = splitLineCells(doc, remaining, maxTextHeight, profile);
    const rowHeight = Math.min(
      availableHeight,
      measureLineCells(doc, split.fragment, profile)
    );
    drawLineRowFragment(doc, split.fragment, rowHeight, profile);
    remaining = split.remaining;
    continuation = Object.values(remaining).some(Boolean);
  }
}

function drawGroupHeader(
  doc: PDFKit.PDFDocument,
  label: string,
  profile: EstimatePdfProfile
): void {
  const y = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(scaleEstimateTextSize(10, profile))
    .fillColor(colors.red)
    .text(label, doc.page.margins.left, y + 6, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineBreak: false
    });
  doc.y = y + groupHeaderHeight;
}

function maximumFreshRowHeight(doc: PDFKit.PDFDocument): number {
  const freshRowY =
    doc.page.margins.top +
    pageHeaderContentOffset +
    groupHeaderHeight +
    tableHeaderHeight;
  return contentBottom(doc) - freshRowY;
}

function rowReservation(
  doc: PDFKit.PDFDocument,
  line: EstimatePdfLine,
  profile: EstimatePdfProfile
): number {
  const rowHeight = lineRowHeight(doc, line, profile);
  const freshCapacity = maximumFreshRowHeight(doc);
  return rowHeight <= freshCapacity
    ? rowHeight
    : Math.min(oversizedRowReservation, freshCapacity);
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

interface OverviewField {
  text: string;
  font: "Helvetica" | "Helvetica-Bold";
  fontSize: number;
  color: string;
  gapAfter: number;
  maxHeight: number;
}

function measureOverviewField(
  doc: PDFKit.PDFDocument,
  field: OverviewField,
  width: number,
  profile: EstimatePdfProfile
): number {
  doc.font(field.font).fontSize(scaleEstimateTextSize(field.fontSize, profile));
  return Math.min(doc.heightOfString(field.text, { width }), field.maxHeight);
}

function drawEstimateOverview(
  doc: PDFKit.PDFDocument,
  input: EstimatePdfInput,
  generatedAt: Date,
  profile: EstimatePdfProfile
): void {
  const left = doc.page.margins.left;
  const fullWidth = doc.page.width - left - doc.page.margins.right;
  const leftWidth = fullWidth * 0.63;
  const detailX = left + fullWidth * 0.65;
  const detailWidth = fullWidth * 0.35;
  const generatedDate = generatedAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      });
  const leftFields: OverviewField[] = [
    {
      text: input.lead.projectName,
      font: "Helvetica-Bold",
      fontSize: 20,
      color: colors.ink,
      gapAfter: 4,
      maxHeight: 54
    },
    {
      text: input.lead.clientName,
      font: "Helvetica",
      fontSize: 9.5,
      color: colors.muted,
      gapAfter: 2,
      maxHeight: 22
    },
    {
      text: input.lead.clientEmail,
      font: "Helvetica",
      fontSize: 9.5,
      color: colors.muted,
      gapAfter: 2,
      maxHeight: 22
    },
    {
      text: input.lead.location,
      font: "Helvetica",
      fontSize: 9.5,
      color: colors.muted,
      gapAfter: 2,
      maxHeight: 22
    },
    {
      text: statusLabel(input.propertyType),
      font: "Helvetica",
      fontSize: 9.5,
      color: colors.muted,
      gapAfter: 0,
      maxHeight: 22
    }
  ];
  const detailFields: OverviewField[] = [
    {
      text: "ESTIMATE",
      font: "Helvetica",
      fontSize: 8,
      color: colors.muted,
      gapAfter: 2,
      maxHeight: 10
    },
    {
      text: `${input.id} / v${input.version}`,
      font: "Helvetica-Bold",
      fontSize: 9,
      color: colors.ink,
      gapAfter: 4,
      maxHeight: 22
    },
    {
      text: statusLabel(input.status),
      font: "Helvetica",
      fontSize: 8,
      color: colors.muted,
      gapAfter: 2,
      maxHeight: 18
    },
    {
      text: generatedDate,
      font: "Helvetica",
      fontSize: 8,
      color: colors.muted,
      gapAfter: 0,
      maxHeight: 10
    }
  ];
  const leftHeights = leftFields.map((field) =>
    measureOverviewField(doc, field, leftWidth, profile)
  );
  const detailHeights = detailFields.map((field) =>
    measureOverviewField(doc, field, detailWidth, profile)
  );
  const blockHeight = (fields: OverviewField[], heights: number[]) =>
    fields.reduce((height, field, index) => {
      return height + heights[index] + field.gapAfter;
    }, 0);
  const overviewHeight = Math.max(
    84,
    blockHeight(leftFields, leftHeights),
    blockHeight(detailFields, detailHeights)
  );

  ensureSpace(doc, overviewHeight);
  const overviewY = doc.y;
  let leftY = overviewY;
  for (const [index, field] of leftFields.entries()) {
    const height = leftHeights[index];
    doc
      .font(field.font)
      .fontSize(scaleEstimateTextSize(field.fontSize, profile))
      .fillColor(field.color)
      .text(field.text, left, leftY, {
        width: leftWidth,
        height,
        ellipsis: true
      });
    leftY += height + field.gapAfter;
  }

  let detailY = overviewY;
  for (const [index, field] of detailFields.entries()) {
    const height = detailHeights[index];
    doc
      .font(field.font)
      .fontSize(scaleEstimateTextSize(field.fontSize, profile))
      .fillColor(field.color)
      .text(field.text, detailX, detailY, {
        width: detailWidth,
        height,
        ellipsis: true,
        align: "right"
      });
    detailY += height + field.gapAfter;
  }
  doc.y = overviewY + overviewHeight;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  input: EstimatePdfInput,
  profile: EstimatePdfProfile
): void {
  ensureSpace(doc, 174);
  doc.y += 16;

  const labelX = doc.page.width - doc.page.margins.right - 220;
  const amountX = labelX + 100;
  const amountWidth = 120;
  const row = (label: string, amount: number, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(scaleEstimateTextSize(bold ? 11 : 9.5, profile))
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
    .fontSize(scaleEstimateTextSize(8.5, profile))
    .fillColor(colors.muted)
    .text(terms.join("\n"), doc.page.margins.left, doc.y + 6, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: 2
    });
}

function drawPageNumbers(doc: PDFKit.PDFDocument, profile: EstimatePdfProfile): void {
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
      .fontSize(scaleEstimateTextSize(8, profile))
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
    async generate(input, generateOptions) {
      const profile = generateOptions?.profile ?? "standard";
      const logoPng = await logoPngPromise;
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 54, right: 42, bottom: 54, left: 42 },
        bufferPages: true,
        autoFirstPage: false
      });

      pageInitializers.set(doc, () => {
        drawWatermark(doc, logoPng);
        drawPageHeader(doc, logoPng, profile);
      });
      addDocumentPage(doc);
      drawEstimateOverview(doc, input, now(), profile);
      doc.y += 8;

      for (const group of groupedIncludedLines(input)) {
        rowContinuationInitializers.set(doc, () => {
          drawGroupHeader(doc, `${group.label} (continued)`, profile);
          drawTableHeader(doc, profile);
        });
        const firstRowHeight = rowReservation(doc, group.lines[0], profile);
        ensureSpace(doc, groupHeaderHeight + tableHeaderHeight + firstRowHeight);
        drawGroupHeader(doc, group.label, profile);
        drawTableHeader(doc, profile);

        for (const [index, line] of group.lines.entries()) {
          if (index === 0) {
            drawLineRow(doc, line, profile);
            continue;
          }

          const pageCount = doc.bufferedPageRange().count;
          const rowHeight = rowReservation(doc, line, profile);
          ensureSpace(doc, groupHeaderHeight + tableHeaderHeight + rowHeight);
          if (doc.bufferedPageRange().count > pageCount) {
            drawGroupHeader(doc, `${group.label} (continued)`, profile);
            drawTableHeader(doc, profile);
          }
          drawLineRow(doc, line, profile);
        }
        rowContinuationInitializers.delete(doc);
        doc.y += 8;
      }

      drawTotals(doc, input, profile);
      drawPageNumbers(doc, profile);

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
