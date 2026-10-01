import { createHash } from "node:crypto";
import type { PlanDocumentManifest, PlanDocumentManifestSet, PlanDocumentPage, PlanDocumentPatch, PlanDocumentRect } from "../contracts/estimate-plan-document.js";
import { ApiError } from "../middleware/errors.js";
import { deriveEstimateDesignUploadPurpose } from "./estimate-design.js";

type Row = Record<string, any>;
export interface PlanDocumentLineage {
  estimateId: string;
  uploads: readonly Row[];
  pages: readonly Row[];
  drawings: readonly Row[];
  revisions: readonly Row[];
}

function invalidLineage(message: string): never {
  throw new ApiError(409, "PLAN_DOCUMENT_LINEAGE_INVALID", message);
}

export function validatePlanDocumentRect(rect: PlanDocumentRect, width: number, height: number) {
  if (![width, height, rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      width <= 0 || height <= 0 || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
      rect.x + rect.width > width || rect.y + rect.height > height) {
    throw new ApiError(409, "PLAN_DOCUMENT_GEOMETRY_INVALID", "A drawing region is outside its source page. Correct the crop and prepare the plan again.");
  }
}

/** Annotation coordinates use the visible content, while masking keeps the full destination. */
export function planDocumentContentRect(patch: Pick<PlanDocumentPatch, "destination" | "source" | "contentChanged">): PlanDocumentRect {
  const { destination, source } = patch;
  if (!patch.contentChanged) return { ...destination };
  const scale = Math.min(destination.width / source.crop.width, destination.height / source.crop.height);
  const width = Math.min(destination.width, source.crop.width * scale);
  const height = Math.min(destination.height, source.crop.height * scale);
  return {
    x: destination.x + (destination.width - width) / 2,
    y: destination.y + (destination.height - height) / 2,
    width,
    height
  };
}

export function validatePlanDocumentPage(page: PlanDocumentPage) {
  const ids = new Set<string>();
  for (const patch of page.patches) {
    if (ids.has(patch.drawingId)) invalidLineage("A plan page contains duplicate drawing identities.");
    ids.add(patch.drawingId);
    validatePlanDocumentRect(patch.destination, page.width, page.height);
    validatePlanDocumentRect(patch.source.crop, patch.source.width, patch.source.height);
    if (!patch.contentChanged) continue;
    // Replacements fit uniformly inside this fixed slot; any spare area is opaque white.
    for (const other of page.patches) {
      if (other.drawingId === patch.drawingId) continue;
      const a = patch.destination;
      const b = other.destination;
      if (Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
          Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)) {
        throw new ApiError(409, "PLAN_DOCUMENT_PLACEMENT_CONFLICT", "A revised drawing overlaps another drawing. Correct the original placements before preparing the plan.");
      }
    }
  }
}

/** Resolve the complete immutable ancestry; mutable drawing.sourcePageId is never a destination. */
export function resolveDrawingPlacement(input: PlanDocumentLineage, drawing: Row, revisionId: string) {
  if (String(drawing.estimateId) !== input.estimateId) invalidLineage("A drawing belongs to a different estimate.");
  const revisions = new Map(input.revisions.map((row) => [String(row._id), row]));
  const pages = new Map(input.pages.map((row) => [String(row._id), row]));
  const uploads = new Map(input.uploads.map((row) => [String(row._id), row]));
  const chain: Row[] = [];
  const seen = new Set<string>();
  let id: string | null = revisionId;
  while (id) {
    if (seen.has(id)) invalidLineage("The drawing revision history contains a cycle.");
    seen.add(id);
    const revision = revisions.get(id);
    if (!revision || String(revision.drawingId) !== String(drawing._id)) invalidLineage("The drawing revision history is missing or belongs to another drawing.");
    if (chain.length && Number(revision.revisionNumber) >= Number(chain[chain.length - 1]!.revisionNumber)) invalidLineage("The drawing revision history is not ordered.");
    const page = pages.get(String(revision.sourcePageId));
    const upload = page && uploads.get(String(page.uploadId));
    if (!page || !upload || String(upload.estimateId) !== input.estimateId) invalidLineage("A drawing source is missing or belongs to another estimate.");
    validatePlanDocumentRect(revision.crop, Number(page.width), Number(page.height));
    chain.push(revision);
    id = revision.replacesRevisionId ? String(revision.replacesRevisionId) : null;
  }
  chain.reverse();
  const root = chain[0]!;
  const originPage = pages.get(String(root.sourcePageId))!;
  const originUpload = uploads.get(String(originPage.uploadId))!;
  if (String(originUpload._id) !== String(drawing.uploadId) || originPage.sourceKind === "replacement" || deriveEstimateDesignUploadPurpose(originUpload) !== "ordinary") {
    invalidLineage("The original drawing placement cannot be established. Re-upload the original plan or repair its revision history.");
  }
  // Crop corrections made before the first asset replacement define its original slot.
  let origin = root;
  for (const revision of chain.slice(1)) {
    if (String(revision.sourcePageId) !== String(originPage._id)) break;
    origin = revision;
  }
  const revision = chain[chain.length - 1]!;
  const sourcePage = pages.get(String(revision.sourcePageId))!;
  const sourceUpload = uploads.get(String(sourcePage.uploadId))!;
  const contentChanged = String(sourcePage._id) !== String(originPage._id);
  // Immediate image replacements were historically stored under their original PDF upload.
  const immediateImage = contentChanged && String(sourceUpload._id) === String(originUpload._id);
  const nativePdf = !immediateImage && sourceUpload.mimeType === "application/pdf";
  const patch: PlanDocumentPatch = {
    drawingId: String(drawing._id), revisionId, originRevisionId: String(origin._id),
    destination: { ...origin.crop }, contentChanged,
    source: {
      kind: nativePdf ? "pdf" : "image",
      reference: nativePdf ? String(sourceUpload.storedFileReference) : String(sourcePage.normalizedFileReference),
      pageNumber: Number(sourcePage.pageNumber), width: Number(sourcePage.width), height: Number(sourcePage.height),
      crop: { ...revision.crop }, croppedFileReference: String(revision.croppedFileReference)
    }
  };
  return { originPage, originUpload, sourcePage, sourceUpload, revision, patch };
}

