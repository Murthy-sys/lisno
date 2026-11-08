import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import sharp from "sharp";

export const comparisonPage = {
  width: 841.89, height: 595.28, left: 39, right: 802.89, contentWidth: 763.89,
  bottom: 550, footer: 565
} as const;

export const comparisonColors = {
  paper: "#fdfcf9", ink: "#1d1839", muted: "#615c70", gold: "#986d25", goldLight: "#d8ae48",
  rule: "#d9d3df", warm: "#f6f0e2", cool: "#eef0f5", coolHeader: "#dfe2ec",
  neutral: "#f1eef4", section: "#f7f4ee", subtotal: "#ece8f0"
} as const;

const rupees = new Intl.NumberFormat("en-IN");
export function formatComparisonPaise(paise: number | bigint | null): string {
  if (paise === null) return "Incomplete";
  const value = BigInt(paise);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${value < 0n ? "−" : ""}${rupees.format(absolute / 100n)}.${fraction}`;
}

type Font = "body" | "medium" | "heading";
interface TextOptions {
  font?: Font;
  size?: number;
  color?: string;
  align?: "left" | "right" | "center";
  spacing?: number;
}

async function loadAssets() {
  const asset = (name: string) => readFile(new URL(`../assets/estimate-proposal/${name}`, import.meta.url));
  const [body, medium, coverPhoto, logoSvg] = await Promise.all([
    asset("Jost-Regular.ttf"), asset("Jost-Medium.ttf"), asset("cover-living.jpg"),
    readFile(new URL("../assets/lisno-logo.svg", import.meta.url), "utf8")
  ]);
  // Stack the emblem and wordmark of the packaged 110 × 30 Lisno mark.
  const artwork = logoSvg.replace(/^<svg[^>]*>/u, "").replace(/<\/svg>\s*$/u, "");
  const stacked = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="46" viewBox="0 0 80 46">
    <svg x="26" y="0" width="28" height="28" viewBox="0 0 30 30">${artwork}</svg>
    <svg x="0" y="28" width="80" height="18" viewBox="31 5 79 19">${artwork}</svg>
  </svg>`;
  const logo = await sharp(Buffer.from(stacked)).resize({ width: 400 }).png().toBuffer();
  return { body, medium, coverPhoto, logo };
}
let packaged: ReturnType<typeof loadAssets> | undefined;

export class ComparisonPdf {
  readonly doc: PDFKit.PDFDocument;
  readonly logo: Buffer;
  readonly coverPhoto: Buffer;
  private readonly result: Promise<Buffer>;

  static async create(roomName: string): Promise<ComparisonPdf> {
    packaged ??= loadAssets().catch(error => {
      packaged = undefined;
      throw error;
    });
    return new ComparisonPdf(await packaged, roomName);
  }

  private constructor(assets: Awaited<ReturnType<typeof loadAssets>>, private readonly roomName: string) {
    this.logo = assets.logo;
    this.coverPhoto = assets.coverPhoto;
    this.doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: true,
      info: { Title: "Lisno tier comparison", Author: "Lisno" } });
    this.doc.registerFont("body", assets.body).registerFont("medium", assets.medium).registerFont("heading", "Times-Roman");
    this.result = new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", chunk => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
    });
  }

  text(value: string, x: number, y: number, width: number, options: TextOptions = {}): void {
    const text = value.replace(/[\r\n\t]+/gu, " ");
    if (!text) return;
    const size = options.size ?? 8.5;
    const spacing = options.spacing ?? 0;
    const doc = this.doc;
    doc.font(options.font ?? "body").fontSize(size).fillColor(options.color ?? comparisonColors.ink);
    const measured = doc.widthOfString(text, { characterSpacing: spacing });
    const scale = measured > width ? width / measured : 1;
    const characterSpacing = spacing * scale;
    doc.fontSize(size * scale);
    const fit = doc.widthOfString(text, { characterSpacing });
    const inset = options.align === "right" ? width - fit : options.align === "center" ? (width - fit) / 2 : 0;
    // Position text explicitly so wrapped rows and footers do not trigger PDFKit page flow.
    doc.text(text, x + inset, y, { lineBreak: false, characterSpacing });
  }

  wrap(value: string, width: number, font: Font = "body", size = 8.5): string[] {
    const doc = this.doc.font(font).fontSize(size);
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/u)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
        if (line && doc.widthOfString(`${line} ${word}`) <= width) {
          line += ` ${word}`;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (line && doc.widthOfString(line + character) > width) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  interiorPage(eyebrow: string, title: string): number {
    const { width, height, left, right, contentWidth } = comparisonPage;
    const colors = comparisonColors;
    this.doc.addPage().rect(0, 0, width, height).fill(colors.paper);
    this.doc.image(this.logo, left, 31, { fit: [33, 22] });
    this.text(`${this.roomName} · TIER COMPARISON`, left + 106, 38, contentWidth - 106,
      { size: 5.6, color: colors.muted, align: "right", spacing: 1.25 });
    this.text(eyebrow, left, 55, contentWidth, { font: "medium", size: 7.3, color: colors.gold, spacing: 1.75 });
    this.doc.moveTo(left, 70).lineTo(right, 70).strokeColor(colors.gold).lineWidth(0.55).stroke();
    this.text(title, left, 80, contentWidth, { font: "heading", size: 23 });
    return 115;
  }

  finish(): Promise<Buffer> {
    const pages = this.doc.bufferedPageRange();
    const { left, right, footer } = comparisonPage;
    for (let index = 1; index < pages.count; index++) {
      this.doc.switchToPage(pages.start + index);
      this.text("Lisno India Private Limited · lisno.co.in", left, footer, 440, { size: 5.7 });
      this.text(`Page ${index} of ${pages.count - 1}`, right - 104, footer, 104, { size: 5.7, align: "right" });
    }
    this.doc.end();
    return this.result;
  }
}
