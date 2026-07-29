import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import sharp from "sharp";
import { isEstimateDesignEditable, type EstimateDesignExtractionStatus } from "../domain/estimate-design.js";
import { estimateScopeCatalogue } from "../domain/estimate-scope-catalogue.js";
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
import type { CropRect } from "../repositories/types.js";

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

export interface EstimateTaxonomyDto {
  rooms: Array<{ id: string; label: string; aliases: string[] }>;
  scopes: Array<{ id: string; label: string; aliases: string[] }>;
}

export interface EstimateWorkerJobRecord {
  id: string;
  uploadId: string;
  status: EstimateDesignExtractionStatus;
  attemptCount: number;
  queuedAt: string;
  leaseExpiresAt: string | null;
  claimId: string | null;
}

export interface ClaimedEstimateWorkerJob extends EstimateWorkerJobRecord {
  claimId: string;
  upload: {
    id: string;
    storedFileReference: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  };
  taxonomy: EstimateTaxonomyDto;
}

export interface EstimateWorkerProposal {
  detectedTitle: string;
  room: { id: string | null; confidence: number; evidence: string[]; ambiguous: boolean };
  scope: { id: string | null; confidence: number; evidence: string[]; ambiguous: boolean };
}

export interface EstimateWorkerResult {
  resultId: string;
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    imageBase64: string;
    sections: Array<{
      label: string;
      confidence: number;
      crop: CropRect;
      imageBase64: string;
      proposal: EstimateWorkerProposal;
    }>;
  }>;
}

export interface EditEstimateDrawingInput {
  version: number;
  displayTitle?: string;
  roomId?: string;
  scopeSectionId?: string;
  crop?: CropRect;
  verified?: boolean;
}

