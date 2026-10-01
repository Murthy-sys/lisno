import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildEstimatePlanDocumentManifest, hashPlanDocumentManifest, planDocumentContentRect, resolveDrawingPlacement, validatePlanDocumentPage, type PlanDocumentLineage } from "../src/domain/estimate-plan-document.js";
import { projectAnnotationToCrop, projectAnnotationToPage } from "../src/domain/estimate-plan-review.js";
import { renderEstimatePlanManifestPage } from "../src/services/estimate-plan-document-manifest.js";

function lineage(): PlanDocumentLineage {
  const uploads = [
    { _id: "original", estimateId: "estimate", purpose: "ordinary", uploadedAt: "2026-01-01", originalFilename: "first.pdf", mimeType: "application/pdf", storedFileReference: "original.pdf", sizeBytes: 100 },
    { _id: "second", estimateId: "estimate", purpose: "ordinary", uploadedAt: "2026-01-02", originalFilename: "second.pdf", mimeType: "application/pdf", storedFileReference: "second.pdf", sizeBytes: 200 },
    { _id: "replacement", estimateId: "estimate", purpose: "drawing_replacement", uploadedAt: "2026-01-03", mimeType: "application/pdf", storedFileReference: "replacement.pdf" }
  ];
  const pages = [
    { _id: "page", uploadId: "original", pageNumber: 1, width: 100, height: 100, normalizedFileReference: "base.png" },
    { _id: "missed", uploadId: "original", pageNumber: 2, width: 100, height: 100, normalizedFileReference: "missed.png" },
    { _id: "second-page", uploadId: "second", pageNumber: 1, width: 200, height: 100, normalizedFileReference: "second.png" },
    { _id: "image-asset", uploadId: "original", pageNumber: 3, width: 40, height: 40, normalizedFileReference: "revised.png" },
    { _id: "pdf-asset", uploadId: "replacement", pageNumber: 2, width: 80, height: 80, normalizedFileReference: "pdf-preview.png" },
    { _id: "third-asset", uploadId: "original", pageNumber: 4, width: 40, height: 40, normalizedFileReference: "third.png", sourceKind: "replacement" }
  ];
  const drawings = [
    { _id: "drawing", estimateId: "estimate", uploadId: "original", sourcePageId: "third-asset", active: true },
    { _id: "other", estimateId: "estimate", uploadId: "original", sourcePageId: "page", active: true }
  ];
  const revisions = [
    { _id: "r1", drawingId: "drawing", revisionNumber: 1, sourcePageId: "page", crop: { x: 5, y: 10, width: 40, height: 40 }, croppedFileReference: "first.png" },
    { _id: "r2", drawingId: "drawing", revisionNumber: 2, sourcePageId: "image-asset", crop: { x: 0, y: 0, width: 40, height: 40 }, croppedFileReference: "revised.png", replacesRevisionId: "r1" },
    { _id: "r3", drawingId: "drawing", revisionNumber: 3, sourcePageId: "pdf-asset", crop: { x: 0, y: 0, width: 80, height: 80 }, croppedFileReference: "pdf-preview.png", replacesRevisionId: "r2" },
    { _id: "r4", drawingId: "drawing", revisionNumber: 4, sourcePageId: "third-asset", crop: { x: 0, y: 0, width: 40, height: 40 }, croppedFileReference: "third.png", replacesRevisionId: "r3" },
    { _id: "other-r1", drawingId: "other", revisionNumber: 1, sourcePageId: "page", crop: { x: 60, y: 20, width: 30, height: 40 }, croppedFileReference: "other.png" }
  ];
  return { estimateId: "estimate", uploads, pages, drawings, revisions };
}

