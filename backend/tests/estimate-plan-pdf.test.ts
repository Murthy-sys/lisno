import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PlanDocumentManifest, PlanDocumentPage } from "../src/contracts/estimate-plan-document.js";
import { renderPlanDocumentPdf } from "../src/services/estimate-plan-pdf.js";
import { renderEstimatePlanManifestPage } from "../src/services/estimate-plan-document-manifest.js";

const rotations = [0, 90, 180, 270];
const outputDirectory = "/tmp/lisno-requested-item-full-pdf/renderer";
const destination = { x: 50, y: 60, width: 160, height: 100 };
const sourceCrop = { x: 30, y: 40, width: 160, height: 100 };
type Matrix = [number, number, number, number, number, number];

async function render(bytes: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)) }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.context, viewport }).promise;
    const png = canvas.canvas.toBuffer("image/png") as Buffer;
    const text = (await page.getTextContent()).items.flatMap((item) => "str" in item ? [item.str] : []).join(" ");
    pages.push({ png, text });
    pdf.canvasFactory.destroy(canvas);
  }
  await pdf.destroy();
  return pages;
}

async function fixture() {
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  // Fixed independently calculated transforms locate an upright 160x100 slot
  // inside a nonzero CropBox for each original page rotation.
  const destinationMatrices: Matrix[] = [
    [1, 0, 0, 1, 90, 250], [0, 1, -1, 0, 200, 100],
    [-1, 0, 0, -1, 490, 210], [0, -1, 1, 0, 380, 360]
  ];
  for (const [index, rotation] of rotations.entries()) {
    const page = original.addPage([640, 520]);
    page.setMediaBox(20, 30, 640, 520); page.setCropBox(40, 50, 500, 360); page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 20, y: 30, width: 640, height: 520, color: rgb(.93, .94, .95) });
    for (let x = 40; x < 540; x += 10) page.drawLine({ start: { x, y: 50 }, end: { x, y: 410 }, thickness: .3, color: rgb(.4, .4, .4) });
    page.drawText(`PRESERVED NATIVE TEXT ${rotation}`, { x: 250, y: 300, size: 8, font });
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...destinationMatrices[index]!));
    page.drawRectangle({ x: 0, y: 0, width: 160, height: 100, color: rgb(.9, .1, .1) });
    page.drawText("OBSOLETE", { x: 8, y: 45, size: 15, font });
    page.pushOperators(popGraphicsState());
  }
  original.addPage([333, 222]).drawText("UNTOUCHED OCR MISSED PAGE", { x: 20, y: 100, size: 10, font });
  const originalBytes = Buffer.from(await original.save());
  const source = await PDFDocument.create();
  const sourceFont = await source.embedFont(StandardFonts.Helvetica);
  const sourceMatrices: Matrix[] = [
    [1, 0, 0, 1, 90, 160], [0, 1, -1, 0, 200, 110],
    [-1, 0, 0, -1, 330, 220], [0, -1, 1, 0, 220, 270]
  ];
  for (const [index, rotation] of rotations.entries()) {
    const page = source.addPage([400, 340]);
    page.setMediaBox(20, 30, 400, 340); page.setCropBox(60, 80, 300, 220); page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 20, y: 30, width: 400, height: 340, color: rgb(1, 0, 1) });
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...sourceMatrices[index]!));
    page.drawRectangle({ x: 0, y: 0, width: 160, height: 100, color: rgb(1, 1, 1) });
    page.drawText(`NATIVE REV ${rotation}`, { x: 8, y: 65, size: 9, font: sourceFont });
    page.drawLine({ start: { x: 8, y: 50 }, end: { x: 150, y: 50 }, thickness: .2, color: rgb(0, 0, 0) });
    page.drawCircle({ x: 25, y: 25, size: 10, color: rgb(.1, .3, .8) });
    page.drawRectangle({ x: 135, y: 80, width: 20, height: 15, color: rgb(.1, .7, .2) });
    page.pushOperators(popGraphicsState());
  }
  const sourceBytes = Buffer.from(await source.save());
  const png = await sharp({ create: { width: 160, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="160" height="100"><circle cx="25" cy="75" r="10" fill="#1a4dcc"/><rect x="135" y="5" width="20" height="15" fill="#1ab233"/></svg>') }]).png().toBuffer();
  const originals = await render(originalBytes);
  const sources = await render(sourceBytes);
  const assets = new Map<string, Buffer>([["original.pdf", originalBytes], ["replacement.pdf", sourceBytes], ["image.png", png]]);
  for (const [index, page] of originals.entries()) assets.set(`base-${index}.png`, page.png);
  for (const [index, page] of sources.entries()) assets.set(`crop-${index}.png`, await sharp(page.png).extract({ left: 30, top: 40, width: 160, height: 100 }).png().toBuffer());
  const manifest: PlanDocumentManifest = {
    schemaVersion: 1, rendererVersion: 1, estimateId: "estimate", sourceUploadId: "upload", originalFilename: "plan.pdf",
    originalMimeType: "application/pdf", originalFileReference: "original.pdf", originalSizeBytes: originalBytes.length,
    pages: [...rotations.map((rotation, index): PlanDocumentPage => ({
      sourcePageId: `page-${index}`, pageNumber: index + 1, width: rotation % 180 === 0 ? 500 : 360, height: rotation % 180 === 0 ? 360 : 500,
      basePageReference: `base-${index}.png`, patches: []
    })), { sourcePageId: "missed", pageNumber: 5, width: 333, height: 222, basePageReference: "base-4.png", patches: [] }]
  };
  return { manifest, assets, originals, originalBytes, storage: { read: async (reference: string) => { const bytes = assets.get(reference); if (!bytes) throw new Error("missing fixture"); return bytes; } } };
}

describe("native revised plan PDF", () => {
  it.each([
    { kind: "image", shape: "portrait", width: 80, height: 160, slotWidth: 160, slotHeight: 100 },
    { kind: "pdf", shape: "portrait", width: 80, height: 160, slotWidth: 160, slotHeight: 100 },
    { kind: "image", shape: "landscape", width: 160, height: 80, slotWidth: 100, slotHeight: 160 },
    { kind: "pdf", shape: "landscape", width: 160, height: 80, slotWidth: 100, slotHeight: 160 }
  ] as const)("fits a complete $shape $kind into the opposite slot proportions with white padding", async ({ kind, shape, width, height, slotWidth, slotHeight }) => {
    const slot = { x: 50, y: 60, width: slotWidth, height: slotHeight };
    const original = await PDFDocument.create();
    const font = await original.embedFont(StandardFonts.Helvetica);
    const originalPage = original.addPage([300, 300]);
    originalPage.drawRectangle({ x: 0, y: 0, width: 300, height: 300, color: rgb(.8, .85, .9) });
    originalPage.drawRectangle({ x: slot.x, y: 300 - slot.y - slot.height, width: slot.width, height: slot.height, color: rgb(.9, .1, .1) });
    originalPage.drawText("OBSOLETE", { x: slot.x + 5, y: 300 - slot.y - 20, size: 10, font });
    originalPage.drawText("PRESERVED NATIVE TEXT", { x: 20, y: 20, size: 9, font });
    const originalBytes = Buffer.from(await original.save());
    const before = (await render(originalBytes))[0]!;
    const corners = [{ x: 4, y: 4 }, { x: width - 16, y: 4 }, { x: 4, y: height - 16 }, { x: width - 16, y: height - 16 }];
    const assets = new Map<string, Buffer>([["original.pdf", originalBytes], ["base.png", before.png]]);
    let source: PlanDocumentPage["patches"][number]["source"];
    if (kind === "image") {
      const image = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="16" fill="#1a4dcc"/>${corners.map(({ x, y }) => `<rect x="${x}" y="${y}" width="12" height="12" fill="#1ab233"/>`).join("")}</svg>`) }]).png().toBuffer();
      assets.set("replacement.png", image);
      source = { kind, reference: "replacement.png", pageNumber: 1, width, height, crop: { x: 0, y: 0, width, height }, croppedFileReference: "replacement.png" };
    } else {
      const replacement = await PDFDocument.create();
      const sourceFont = await replacement.embedFont(StandardFonts.Helvetica);
      const page = replacement.addPage([width + 40, height + 60]);
      page.drawRectangle({ x: 0, y: 0, width: width + 40, height: height + 60, color: rgb(1, 0, 1) });
      page.drawRectangle({ x: 20, y: 30, width, height, color: rgb(1, 1, 1) });
      page.drawCircle({ x: 20 + width / 2, y: 30 + height / 2, size: 16, color: rgb(.1, .3, .8) });
      for (const corner of corners) page.drawRectangle({ x: 20 + corner.x, y: 30 + height - corner.y - 12, width: 12, height: 12, color: rgb(.1, .7, .2) });
      page.drawText("NATIVE FIT", { x: 40, y: 30 + height - 30, size: 6, font: sourceFont });
      const sourceBytes = Buffer.from(await replacement.save());
      assets.set("replacement.pdf", sourceBytes);
      assets.set("replacement-crop.png", await sharp((await render(sourceBytes))[0]!.png).extract({ left: 20, top: 30, width, height }).png().toBuffer());
      source = { kind, reference: "replacement.pdf", pageNumber: 1, width: width + 40, height: height + 60, crop: { x: 20, y: 30, width, height }, croppedFileReference: "replacement-crop.png" };
    }
    const manifest: PlanDocumentManifest = {
      schemaVersion: 1, rendererVersion: 1, estimateId: "estimate", sourceUploadId: "upload", originalFilename: "plan.pdf",
      originalMimeType: "application/pdf", originalFileReference: "original.pdf", originalSizeBytes: originalBytes.length,
      pages: [{ sourcePageId: "page", pageNumber: 1, width: 300, height: 300, basePageReference: "base.png", patches: [{ drawingId: "drawing", revisionId: "revision-2", originRevisionId: "revision-1", destination: slot, contentChanged: true, source }] }]
    };
    const storage = { read: async (reference: string) => assets.get(reference)! };
    const bytes = await renderPlanDocumentPdf(manifest, storage);
    const revised = (await render(bytes))[0]!;
    const originalPixels = await sharp(before.png).removeAlpha().raw().toBuffer();
    const pixels = await sharp(revised.png).removeAlpha().raw().toBuffer();
    const pixel = (x: number, y: number) => [...pixels.subarray((Math.floor(y) * 300 + Math.floor(x)) * 3, (Math.floor(y) * 300 + Math.floor(x)) * 3 + 3)];
    let outsideDifferences = 0;
    let oldRedPixels = 0;
    let sourceBleedPixels = 0;
    let nonwhitePaddingPixels = 0;
    const scale = Math.min(slot.width / width, slot.height / height);
    const fittedX = slot.x + (slot.width - width * scale) / 2;
    const fittedY = slot.y + (slot.height - height * scale) / 2;
    const blueX: number[] = [];
    const blueY: number[] = [];
    for (let y = 0; y < 300; y += 1) for (let x = 0; x < 300; x += 1) {
      const at = (y * 300 + x) * 3;
      const inside = x >= slot.x && x < slot.x + slot.width && y >= slot.y && y < slot.y + slot.height;
      if (!inside) {
        if (pixels.subarray(at, at + 3).some((value, channel) => value !== originalPixels[at + channel])) outsideDifferences += 1;
        continue;
      }
      const [r, g, b] = pixels.subarray(at, at + 3);
      if ((x < fittedX - 1 || x > fittedX + width * scale || y < fittedY - 1 || y > fittedY + height * scale) &&
          (r !== 255 || g !== 255 || b !== 255)) nonwhitePaddingPixels += 1;
      if (r! > 180 && g! < 70 && b! < 70) oldRedPixels += 1;
      if (r! > 220 && g! < 50 && b! > 220) sourceBleedPixels += 1;
      if (r! < 80 && g! < 130 && b! > 150) { blueX.push(x); blueY.push(y); }
    }
    expect(outsideDifferences).toBe(0);
    expect(oldRedPixels).toBe(0);
    expect(sourceBleedPixels).toBe(0);
    expect(nonwhitePaddingPixels).toBe(0);
    // Corner markers prove the complete image survives; the round marker proves uniform scale.
    for (const corner of corners) {
      const [r, g, b] = pixel(fittedX + (corner.x + 6) * scale, fittedY + (corner.y + 6) * scale);
      expect(r).toBeLessThan(80); expect(g).toBeGreaterThan(140); expect(b).toBeLessThan(100);
    }
    const circleWidth = Math.max(...blueX) - Math.min(...blueX) + 1;
    const circleHeight = Math.max(...blueY) - Math.min(...blueY) + 1;
    expect(Math.abs(circleWidth - circleHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(circleWidth - 32 * scale)).toBeLessThanOrEqual(2);
    expect(shape === "portrait" ? pixel(slot.x + 5, slot.y + slot.height / 2) : pixel(slot.x + slot.width / 2, slot.y + 5)).toEqual([255, 255, 255]);
    expect(revised.text).toContain("PRESERVED NATIVE TEXT");
    if (kind === "pdf") expect(revised.text).toContain("NATIVE FIT");
    expect(assets.get("original.pdf")).toEqual(originalBytes);
    const preview = await renderEstimatePlanManifestPage(storage, manifest.pages[0]!);
    const previewPixels = await sharp(preview).removeAlpha().raw().toBuffer();
    let largeDifferences = 0;
    for (let at = 0; at < previewPixels.length; at += 3) if ([0, 1, 2].some((channel) => Math.abs(previewPixels[at + channel]! - pixels[at + channel]!) > 25)) largeDifferences += 1;
    expect(largeDifferences).toBeLessThan(180);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(`${outputDirectory}/contained-${shape}-${kind}.pdf`, bytes);
    await writeFile(`${outputDirectory}/contained-${shape}-${kind}.png`, revised.png);
    await writeFile(`${outputDirectory}/contained-${shape}-${kind}-preview.png`, preview);
  });

  it.each(["image", "pdf"] as const)("preserves native pages and replaces rotated crops using %s content", async (kind) => {
    const { manifest, storage, originals, originalBytes, assets } = await fixture();
    for (let index = 0; index < 4; index += 1) {
      const sourceIndex = (index + 1) % 4;
      const sourceRotation = rotations[sourceIndex]!;
      manifest.pages[index]!.patches = [{
        drawingId: `drawing-${index}`, revisionId: "revision-4", originRevisionId: "revision-1", destination, contentChanged: true,
        source: kind === "image"
          ? { kind, reference: "image.png", pageNumber: 1, width: 160, height: 100, crop: { x: 0, y: 0, width: 160, height: 100 }, croppedFileReference: "image.png" }
          : { kind, reference: "replacement.pdf", pageNumber: sourceIndex + 1, width: sourceRotation % 180 === 0 ? 300 : 220, height: sourceRotation % 180 === 0 ? 220 : 300, crop: sourceCrop, croppedFileReference: `crop-${sourceIndex}.png` }
      }];
    }
    const bytes = await renderPlanDocumentPdf(manifest, storage);
    expect(await renderPlanDocumentPdf(manifest, storage)).toEqual(bytes);
    if (kind === "pdf") {
      const scaled = structuredClone(manifest);
      for (const page of scaled.pages) {
        page.width *= 2; page.height *= 2;
        for (const patch of page.patches) {
          patch.destination = { ...patch.destination };
          patch.source.crop = { ...patch.source.crop };
          for (const key of ["x", "y", "width", "height"] as const) { patch.destination[key] *= 2; patch.source.crop[key] *= 2; }
          patch.source.width *= 2; patch.source.height *= 2;
        }
      }
      expect(await renderPlanDocumentPdf(scaled, storage)).toEqual(bytes);
    }
    expect(assets.get("original.pdf")).toEqual(originalBytes);
    const revised = await render(bytes);
    const pdf = await PDFDocument.load(bytes);
    const originalPdf = await PDFDocument.load(originalBytes);
    expect(revised).toHaveLength(5);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(`${outputDirectory}/original.pdf`, originalBytes);
    await writeFile(`${outputDirectory}/revised-${kind}.pdf`, bytes);
    for (let index = 0; index < 5; index += 1) {
      expect(pdf.getPage(index).getMediaBox()).toEqual(originalPdf.getPage(index).getMediaBox());
      expect(pdf.getPage(index).getCropBox()).toEqual(originalPdf.getPage(index).getCropBox());
      expect(pdf.getPage(index).getRotation()).toEqual(originalPdf.getPage(index).getRotation());
      const before = await sharp(originals[index]!.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const after = await sharp(revised[index]!.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(after.info).toEqual(before.info);
      let outsideDifferences = 0;
      let changedPixels = 0;
      let oldRedPixels = 0;
      let sourceBleedPixels = 0;
      for (let y = 0; y < after.info.height; y += 1) for (let x = 0; x < after.info.width; x += 1) {
        const at = (y * after.info.width + x) * 3;
        const changed = after.data.subarray(at, at + 3).some((value, channel) => value !== before.data[at + channel]);
        const inside = index < 4 && x >= 50 && x < 210 && y >= 60 && y < 160;
        if (inside) {
          if (changed) changedPixels += 1;
          const [r, g, b] = after.data.subarray(at, at + 3);
          if (r! > 180 && g! < 70 && b! < 70) oldRedPixels += 1;
          if (r! > 220 && g! < 50 && b! > 220) sourceBleedPixels += 1;
        } else if (changed) outsideDifferences += 1;
      }
      expect(outsideDifferences).toBe(0);
      expect(oldRedPixels).toBe(0);
      expect(sourceBleedPixels).toBe(0);
      if (index < 4) {
        expect(changedPixels).toBeGreaterThan(15000);
        expect(revised[index]!.text).toContain(`PRESERVED NATIVE TEXT ${rotations[index]}`);
        if (kind === "pdf") expect(revised[index]!.text).toContain("NATIVE REV");
        const preview = await renderEstimatePlanManifestPage(storage, manifest.pages[index]!);
        const previewRaw = await sharp(preview).removeAlpha().raw().toBuffer();
        let largeDifferences = 0;
        for (let at = 0; at < previewRaw.length; at += 3) if ([0, 1, 2].some((channel) => Math.abs(previewRaw[at + channel]! - after.data[at + channel]!) > 25)) largeDifferences += 1;
        expect(largeDifferences).toBeLessThan(450);
        await writeFile(`${outputDirectory}/preview-${kind}-${index}.png`, preview);
      }
      await writeFile(`${outputDirectory}/original-${index}.png`, originals[index]!.png);
      await writeFile(`${outputDirectory}/revised-${kind}-${index}.png`, revised[index]!.png);
    }
  });

  it("reuses unchanged PDF bytes and rejects missing pages or corrupt sources", async () => {
    const { manifest, storage, originalBytes, assets } = await fixture();
    expect(await renderPlanDocumentPdf(manifest, storage)).toEqual(originalBytes);
    manifest.pages.pop();
    await expect(renderPlanDocumentPdf(manifest, storage)).rejects.toMatchObject({ code: "PLAN_DOCUMENT_GEOMETRY_INVALID" });
    manifest.pages = manifest.pages.slice(0, 1);
    assets.set("original.pdf", Buffer.from("corrupt PDF"));
    await expect(renderPlanDocumentPdf(manifest, storage)).rejects.toMatchObject({ code: "PLAN_DOCUMENT_PDF_INVALID" });
  });

  it("wraps image originals without changing their proportions", async () => {
    const image = await sharp({ create: { width: 300, height: 100, channels: 3, background: "#123456" } }).png().toBuffer();
    const manifest: PlanDocumentManifest = {
      schemaVersion: 1, rendererVersion: 1, estimateId: "estimate", sourceUploadId: "image-upload", originalFilename: "image.png", originalMimeType: "image/png", originalFileReference: "image.png", originalSizeBytes: image.length,
      pages: [{ sourcePageId: "image-page", pageNumber: 1, width: 300, height: 100, basePageReference: "image.png", patches: [] }]
    };
    const bytes = await renderPlanDocumentPdf(manifest, { read: async () => image });
    expect(await renderPlanDocumentPdf(manifest, { read: async () => image })).toEqual(bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 300, height: 100 });
    const rendered = await render(bytes);
    const pixel = await sharp(rendered[0]!.png).removeAlpha().raw().toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([0x12, 0x34, 0x56]);
  });

  it("rejects editable PDF annotations that could otherwise remain over the replacement", async () => {
    const { manifest, storage, assets } = await fixture();
    const original = await PDFDocument.load(assets.get("original.pdf")!);
    const field = original.getForm().createTextField("editable-drawing-note");
    field.setText("old note");
    field.addToPage(original.getPage(0), { x: 90, y: 250, width: 80, height: 20 });
    assets.set("original.pdf", Buffer.from(await original.save()));
    manifest.pages[0]!.patches = [{
      drawingId: "drawing", revisionId: "revision-2", originRevisionId: "revision-1", destination, contentChanged: true,
      source: { kind: "image", reference: "image.png", pageNumber: 1, width: 160, height: 100, crop: { x: 0, y: 0, width: 160, height: 100 }, croppedFileReference: "image.png" }
    }];
    await expect(renderPlanDocumentPdf(manifest, storage)).rejects.toMatchObject({ code: "PLAN_DOCUMENT_PDF_ANNOTATIONS_UNSUPPORTED" });
  });

  it("rejects a tiny square extraction preview for a two-to-one native PDF page", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([4, 2]);
    const bytes = Buffer.from(await pdf.save());
    const manifest: PlanDocumentManifest = {
      schemaVersion: 1, rendererVersion: 1, estimateId: "estimate", sourceUploadId: "tiny-upload", originalFilename: "tiny.pdf",
      originalMimeType: "application/pdf", originalFileReference: "tiny.pdf", originalSizeBytes: bytes.length,
      pages: [{ sourcePageId: "tiny-page", pageNumber: 1, width: 2, height: 2, basePageReference: "tiny.png", patches: [] }]
    };
    await expect(renderPlanDocumentPdf(manifest, { read: async () => bytes })).rejects.toMatchObject({ code: "PLAN_DOCUMENT_GEOMETRY_INVALID" });
  });

  it("still rejects replacement PDF metadata that misrepresents the native page proportions", async () => {
    const { manifest, storage } = await fixture();
    manifest.pages[0]!.patches = [{
      drawingId: "drawing", revisionId: "revision-2", originRevisionId: "revision-1", destination, contentChanged: true,
      source: { kind: "pdf", reference: "replacement.pdf", pageNumber: 1, width: 300, height: 300, crop: sourceCrop, croppedFileReference: "crop-0.png" }
    }];
    await expect(renderPlanDocumentPdf(manifest, storage)).rejects.toMatchObject({ code: "PLAN_DOCUMENT_GEOMETRY_INVALID" });
  });
});