export interface EstimateDesignService {
  upload(user: AuthenticatedUser, estimateId: string, file: ValidatedUpload): Promise<EstimateDesignUploadDto>;
  listEstimator(user: AuthenticatedUser, estimateId: string): Promise<EstimateDesignWorkspaceDto>;
  sourceImage(user: AuthenticatedUser, pageId: string): Promise<NodeJS.ReadableStream>;
  revisionImage(user: AuthenticatedUser, revisionId: string): Promise<NodeJS.ReadableStream>;
  findOldestClaimableWorkerJob(now: string): Promise<EstimateWorkerJobRecord | null>;
  claimWorkerJob(id: string, now: string, leaseExpiresAt: string): Promise<ClaimedEstimateWorkerJob | null>;
  workerSource(jobId: string, claimToken: string, now: string): Promise<{
    reference: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  } | null>;
  renewWorkerLease(jobId: string, claimToken: string, now: string, leaseExpiresAt: string): Promise<EstimateWorkerJobRecord | null>;
  completeWorkerJob(jobId: string, claimToken: string, processedAt: string, result: EstimateWorkerResult): Promise<EstimateWorkerJobRecord>;
  failWorkerJob(jobId: string, claimToken: string, failedAt: string, code: string, message: string): Promise<EstimateWorkerJobRecord | null>;
  editDrawing(user: AuthenticatedUser, drawingId: string, change: EditEstimateDrawingInput): Promise<Record<string, unknown>>;
  submitDrawings(user: AuthenticatedUser, estimateId: string): Promise<{ submittedCount: number }>;
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
    },

    async findOldestClaimableWorkerJob(at) {
      const document = await EstimateDesignExtractionJobModel.findOne(claimableJobFilter(at))
        .sort({ queuedAt: 1, _id: 1 })
        .lean();
      return document ? workerJobDto(document) : null;
    },

    async claimWorkerJob(id, at, leaseExpiresAt) {
      const claimId = randomUUID();
      const job = await EstimateDesignExtractionJobModel.findOneAndUpdate(
        { _id: id, ...claimableJobFilter(at) },
        {
          $set: {
            status: "processing",
            startedAt: new Date(at),
            leaseExpiresAt: new Date(leaseExpiresAt),
            claimId,
            failureCode: null,
            failureMessage: null
          },
          $inc: { attemptCount: 1 }
        },
        { new: true, runValidators: true }
      ).lean();
      if (!job) return null;
      const upload = await EstimateDesignUploadModel.findById(job.uploadId).lean();
      const estimate = upload
        ? await EstimateModel.findById(upload.estimateId).lean()
        : null;
      if (!upload || !estimate) {
        throw new ApiError(500, "EXTRACTION_JOB_INVALID", "The extraction job source is unavailable.");
      }
      await EstimateDesignUploadModel.updateOne(
        { _id: upload._id },
        { $set: { extractionStatus: "processing", failureCode: null, failureMessage: null } }
      );
      return {
        ...workerJobDto(job),
        claimId,
        upload: {
          id: String(upload._id),
          storedFileReference: String(upload.storedFileReference),
          originalFilename: String(upload.originalFilename),
          mimeType: String(upload.mimeType),
          sizeBytes: Number(upload.sizeBytes)
        },
        taxonomy: taxonomyForEstimate(estimate)
      };
    },

    async workerSource(jobId, claimToken, at) {
      const job = await EstimateDesignExtractionJobModel.findById(jobId).lean();
      if (!job) return null;
      requireEstimateClaim(job, claimToken, at);
      const upload = await EstimateDesignUploadModel.findById(job.uploadId).lean();
      if (!upload) throw estimateNotFound();
      return {
        reference: String(upload.storedFileReference),
        filename: String(upload.originalFilename),
        mimeType: String(upload.mimeType),
        sizeBytes: Number(upload.sizeBytes)
      };
    },

    async renewWorkerLease(jobId, claimToken, at, leaseExpiresAt) {
      const job = await EstimateDesignExtractionJobModel.findById(jobId).lean();
      if (!job) return null;
      requireEstimateClaim(job, claimToken, at);
      const renewed = await EstimateDesignExtractionJobModel.findOneAndUpdate(
        {
          _id: jobId,
          status: "processing",
          claimId: claimToken,
          leaseExpiresAt: { $gt: new Date(at) }
        },
        { $set: { leaseExpiresAt: new Date(leaseExpiresAt) } },
        { new: true, runValidators: true }
      ).lean();
      if (!renewed) staleClaim();
      return workerJobDto(renewed);
    },

    async completeWorkerJob(jobId, claimToken, processedAt, result) {
      const job = await EstimateDesignExtractionJobModel.findById(jobId).lean();
      if (!job) throw estimateNotFound();
      requireEstimateClaim(job, claimToken, processedAt);
      const upload = await EstimateDesignUploadModel.findById(job.uploadId).lean();
      const estimate = upload
        ? await EstimateModel.findById(upload.estimateId).lean()
        : null;
      if (!upload || !estimate) throw estimateNotFound();
      const taxonomy = taxonomyForEstimate(estimate);
      const normalized = await normalizeEstimateResult(result, taxonomy, input.maxUploadBytes);
      const references: string[] = [];
      try {
        const pageDocuments: Array<Record<string, unknown>> = [];
        const drawingDocuments: Array<Record<string, unknown>> = [];
        const revisionDocuments: Array<Record<string, unknown>> = [];
        for (const page of normalized.pages) {
          const storedPage = await saveGeneratedImage(input.storage, page.image);
          references.push(storedPage.reference);
          const pageId = randomUUID();
          pageDocuments.push({
            _id: pageId,
            uploadId: upload._id,
            pageNumber: page.pageNumber,
            normalizedFileReference: storedPage.reference,
            width: page.width,
            height: page.height
          });
          for (const section of page.sections) {
            const storedCrop = await saveGeneratedImage(input.storage, section.image);
            references.push(storedCrop.reference);
            const drawingId = randomUUID();
            const revisionId = randomUUID();
            const roomId = section.proposal.room.id;
            const scopeSectionId = section.proposal.scope.id;
            const verified = Boolean(
              roomId &&
              scopeSectionId &&
              !section.proposal.room.ambiguous &&
              !section.proposal.scope.ambiguous &&
              section.proposal.room.confidence >= 0.84 &&
              section.proposal.scope.confidence >= 0.84
            );
            drawingDocuments.push({
              _id: drawingId,
              uploadId: upload._id,
              sourcePageId: pageId,
              estimateId: upload.estimateId,
              active: true,
              verified,
              roomId,
              scopeSectionId,
              detectedTitle: section.proposal.detectedTitle,
              displayTitle: section.label,
              source: "ocr",
              roomConfidence: section.proposal.room.confidence,
              scopeConfidence: section.proposal.scope.confidence,
              ocrConfidence: section.confidence,
              roomEvidence: section.proposal.room.evidence.map((value) => ({ value })),
              scopeEvidence: section.proposal.scope.evidence.map((value) => ({ value }))
            });
            revisionDocuments.push({
              _id: revisionId,
              drawingId,
              revisionNumber: 1,
              sourcePageId: pageId,
              crop: { ...section.crop },
              croppedFileReference: storedCrop.reference,
              roomId: roomId ?? "",
              scopeSectionId: scopeSectionId ?? "",
              label: section.label,
              reviewStatus: "draft",
              submittedAt: null,
              reviewerId: null,
              reviewedAt: null,
              changeSummary: null,
              annotationLayerId: null,
              replacesRevisionId: null
            });
          }
        }
        await withMongoTransaction(async (session) => {
          if (pageDocuments.length) await EstimateDesignSourcePageModel.create(pageDocuments, { session });
          if (drawingDocuments.length) await EstimateDesignDrawingModel.create(drawingDocuments, { session });
          if (revisionDocuments.length) await EstimateDesignRevisionModel.create(revisionDocuments, { session });
          const completed = await EstimateDesignExtractionJobModel.updateOne(
            {
              _id: jobId,
              status: "processing",
              claimId: claimToken,
              leaseExpiresAt: { $gt: new Date(processedAt) }
            },
            {
              $set: {
                status: "estimator_review",
                completedAt: new Date(processedAt),
                leaseExpiresAt: null,
                claimId: null,
                failureCode: null,
                failureMessage: null,
                workerResultId: result.resultId
              }
            },
            { session }
          );
          if (completed.matchedCount !== 1) staleClaim();
          await EstimateDesignUploadModel.updateOne(
            { _id: upload._id },
            {
              $set: {
                extractionStatus: "estimator_review",
                failureCode: null,
                failureMessage: null
              }
            },
            { session }
          );
        });
        return {
          ...workerJobDto({
            ...job,
            status: "estimator_review",
            completedAt: new Date(processedAt),
            leaseExpiresAt: null,
            claimId: null,
            workerResultId: result.resultId
          }),
          claimId: null
        };
      } catch (error) {
        await cleanupReferences(input.storage, references);
        throw error;
      }
    },

    async failWorkerJob(jobId, claimToken, failedAt, code, message) {
      const job = await EstimateDesignExtractionJobModel.findById(jobId).lean();
      if (!job) return null;
      requireEstimateClaim(job, claimToken, failedAt);
      let failed: Record<string, any> | null = null;
      await withMongoTransaction(async (session) => {
        failed = await EstimateDesignExtractionJobModel.findOneAndUpdate(
          {
            _id: jobId,
            status: "processing",
            claimId: claimToken,
            leaseExpiresAt: { $gt: new Date(failedAt) }
          },
          {
            $set: {
              status: "processing_failed",
              completedAt: new Date(failedAt),
              leaseExpiresAt: null,
              claimId: null,
              failureCode: code,
              failureMessage: message
            }
          },
          { new: true, runValidators: true, session }
        ).lean();
        if (!failed) staleClaim();
        await EstimateDesignUploadModel.updateOne(
          { _id: job.uploadId },
          {
            $set: {
              extractionStatus: "processing_failed",
              failureCode: code,
              failureMessage: message
            }
          },
          { session }
        );
      });
      return workerJobDto(failed!);
    },

    async editDrawing(user, drawingId, change) {
      const drawing = await EstimateDesignDrawingModel.findById(drawingId).lean();
      if (!drawing) throw estimateNotFound();
      const estimate = await requireOwnedEstimate(user, drawing.estimateId);
      if (!isEstimateDesignEditable(estimate.status)) {
        throw new ApiError(409, "ESTIMATE_DESIGN_LOCKED", "This estimate design is read-only.");
      }
      const latest = await EstimateDesignRevisionModel.findOne({ drawingId })
        .sort({ revisionNumber: -1 })
        .lean();
      if (!latest) throw estimateNotFound();
      if (latest.reviewStatus === "approved" || latest.reviewStatus === "submitted") {
        throw new ApiError(409, "ESTIMATE_DRAWING_LOCKED", "This drawing revision is read-only.");
      }
      if (Number(latest.revisionNumber) !== change.version) {
        throw new ApiError(409, "STALE_ESTIMATE_DRAWING", "The drawing changed before this update.");
      }
      const taxonomy = taxonomyForEstimate(estimate);
      const roomId = change.roomId ?? drawing.roomId ?? null;
      const scopeSectionId = change.scopeSectionId ?? drawing.scopeSectionId ?? null;
      validateMapping(roomId, scopeSectionId, taxonomy);
      const verified = change.verified ?? Boolean(drawing.verified);
      if (verified && (!roomId || !scopeSectionId)) {
        throw new ApiError(400, "INVALID_ESTIMATE_MAPPING", "Verified drawings require a room and enabled scope.");
      }
      const page = await EstimateDesignSourcePageModel.findById(drawing.sourcePageId).lean();
      if (!page) throw estimateNotFound();
      const crop = change.crop ? { ...change.crop } : { ...latest.crop };
      if (!cropIsWithinPage(crop, Number(page.width), Number(page.height))) {
        throw new ApiError(400, "INVALID_WORKER_RESULT", "Drawing crops must remain within their source page.");
      }
      const displayTitle = change.displayTitle?.replace(/\s+/g, " ").trim() ?? String(drawing.displayTitle);
      let croppedFileReference = String(latest.croppedFileReference);
      let generatedReference: string | null = null;
      if (change.crop) {
        try {
          const source = await input.storage.read(String(page.normalizedFileReference));
          const image = await sharp(source)
            .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
            .png()
            .toBuffer();
          const stored = await input.storage.saveGenerated({ data: image, extension: ".png" });
          generatedReference = stored.reference;
          croppedFileReference = stored.reference;
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError(503, "FILE_STORAGE_ERROR", "The corrected crop could not be stored.");
        }
      }
      const revision = {
        _id: randomUUID(),
        drawingId,
        revisionNumber: change.version + 1,
        sourcePageId: drawing.sourcePageId,
        crop,
        croppedFileReference,
        roomId: roomId ?? "",
        scopeSectionId: scopeSectionId ?? "",
        label: displayTitle,
        reviewStatus: "draft",
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        changeSummary: null,
        annotationLayerId: null,
        replacesRevisionId: latest._id
      };
      try {
        await withMongoTransaction(async (session) => {
          const current = await EstimateDesignRevisionModel.findOne({ drawingId })
            .sort({ revisionNumber: -1 })
            .session(session)
            .lean();
          if (!current || Number(current.revisionNumber) !== change.version) {
            throw new ApiError(409, "STALE_ESTIMATE_DRAWING", "The drawing changed before this update.");
          }
          await EstimateDesignRevisionModel.create([revision], { session });
          const updated = await EstimateDesignDrawingModel.updateOne(
            { _id: drawingId },
            {
              $set: {
                displayTitle,
                roomId,
                scopeSectionId,
                verified
              }
            },
            { session }
          );
          if (updated.matchedCount !== 1) throw estimateNotFound();
        });
      } catch (error) {
        if (generatedReference) await cleanupReferences(input.storage, [generatedReference]);
        throw error;
      }
      return {
        ...drawingDto({
          ...drawing,
          displayTitle,
          roomId,
          scopeSectionId,
          verified
        }),
        revision: revisionDto(revision)
      };
    },

    async submitDrawings(user, estimateId) {
      const estimate = await requireOwnedEstimate(user, estimateId);
      if (!isEstimateDesignEditable(estimate.status)) {
        throw new ApiError(409, "ESTIMATE_DESIGN_LOCKED", "This estimate design is read-only.");
      }
      const taxonomy = taxonomyForEstimate(estimate);
      const drawings = await EstimateDesignDrawingModel.find({ estimateId, active: true })
        .sort({ _id: 1 })
        .lean();
      if (drawings.length === 0) {
        throw new ApiError(409, "ESTIMATE_DRAWINGS_EMPTY", "Add at least one drawing before submitting.");
      }
      const latest = await Promise.all(drawings.map((drawing) =>
        EstimateDesignRevisionModel.findOne({ drawingId: drawing._id })
          .sort({ revisionNumber: -1 })
          .lean()
      ));
      for (let index = 0; index < drawings.length; index += 1) {
        const drawing = drawings[index]!;
        const revision = latest[index];
        validateMapping(drawing.roomId ?? null, drawing.scopeSectionId ?? null, taxonomy);
        if (!drawing.verified || !revision || !["draft", "changes_requested"].includes(String(revision.reviewStatus))) {
          throw new ApiError(
            409,
            "ESTIMATE_DRAWINGS_UNVERIFIED",
            "Verify every active drawing before submitting."
          );
        }
      }
      const submittedAt = now();
      const revisionIds = latest.map((revision) => revision!._id);
      await withMongoTransaction(async (session) => {
        const updated = await EstimateDesignRevisionModel.updateMany(
          { _id: { $in: revisionIds }, reviewStatus: { $in: ["draft", "changes_requested"] } },
          { $set: { reviewStatus: "submitted", submittedAt } },
          { session }
        );
        if (updated.modifiedCount !== revisionIds.length) {
          throw new ApiError(409, "STALE_ESTIMATE_DRAWING", "A drawing changed before submission.");
        }
        for (const uploadId of new Set(drawings.map((drawing) => String(drawing.uploadId)))) {
          await EstimateDesignUploadModel.updateOne(
            { _id: uploadId },
            { $set: { extractionStatus: "submitted" } },
            { session }
          );
          await EstimateDesignExtractionJobModel.updateOne(
            { uploadId, status: "estimator_review" },
            { $set: { status: "submitted" } },
            { session }
          );
        }
      });
      return { submittedCount: revisionIds.length };
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

function claimableJobFilter(now: string) {
  return {
    $or: [
      { status: "queued" },
      { status: "processing", leaseExpiresAt: { $lte: new Date(now) } }
    ]
  };
}

function workerJobDto(job: Record<string, any>): EstimateWorkerJobRecord {
  return {
    id: String(job._id),
    uploadId: String(job.uploadId),
    status: job.status as EstimateDesignExtractionStatus,
    attemptCount: Number(job.attemptCount),
    queuedAt: new Date(job.queuedAt).toISOString(),
    leaseExpiresAt: job.leaseExpiresAt ? new Date(job.leaseExpiresAt).toISOString() : null,
    claimId: job.claimId === null || job.claimId === undefined ? null : String(job.claimId)
  };
}

function taxonomyForEstimate(estimate: Record<string, any>): EstimateTaxonomyDto {
  const rooms = Array.isArray(estimate.rooms)
    ? estimate.rooms.flatMap((room: unknown) => {
        if (!room || typeof room !== "object") return [];
        const record = room as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim() : "";
        const label = typeof record.label === "string" ? record.label.trim() : "";
        if (!id || !label) return [];
        const aliases = Array.isArray(record.aliases)
          ? record.aliases.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              .map((value) => value.trim())
          : [];
        return [{ id, label, aliases }];
      })
    : [];
  const enabledScopes = new Set(
    Array.isArray(estimate.scopes)
      ? estimate.scopes.filter((value: unknown): value is string => typeof value === "string")
      : []
  );
  const scopes = estimateScopeCatalogue
    .filter((entry) => enabledScopes.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      aliases: [...entry.aliases]
    }));
  return { rooms, scopes };
}

