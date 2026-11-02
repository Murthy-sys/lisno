import PDFDocument from "pdfkit";
import type { EstimateProposalMetadata } from "../../domain/estimate-proposal.js";
import type { ProposalAssets, ProposalFont, ProposalPhoto } from "./assets.js";

export const page = { width: 595.28, height: 841.89, left: 51, right: 544.28, widthInside: 493.28, top: 61, bottom: 774, footer: 798 } as const;
export const palette = { paper: "#faf9f6", ink: "#1e183b", muted: "#5c5770", faint: "#8c849e", gold: "#806a17", goldLight: "#d1c281", pale: "#f2edd4", rule: "#e4dfd0", white: "#ffffff" } as const;
interface DrawOptions { font?: ProposalFont; color?: string; lineHeight?: number; spacing?: number; align?: "left" | "right" | "center"; }
interface Run { text: string; font: ProposalFont; }
type FontCoverageDocument = PDFKit.PDFDocument & { _font: { font?: { hasGlyphForCodePoint(code: number): boolean } } };

export class ProposalDocument {
  readonly doc: PDFKit.PDFDocument;
  private readonly fontCoverage = new Map<ProposalFont, (code: number) => boolean>();
  private readonly nonFooterPages = new Set<number>();
  constructor(readonly assets: ProposalAssets, readonly proposal: EstimateProposalMetadata, readonly clientName: string) {
    this.doc = new PDFDocument({ size: [page.width, page.height], margin: 0, bufferPages: true, autoFirstPage: false,
      info: { Title: `Lisno Estimate · ${clientName}`, Author: proposal.terms.company.name,
        CreationDate: new Date(proposal.issuedAt), ModDate: new Date(proposal.issuedAt) }, lang: "en-IN" });
    for (const [name, buffer] of Object.entries(assets.fonts)) this.doc.registerFont(name, buffer);
    for (const name of Object.keys(assets.fonts) as ProposalFont[]) {
      this.doc.font(name);
      const face = (this.doc as FontCoverageDocument)._font.font;
      if (!face) throw new Error("A proposal font could not be loaded.");
      this.fontCoverage.set(name, code => face.hasGlyphForCodePoint(code));
    }
  }
  addPage(withFooter = true) {
    this.doc.addPage();
    this.rect(0, 0, page.width, page.height, palette.paper);
    if (!withFooter) this.nonFooterPages.add(this.doc.bufferedPageRange().count - 1);
  }
  rect(x: number, y: number, width: number, height: number, fill: string, stroke?: string) {
    this.doc.save().rect(x, y, width, height).fill(fill);
    if (stroke) this.doc.rect(x, y, width, height).lineWidth(.5).stroke(stroke);
    this.doc.restore();
  }
  rule(x: number, y: number, width: number, color: string = palette.rule, weight = .5) {
    this.doc.save().moveTo(x, y).lineTo(x + width, y).lineWidth(weight).stroke(color).restore();
  }
  vertical(x: number, y: number, height: number) {
    this.doc.save().moveTo(x, y).lineTo(x, y + height).lineWidth(.5).stroke(palette.rule).restore();
  }
  photo(name: ProposalPhoto, x: number, y: number, width: number, height: number) {
    this.doc.save().rect(x, y, width, height).clip().image(this.assets.photos[name], x, y, { cover: [width, height], align: "center", valign: "center" }).restore();
  }
  logo(x: number, y: number, width = 118) {
    this.doc.image(this.assets.logo, x, y, { width });
  }
  private runs(text: string, font: ProposalFont): Run[] {
    const runs: Run[] = [];
    // Keep complete script words together so fallback font shaping retains conjuncts.
    for (const token of text.normalize("NFC").match(/\s+|\S+/gu) ?? []) {
      const supports = (face: ProposalFont) => Array.from(token).every(char => /\s|[\u200c\u200d]/u.test(char) || this.fontCoverage.get(face)!(char.codePointAt(0)!));
      const selected = supports(font) ? font : supports("fallback") ? "fallback" : null;
      if (!selected) throw new TypeError("The proposal contains characters unsupported by its packaged fonts.");
      const previous = runs.at(-1);
      if (previous?.font === selected) previous.text += token; else runs.push({ text: token, font: selected });
    }
    return runs;
  }
  measure(text: string, size: number, font: ProposalFont = "body", spacing = 0) {
    return this.runs(text, font).reduce((sum, run) => sum + this.doc.font(run.font).fontSize(size).widthOfString(run.text, { characterSpacing: spacing }), 0);
  }
  lines(text: string, width: number, size: number, font: ProposalFont = "body", spacing = 0): string[] {
    const result: string[] = [];
    for (const paragraph of text.replace(/\r/gu, "").split("\n")) {
      let line = "";
      const words = paragraph.split(/\s+/u).filter(Boolean);
      if (!words.length) { result.push(""); continue; }
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.measure(candidate, size, font, spacing) <= width) { line = candidate; continue; }
        if (line) { result.push(line); line = ""; }
        if (this.measure(word, size, font, spacing) <= width) { line = word; continue; }
        for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(word)) {
          if (line && this.measure(line + segment, size, font, spacing) > width) { result.push(line); line = ""; }
          line += segment;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }
  line(text: string, x: number, y: number, width: number, size: number, options: DrawOptions = {}) {
    const font = options.font ?? "body", spacing = options.spacing ?? 0;
    const measured = this.measure(text, size, font, spacing);
    let cursor = x + (options.align === "right" ? width - measured : options.align === "center" ? (width - measured) / 2 : 0);
    for (const run of this.runs(text, font)) {
      const scriptText = /[\u0900-\u097f]/u.test(run.text);
      const runSpacing = scriptText ? 0 : spacing;
      if (scriptText) this.doc.markContent("Span", { actual: run.text, lang: "hi-IN" });
      this.doc.font(run.font).fontSize(size).fillColor(options.color ?? palette.ink)
        .text(run.text, cursor, y, { lineBreak: false, characterSpacing: runSpacing });
      if (scriptText) this.doc.endMarkedContent();
      cursor += this.doc.widthOfString(run.text, { characterSpacing: runSpacing });
    }
  }
  text(text: string, x: number, y: number, width: number, size = 10, options: DrawOptions = {}) {
    const height = options.lineHeight ?? size * 1.6;
    const lines = this.lines(text, width, size, options.font ?? "body", options.spacing ?? 0);
    lines.forEach((line, index) => this.line(line, x, y + index * height, width, size, options));
    return lines.length * height;
  }
  label(text: string, x: number, y: number, width: number = page.widthInside, color: string = palette.gold) {
    return this.text(text.toUpperCase(), x, y, width, 7.2, { font: "medium", color, spacing: 2.2, lineHeight: 11 });
  }
  heading(eyebrow: string, title: string, subtitle?: string) {
    this.label(eyebrow, page.left, page.top);
    const titleHeight = this.text(title, page.left, 81, page.widthInside, 25, { font: "heading", lineHeight: 29 });
    if (subtitle) return 81 + titleHeight + 11 + this.text(subtitle, page.left, 81 + titleHeight + 11, page.widthInside, 10.2, { color: palette.muted, lineHeight: 16 });
    return 81 + titleHeight;
  }
  footers() {
    const count = this.doc.bufferedPageRange().count;
    for (let i = 0; i < count; i++) {
      if (this.nonFooterPages.has(i)) continue;
      this.doc.switchToPage(i);
      this.rule(page.left, page.footer, page.widthInside);
      this.line(this.proposal.terms.company.name.toUpperCase(), page.left, page.footer + 9, 150, 6.2, { color: palette.faint, spacing: 1.1 });
      const center = `${this.proposal.reference} · ${this.clientName}`.toUpperCase();
      const clipped = this.lines(center, 250, 6.2, "body", .8)[0];
      this.line(clipped, 172, page.footer + 9, 250, 6.2, { color: palette.faint, spacing: .8, align: "center" });
      this.line(`${String(i + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`, 470, page.footer + 9, page.right - 470, 6.2, { color: palette.faint, spacing: 1.1, align: "right" });
    }
  }
  finish(): Promise<Buffer> {
    this.footers();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.doc.once("error", reject);
      this.doc.once("end", () => resolve(Buffer.concat(chunks)));
      this.doc.end();
    });
  }
}