export function originalPlanDocumentPages(input: PlanDocumentLineage) {
  const revisions = new Map(input.revisions.map((row) => [String(row._id), row]));
  const replacementPages = new Set(input.pages.filter((page) => page.sourceKind === "replacement").map((page) => String(page._id)));
  for (const revision of input.revisions) {
    const parent = revisions.get(String(revision.replacesRevisionId));
    if (parent && String(parent.drawingId) === String(revision.drawingId) && String(parent.sourcePageId) !== String(revision.sourcePageId)) {
      replacementPages.add(String(revision.sourcePageId));
    }
  }
  const originalUploads = new Set(input.uploads.filter((upload) => !upload.deletedAt && deriveEstimateDesignUploadPurpose(upload) === "ordinary").map((upload) => String(upload._id)));
  return input.pages.filter((page) => originalUploads.has(String(page.uploadId)) && !replacementPages.has(String(page._id)));
}

export function buildEstimatePlanDocumentManifest(input: PlanDocumentLineage, revisionIds?: readonly string[]): PlanDocumentManifestSet {
  const pinned = revisionIds ? new Set(revisionIds) : null;
  if (pinned && pinned.size !== revisionIds!.length) invalidLineage("The submitted drawing revision set contains duplicates.");
  const selected = new Map<string, Row>();
  for (const revision of input.revisions) {
    if (pinned && !pinned.has(String(revision._id))) continue;
    const previous = selected.get(String(revision.drawingId));
    if (pinned && previous) invalidLineage("The submitted drawing revision set contains multiple revisions of one drawing.");
    if (!previous || Number(previous.revisionNumber) < Number(revision.revisionNumber)) selected.set(String(revision.drawingId), revision);
  }
  if (pinned && selected.size !== pinned.size) invalidLineage("A submitted drawing revision is missing.");
  const placements = input.drawings.filter((drawing) => pinned ? selected.has(String(drawing._id)) : drawing.active && !drawing.deletedAt).map((drawing) => {
    const revision = selected.get(String(drawing._id));
    if (!revision) invalidLineage("An active drawing has no revision history.");
    return resolveDrawingPlacement(input, drawing, String(revision._id));
  });
  if (pinned && placements.length !== pinned.size) invalidLineage("A submitted drawing identity is missing.");
  const originalPages = originalPlanDocumentPages(input);
  const originalPageIds = new Set(originalPages.map((page) => String(page._id)));
  for (const placement of placements) {
    if (!originalPageIds.has(String(placement.originPage._id)) || placement.sourceUpload.deletedAt) invalidLineage("A drawing references a removed or ambiguous source plan.");
  }
  const pinnedUploads = pinned ? new Set(placements.map((placement) => String(placement.originUpload._id))) : null;
  const uploads = input.uploads.filter((upload) => !upload.deletedAt && deriveEstimateDesignUploadPurpose(upload) === "ordinary" && (!pinnedUploads || pinnedUploads.has(String(upload._id))));
  uploads.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime() || String(a._id).localeCompare(String(b._id)));
  const documents: PlanDocumentManifest[] = uploads.map((upload) => ({
    schemaVersion: 1, rendererVersion: 1, estimateId: input.estimateId, sourceUploadId: String(upload._id),
    originalFilename: String(upload.originalFilename), originalMimeType: String(upload.mimeType),
    originalFileReference: String(upload.storedFileReference), originalSizeBytes: Number(upload.sizeBytes),
    pages: originalPages.filter((page) => String(page.uploadId) === String(upload._id))
      .sort((a, b) => Number(a.pageNumber) - Number(b.pageNumber) || String(a._id).localeCompare(String(b._id)))
      .map((page) => ({
        sourcePageId: String(page._id), pageNumber: Number(page.pageNumber), width: Number(page.width), height: Number(page.height),
        basePageReference: String(page.normalizedFileReference),
        patches: placements.filter((placement) => String(placement.originPage._id) === String(page._id)).map((placement) => placement.patch).sort((a, b) => a.drawingId.localeCompare(b.drawingId))
      }))
  }));
  return { documents, manifestHash: hashPlanDocumentManifestSet(documents) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function hashPlanDocumentManifest(manifest: PlanDocumentManifest): string {
  return createHash("sha256").update(JSON.stringify(canonical(manifest))).digest("hex");
}

export function hashPlanDocumentManifestSet(documents: readonly PlanDocumentManifest[]): string {
  return createHash("sha256").update(JSON.stringify(documents.map(hashPlanDocumentManifest))).digest("hex");
}