function requireEstimateClaim(job: Record<string, any>, claimToken: string, now: string) {
  if (
    job.status !== "processing" ||
    job.claimId !== claimToken ||
    !job.leaseExpiresAt ||
    new Date(job.leaseExpiresAt).getTime() <= new Date(now).getTime()
  ) {
    staleClaim();
  }
}

function staleClaim(): never {
  throw new ApiError(
    409,
    "STALE_EXTRACTION_CLAIM",
    "The extraction job claim is no longer current."
  );
}

function validateMapping(
  roomId: unknown,
  scopeSectionId: unknown,
  taxonomy: EstimateTaxonomyDto
) {
  if (roomId !== null && roomId !== undefined && !taxonomy.rooms.some((room) => room.id === roomId)) {
    throw new ApiError(400, "INVALID_ESTIMATE_MAPPING", "The proposed room is not configured on this estimate.");
  }
  if (
    scopeSectionId !== null &&
    scopeSectionId !== undefined &&
    !taxonomy.scopes.some((scope) => scope.id === scopeSectionId)
  ) {
    throw new ApiError(400, "INVALID_ESTIMATE_MAPPING", "The proposed scope is not enabled on this estimate.");
  }
}

async function normalizeEstimateResult(
  result: EstimateWorkerResult,
  taxonomy: EstimateTaxonomyDto,
  maxImageBytes: number
) {
  const pageNumbers = new Set<number>();
  let totalBytes = 0;
  const pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    image: Buffer;
    sections: Array<{
      label: string;
      confidence: number;
      crop: CropRect;
      image: Buffer;
      proposal: EstimateWorkerProposal;
    }>;
  }> = [];
  for (const page of result.pages) {
    if (pageNumbers.has(page.pageNumber)) invalidWorkerResult("Page numbers must be unique.");
    pageNumbers.add(page.pageNumber);
    if (pageNumbers.size > 50 || page.width * page.height > 40_000_000) {
      invalidWorkerResult("The extraction result exceeds the page limits.");
    }
    const image = decodeBase64(page.imageBase64, maxImageBytes);
    await validatePng(image, page.width, page.height);
    totalBytes += image.length;
    const sections = [];
    for (const section of page.sections) {
      const label = section.label.replace(/\s+/g, " ").trim();
      const detectedTitle = section.proposal.detectedTitle.replace(/\s+/g, " ").trim();
      if (!label || !detectedTitle) invalidWorkerResult("Drawing labels must not be empty.");
      if (!cropIsWithinPage(section.crop, page.width, page.height)) {
        invalidWorkerResult("Drawing crops must remain within their source page.");
      }
      validateMapping(section.proposal.room.id, section.proposal.scope.id, taxonomy);
      const cropImage = decodeBase64(section.imageBase64, maxImageBytes);
      await validatePng(cropImage, section.crop.width, section.crop.height);
      totalBytes += cropImage.length;
      sections.push({
        label,
        confidence: section.confidence,
        crop: { ...section.crop },
        image: cropImage,
        proposal: {
          ...section.proposal,
          detectedTitle,
          room: {
            ...section.proposal.room,
            evidence: [...section.proposal.room.evidence]
          },
          scope: {
            ...section.proposal.scope,
            evidence: [...section.proposal.scope.evidence]
          }
        }
      });
    }
    pages.push({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      image,
      sections
    });
  }
  if (totalBytes > maxImageBytes * 4) {
    invalidWorkerResult("The extraction result contains too much image data.");
  }
  return { pages };
}