describe("canonical plan document lineage", () => {
  it.each([
    { sourceWidth: 80, sourceHeight: 160, width: 160, height: 100, expected: { x: 105, y: 60, width: 50, height: 100 } },
    { sourceWidth: 160, sourceHeight: 80, width: 100, height: 160, expected: { x: 50, y: 115, width: 100, height: 50 } }
  ])("round-trips annotations through the contained $sourceWidth × $sourceHeight content area", ({ sourceWidth, sourceHeight, width, height, expected }) => {
    const patch = buildEstimatePlanDocumentManifest(lineage()).documents[0]!.pages[0]!.patches[0]!;
    patch.destination = { x: 50, y: 60, width, height };
    patch.source.width = sourceWidth + 20;
    patch.source.height = sourceHeight + 40;
    patch.source.crop = { x: 10, y: 20, width: sourceWidth, height: sourceHeight };
    const originalSlot = { ...patch.destination };
    const content = planDocumentContentRect(patch);
    expect(content).toEqual(expected);
    const mark = { id: "mark", type: "rectangle" as const, color: "#ff0000", strokeWidth: 2, x: .2, y: .3, width: .4, height: .2 };
    const page = { width: 1000, height: 500 };
    expect(projectAnnotationToCrop(projectAnnotationToPage(mark, content, page), content, page)).toEqual(mark);
    expect(patch.destination).toEqual(originalSlot);
    expect(planDocumentContentRect({ ...patch, contentChanged: false })).toEqual(originalSlot);
  });

  it("keeps three replacements in the original slot and excludes legacy image assets without dropping undetected pages or a second document", () => {
    const input = lineage();
    const result = buildEstimatePlanDocumentManifest(input);
    expect(result.documents.map((document) => document.sourceUploadId)).toEqual(["original", "second"]);
    expect(result.documents[0]!.pages.map((page) => page.sourcePageId)).toEqual(["page", "missed"]);
    expect(result.documents[1]!.pages[0]!.width).toBe(200);
    expect(result.documents[0]!.pages[0]!.patches[0]).toMatchObject({ revisionId: "r4", originRevisionId: "r1", destination: { x: 5, y: 10, width: 40, height: 40 }, source: { kind: "image", reference: "third.png" } });
    expect(result.documents[0]!.pages[0]!.patches[1]).toMatchObject({ drawingId: "other", revisionId: "other-r1", contentChanged: false });
    const native = resolveDrawingPlacement(input, input.drawings[0]!, "r3");
    expect(native.patch.source).toMatchObject({ kind: "pdf", reference: "replacement.pdf", pageNumber: 2, width: 80 });
    expect(native.patch.destination).toEqual({ x: 5, y: 10, width: 40, height: 40 });
  });

  it("pins exact revision IDs and hashes content identities deterministically", () => {
    const input = lineage();
    const pinned = buildEstimatePlanDocumentManifest(input, ["r2", "other-r1"]);
    expect(pinned.documents[0]!.pages[0]!.patches[0]!.revisionId).toBe("r2");
    expect(pinned.manifestHash).not.toBe(buildEstimatePlanDocumentManifest(input).manifestHash);
    const document = pinned.documents[0]!;
    expect(hashPlanDocumentManifest({ ...document, pages: document.pages.map((page) => ({ ...page })) })).toBe(hashPlanDocumentManifest(document));
  });

  it("accepts mapping revisions and deletion-reopened drafts without repainting native originals", () => {
    const input = lineage();
    const original = input.revisions[0]!;
    const mapping = { ...original, _id: "mapped", revisionNumber: 8, replacesRevisionId: "r1", crop: { x: 6, y: 12, width: 38, height: 38 } };
    const recovered = { ...original, _id: "reopened", revisionNumber: 9 };
    const revised = { ...input, revisions: [...input.revisions, mapping, recovered] };
    expect(resolveDrawingPlacement(revised, input.drawings[0]!, "mapped").patch).toMatchObject({ contentChanged: false, destination: mapping.crop });
    expect(resolveDrawingPlacement(revised, input.drawings[0]!, "reopened").patch.contentChanged).toBe(false);
  });

  it.each(["cycle", "missing", "cross-drawing", "cross-estimate"])("rejects %s ancestry without choosing a substitute page", (kind) => {
    const input = lineage();
    if (kind === "cycle") input.revisions[0]!.replacesRevisionId = "r4";
    if (kind === "missing") input.revisions[1]!.replacesRevisionId = "missing";
    if (kind === "cross-drawing") input.revisions[1]!.replacesRevisionId = "other-r1";
    if (kind === "cross-estimate") input.uploads[2]!.estimateId = "another-estimate";
    expect(() => buildEstimatePlanDocumentManifest(input)).toThrowError(expect.objectContaining({ code: "PLAN_DOCUMENT_LINEAGE_INVALID" }));
  });

  it("rejects overlap and invalid source or destination bounds", () => {
    const page = buildEstimatePlanDocumentManifest(lineage()).documents[0]!.pages[0]!;
    validatePlanDocumentPage(page);
    page.patches[0]!.destination.x = 55;
    expect(() => validatePlanDocumentPage(page)).toThrowError(expect.objectContaining({ code: "PLAN_DOCUMENT_PLACEMENT_CONFLICT" }));
    page.patches[0]!.destination.x = -1;
    expect(() => validatePlanDocumentPage(page)).toThrowError(expect.objectContaining({ code: "PLAN_DOCUMENT_GEOMETRY_INVALID" }));
    page.patches[0]!.destination.x = 5;
    page.patches[0]!.source.crop.width = 41;
    expect(() => validatePlanDocumentPage(page)).toThrowError(expect.objectContaining({ code: "PLAN_DOCUMENT_GEOMETRY_INVALID" }));
  });

  it("makes transparent replacements opaque and preserves pixels outside the original slot", async () => {
    const base = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000000" } }).png().toBuffer();
    const replacement = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const page = buildEstimatePlanDocumentManifest(lineage()).documents[0]!.pages[0]!;
    const rendered = await renderEstimatePlanManifestPage({ read: async (reference) => reference === "base.png" ? base : replacement }, page);
    const { data, info } = await sharp(rendered).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(pixel(10, 15)).toEqual([255, 255, 255]);
    expect(pixel(4, 15)).toEqual([0, 0, 0]);
    expect(pixel(65, 25)).toEqual([0, 0, 0]);
  });

  it("accepts different replacement proportions even in a small fixed slot without changing either crop", () => {
    const page = buildEstimatePlanDocumentManifest(lineage()).documents[0]!.pages[0]!;
    const patch = page.patches[0]!;
    patch.destination = { x: 5, y: 10, width: 2, height: 2 };
    patch.source.width = 4;
    patch.source.height = 2;
    patch.source.crop = { x: 0, y: 0, width: 4, height: 2 };
    const before = structuredClone(page);
    expect(() => validatePlanDocumentPage(page)).not.toThrow();
    expect(page).toEqual(before);
  });
});
