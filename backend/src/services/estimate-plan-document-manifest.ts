import type { ClientSession } from "mongoose";
import sharp, { type OverlayOptions } from "sharp";
import type { PlanDocumentPage } from "../contracts/estimate-plan-document.js";
import { buildEstimatePlanDocumentManifest, validatePlanDocumentPage, type PlanDocumentLineage } from "../domain/estimate-plan-document.js";
import { ApiError } from "../middleware/errors.js";
import type { Storage } from "../storage/storage.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";

export async function loadEstimatePlanDocumentLineage(estimateId: string, session?: ClientSession): Promise<PlanDocumentLineage> {
  // Transactional callers must perform Mongo operations sequentially on their session.
  const uploads = await EstimateDesignUploadModel.find({ estimateId }).sort({ uploadedAt: 1, _id: 1 }).session(session ?? null).lean();
  const pages = await EstimateDesignSourcePageModel.find({ uploadId: { $in: uploads.map((upload) => upload._id) } }).session(session ?? null).lean();
  const drawings = await EstimateDesignDrawingModel.find({ estimateId }).sort({ _id: 1 }).session(session ?? null).lean();
  const revisions = await EstimateDesignRevisionModel.find({ drawingId: { $in: drawings.map((drawing) => drawing._id) } }).sort({ drawingId: 1, revisionNumber: 1 }).session(session ?? null).lean();
  return { estimateId, uploads, pages, drawings, revisions };
}

/** Internal only: callers enforce the applicable staff or pinned-round authorization. */
export async function loadEstimatePlanDocumentManifest(estimateId: string, options: { session?: ClientSession; revisionIds?: readonly string[] } = {}) {
  return buildEstimatePlanDocumentManifest(await loadEstimatePlanDocumentLineage(estimateId, options.session), options.revisionIds);
}

export async function renderEstimatePlanManifestPage(storage: Pick<Storage, "read">, page: PlanDocumentPage): Promise<Buffer> {
  validatePlanDocumentPage(page);
  const base = await storage.read(page.basePageReference);
  const metadata = await sharp(base, { limitInputPixels: 40_000_000 }).metadata();
  if (metadata.width !== page.width || metadata.height !== page.height) {
    throw new ApiError(409, "PLAN_DOCUMENT_GEOMETRY_INVALID", "The plan preview dimensions do not match the source page.");
  }
  const layers: OverlayOptions[] = [];
  for (const patch of page.patches) {
    if (!patch.contentChanged) continue;
    const bytes = await storage.read(patch.source.croppedFileReference);
    const sourceMetadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (sourceMetadata.width !== patch.source.crop.width || sourceMetadata.height !== patch.source.crop.height) {
      throw new ApiError(409, "PLAN_DOCUMENT_GEOMETRY_INVALID", "The revised drawing preview does not match its source crop. Re-upload the revised drawing.");
    }
    const { x, y, width, height } = patch.destination;
    if (![x, y, width, height].every(Number.isInteger)) {
      throw new ApiError(409, "PLAN_DOCUMENT_GEOMETRY_INVALID", "Drawing preview crops must use whole pixels.");
    }
    const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .flatten({ background: "#ffffff" })
      .resize({ width, height, fit: "contain", background: "#ffffff" })
      .png().toBuffer();
    layers.push({ input: image, left: x, top: y });
  }
  return sharp(base, { limitInputPixels: 40_000_000 }).composite(layers).png().toBuffer();
}