function decodeBase64(value: string, maximumBytes: number) {
  if (
    value.length > Math.ceil(maximumBytes / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    invalidWorkerResult("Worker images must use canonical base64 encoding.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.length > maximumBytes) {
    invalidWorkerResult("A worker image exceeds the configured size limit.");
  }
  if (decoded.toString("base64") !== value) {
    invalidWorkerResult("Worker images must use canonical base64 encoding.");
  }
  return decoded;
}

async function validatePng(image: Buffer, width: number, height: number) {
  try {
    const decoder = sharp(image, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await decoder.metadata();
    if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height) {
      invalidWorkerResult("Worker image dimensions must match the declared dimensions.");
    }
    await decoder.raw().toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidWorkerResult("Worker images must be complete PNG files.");
  }
}

function cropIsWithinPage(crop: CropRect, width: number, height: number) {
  return (
    Number.isInteger(crop.x) &&
    Number.isInteger(crop.y) &&
    Number.isInteger(crop.width) &&
    Number.isInteger(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= width &&
    crop.y + crop.height <= height
  );
}

function invalidWorkerResult(message: string): never {
  throw new ApiError(400, "INVALID_WORKER_RESULT", message);
}

async function withMongoTransaction(operation: (session: mongoose.ClientSession) => Promise<void>) {
  const session = await mongoose.startSession();
  let completed = false;
  try {
    await session.withTransaction(async () => {
      await operation(session);
      completed = true;
    });
    if (!completed) throw new Error("MongoDB transaction did not complete.");
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

async function cleanupReferences(storage: Storage, references: string[]) {
  await Promise.allSettled(references.map((reference) => storage.delete(reference)));
}

async function saveGeneratedImage(storage: Storage, data: Buffer) {
  try {
    return await storage.saveGenerated({ data, extension: ".png" });
  } catch {
    throw new ApiError(
      503,
      "FILE_STORAGE_ERROR",
      "The extracted image could not be stored."
    );
  }
}
