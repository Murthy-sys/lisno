import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { isEstimateDesignEditable, type EstimateDesignExtractionStatus } from "../domain/estimate-design.js";
import { ApiError } from "../middleware/errors.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import type { PublicUser as AuthenticatedUser } from "./auth.service.js";
import type { Storage } from "../storage/storage.js";

export interface CreateEstimateDesignServiceInput {
  storage: Storage;
  maxUploadBytes: number;
  now?: () => Date;
}

export interface EstimateDesignUploadDto {
  id: string;
  estimateId: string;
  leadId: string;
  originalFilename: string;
  mimeType: ValidatedUpload["mimeType"];
  sizeBytes: number;
  uploaderId: string;
  uploadedAt: string;
  extractionStatus: EstimateDesignExtractionStatus;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface EstimateDesignWorkspaceDto {
  uploads: EstimateDesignUploadDto[];
  pages: Array<Record<string, unknown>>;
  drawings: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
}

export interface EstimateDesignService {
  upload(user: AuthenticatedUser, estimateId: string, file: ValidatedUpload): Promise<EstimateDesignUploadDto>;
  listEstimator(user: AuthenticatedUser, estimateId: string): Promise<EstimateDesignWorkspaceDto>;
  sourceImage(user: AuthenticatedUser, pageId: string): Promise<NodeJS.ReadableStream>;
  revisionImage(user: AuthenticatedUser, revisionId: string): Promise<NodeJS.ReadableStream>;
}

export function createEstimateDesignService(input: CreateEstimateDesignServiceInput): EstimateDesignService {
  const now = input.now ?? (() => new Date());

  return {
    async upload(user, estimateId, file) {
      const estimate = await requireOwnedEditableEstimate(user, estimateId);
      if (file.sizeBytes > input.maxUploadBytes) {
        throw new ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.");
      }
      const lead = await LeadModel.findOne({ _id: estimate.leadId, ownerId: user.id }).lean();
      if (!lead) throw estimateNotFound();

      let stored: { reference: string };
      try {
        stored = await input.storage.save({ data: file.data, extension: file.extension });
      } catch {
        throw new ApiError(503, "FILE_STORAGE_ERROR", "The file could not be stored. Please try again.");
      }

      const uploadedAt = now();
      const uploadId = randomUUID();
      try {
        await persistUploadAndJob({
          uploadId,
          estimate,
          user,
          file,
          storedFileReference: stored.reference,
          uploadedAt
        });
      } catch (error) {
        try {
          await input.storage.delete(stored.reference);
        } catch {
          throw new ApiError(500, "FILE_CLEANUP_ERROR", "File metadata could not be saved and the stored file could not be cleaned up.");
        }
        throw error;
      }

      return {
        id: uploadId,
        estimateId: estimate._id,
        leadId: estimate.leadId,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        uploaderId: user.id,
        uploadedAt: uploadedAt.toISOString(),
        extractionStatus: "queued",
        failureCode: null,
        failureMessage: null
      };
    },

    async listEstimator(user, estimateId) {
      await requireOwnedEstimate(user, estimateId);
      const uploads = await EstimateDesignUploadModel.find({ estimateId }).sort({ uploadedAt: -1, _id: -1 }).lean();
      const uploadIds = uploads.map((upload) => upload._id);
      const [pages, drawings] = await Promise.all([
        EstimateDesignSourcePageModel.find({ uploadId: { $in: uploadIds } }).sort({ uploadId: 1, pageNumber: 1 }).lean(),
        EstimateDesignDrawingModel.find({ estimateId }).sort({ _id: 1 }).lean()
      ]);
      const drawingIds = drawings.map((drawing) => drawing._id);
      const revisions = await EstimateDesignRevisionModel.find({ drawingId: { $in: drawingIds } }).sort({ drawingId: 1, revisionNumber: 1 }).lean();
      return {
        uploads: uploads.map((upload) => uploadDto(upload)),
        pages: pages.map(sourcePageDto),
        drawings: drawings.map(drawingDto),
        revisions: revisions.map(revisionDto)
      };
    },

    async sourceImage(user, pageId) {
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      if (!page) throw estimateNotFound();
      const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
      if (!upload) throw estimateNotFound();
      await requireOwnedEstimate(user, upload.estimateId);
      return openStoredImage(input.storage, page.normalizedFileReference);
    },

    async revisionImage(user, revisionId) {
      const revision = await EstimateDesignRevisionModel.findById(revisionId).lean();
      if (!revision) throw estimateNotFound();
      const drawing = await EstimateDesignDrawingModel.findById(revision.drawingId).lean();
      if (!drawing) throw estimateNotFound();
      await requireOwnedEstimate(user, drawing.estimateId);
      return openStoredImage(input.storage, revision.croppedFileReference);
    }
  };

  async function requireOwnedEstimate(user: AuthenticatedUser, estimateId: string) {
    if (user.role !== "estimator_sales") forbidden();
    const estimate = await EstimateModel.findOne({ _id: estimateId, ownerId: user.id }).lean();
    if (!estimate) throw estimateNotFound();
    return estimate;
  }

  async function requireOwnedEditableEstimate(user: AuthenticatedUser, estimateId: string) {
    const estimate = await requireOwnedEstimate(user, estimateId);
    if (!isEstimateDesignEditable(estimate.status)) {
      throw new ApiError(409, "ESTIMATE_DESIGN_LOCKED", "This estimate is locked for design uploads.");
    }
    return estimate;
  }
}

async function persistUploadAndJob(input: {
  uploadId: string;
  estimate: { _id: string; leadId: string };
  user: AuthenticatedUser;
  file: ValidatedUpload;
  storedFileReference: string;
  uploadedAt: Date;
}) {
  const session = await mongoose.startSession();
  let completed = false;
  try {
    await session.withTransaction(async () => {
      await EstimateDesignUploadModel.create(
        [{
          _id: input.uploadId,
          estimateId: input.estimate._id,
          leadId: input.estimate.leadId,
          originalFilename: input.file.originalFilename,
          storedFileReference: input.storedFileReference,
          mimeType: input.file.mimeType,
          sizeBytes: input.file.sizeBytes,
          uploaderId: input.user.id,
          uploadedAt: input.uploadedAt,
          extractionStatus: "queued",
          failureCode: null,
          failureMessage: null
        }],
        { session }
      );
      await EstimateDesignExtractionJobModel.create(
        [{
          _id: randomUUID(),
          uploadId: input.uploadId,
          status: "queued",
          attemptCount: 0,
          queuedAt: input.uploadedAt,
          startedAt: null,
          completedAt: null,
          leaseExpiresAt: null,
          claimId: null,
          failureCode: null,
          failureMessage: null,
          workerResultId: null
        }],
        { session }
      );
      completed = true;
    });
    if (!completed) throw new Error("MongoDB transaction did not complete.");
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

async function openStoredImage(storage: Storage, reference: string) {
  try {
    return await storage.open(reference);
  } catch {
    throw new ApiError(500, "FILE_STORAGE_ERROR", "The stored file is temporarily unavailable.");
  }
}

function estimateNotFound() {
  return new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
}

function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

function uploadDto(upload: Record<string, unknown>): EstimateDesignUploadDto {
  return {
    id: String(upload._id),
    estimateId: String(upload.estimateId),
    leadId: String(upload.leadId),
    originalFilename: String(upload.originalFilename),
    mimeType: upload.mimeType as ValidatedUpload["mimeType"],
    sizeBytes: Number(upload.sizeBytes),
    uploaderId: String(upload.uploaderId),
    uploadedAt: new Date(String(upload.uploadedAt)).toISOString(),
    extractionStatus: upload.extractionStatus as EstimateDesignExtractionStatus,
    failureCode: upload.failureCode === null ? null : String(upload.failureCode),
    failureMessage: upload.failureMessage === null ? null : String(upload.failureMessage)
  };
}

function sourcePageDto(page: Record<string, unknown>) {
  return {
    id: String(page._id),
    uploadId: String(page.uploadId),
    pageNumber: Number(page.pageNumber),
    width: Number(page.width),
    height: Number(page.height)
  };
}

function drawingDto(drawing: Record<string, unknown>) {
  return {
    id: String(drawing._id),
    uploadId: String(drawing.uploadId),
    sourcePageId: String(drawing.sourcePageId),
    estimateId: String(drawing.estimateId),
    active: Boolean(drawing.active),
    verified: Boolean(drawing.verified),
    roomId: drawing.roomId ?? null,
    scopeSectionId: drawing.scopeSectionId ?? null,
    detectedTitle: String(drawing.detectedTitle),
    displayTitle: String(drawing.displayTitle),
    source: String(drawing.source),
    roomConfidence: drawing.roomConfidence ?? null,
    scopeConfidence: drawing.scopeConfidence ?? null,
    ocrConfidence: drawing.ocrConfidence ?? null,
    roomEvidence: drawing.roomEvidence ?? [],
    scopeEvidence: drawing.scopeEvidence ?? []
  };
}

function revisionDto(revision: Record<string, unknown>) {
  return {
    id: String(revision._id),
    drawingId: String(revision.drawingId),
    revisionNumber: Number(revision.revisionNumber),
    sourcePageId: String(revision.sourcePageId),
    crop: revision.crop,
    roomId: String(revision.roomId),
    scopeSectionId: String(revision.scopeSectionId),
    label: String(revision.label),
    reviewStatus: String(revision.reviewStatus),
    submittedAt: revision.submittedAt ?? null,
    reviewerId: revision.reviewerId ?? null,
    reviewedAt: revision.reviewedAt ?? null,
    changeSummary: revision.changeSummary ?? null,
    annotationLayerId: revision.annotationLayerId ?? null,
    replacesRevisionId: revision.replacesRevisionId ?? null
  };
}
