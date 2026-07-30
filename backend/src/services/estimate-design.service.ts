import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import sharp, { type Metadata } from "sharp";
import {
  isEstimateDesignEditable,
  type AnnotationDocumentV1,
  type EstimateDesignExtractionStatus
} from "../domain/estimate-design.js";
import { normalizeEmail } from "../domain/email.js";
import { estimateScopeCatalogue } from "../domain/estimate-scope-catalogue.js";
import { ApiError } from "../middleware/errors.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignAnnotationDraftModel } from "../models/EstimateDesignAnnotationDraft.js";
import { EstimateDesignExtractionJobModel } from "../models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import type { PublicUser as AuthenticatedUser } from "./auth.service.js";
import type { Storage } from "../storage/storage.js";
import type { CropRect } from "../repositories/types.js";

const mutableDesignEstimateStatuses = [
  "draft",
  "pending_manager_assignment",
  "pending_designer_approval",
  "designer_changes_requested",
  "ready_for_client",
  "sent_to_client",
  "client_changes_requested"
] as const;
const frozenEstimateJobFailure = {
  code: "ESTIMATE_DESIGN_FROZEN",
  message: "Estimate design was finalized before extraction completed."
} as const;

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

export interface CancelledEstimateWorkerJobClaim {
  cancelled: true;
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

export interface SaveAnnotationDraftInput {
  version: number;
  annotations: AnnotationDocumentV1;
}

export type DrawingDecisionInput =
  | { version: number; decision: "approve" }
  | {
      version: number;
      decision: "request_changes";
      summary: string;
      annotations: AnnotationDocumentV1;
    };

export interface ReplaceDrawingInput {
  version: number;
  file: ValidatedUpload;
}

export interface EstimateDesignApprovalReadiness {
  ready: boolean;
  total: number;
  approved: number;
  awaitingReview: number;
  changesRequested: number;
}

export interface EstimateDesignService {
  upload(user: AuthenticatedUser, estimateId: string, file: ValidatedUpload): Promise<EstimateDesignUploadDto>;
  listEstimator(user: AuthenticatedUser, estimateId: string): Promise<EstimateDesignWorkspaceDto>;
  sourceImage(user: AuthenticatedUser, pageId: string): Promise<NodeJS.ReadableStream>;
  revisionImage(user: AuthenticatedUser, revisionId: string): Promise<NodeJS.ReadableStream>;
  findOldestClaimableWorkerJob(now: string): Promise<EstimateWorkerJobRecord | null>;
  claimWorkerJob(
    id: string,
    now: string,
    leaseExpiresAt: string
  ): Promise<ClaimedEstimateWorkerJob | CancelledEstimateWorkerJobClaim | null>;
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
  listClient(user: AuthenticatedUser, estimateId: string): Promise<EstimateDesignWorkspaceDto & {
    readiness: EstimateDesignApprovalReadiness;
  }>;
  saveAnnotationDraft(user: AuthenticatedUser, revisionId: string, input: SaveAnnotationDraftInput): Promise<Record<string, unknown>>;
  decideDrawing(user: AuthenticatedUser, revisionId: string, input: DrawingDecisionInput): Promise<Record<string, unknown>>;
  replaceDrawing(user: AuthenticatedUser, drawingId: string, input: ReplaceDrawingInput): Promise<Record<string, unknown>>;
  approvalReadiness(
    user: AuthenticatedUser,
    estimateId: string,
    session?: mongoose.ClientSession
  ): Promise<EstimateDesignApprovalReadiness>;
}

export function createEstimateDesignService(input: CreateEstimateDesignServiceInput): EstimateDesignService {
  const now = input.now ?? (() => new Date());
  const calculateApprovalReadiness = async (
    user: AuthenticatedUser,
    estimateId: string,
    session?: mongoose.ClientSession
  ): Promise<EstimateDesignApprovalReadiness> => {
    await requireClientEstimate(user, estimateId, session);
    const drawingQuery = EstimateDesignDrawingModel.find({
      estimateId,
      active: true
    }).sort({ _id: 1 });
    if (session) drawingQuery.session(session);
    const drawings = await drawingQuery.lean();
    let approved = 0;
    let awaitingReview = 0;
    let changesRequested = 0;
    for (const drawing of drawings) {
      const revisionQuery = EstimateDesignRevisionModel.findOne({
        drawingId: drawing._id
      }).sort({ revisionNumber: -1 });
      if (session) revisionQuery.session(session);
      const revision = await revisionQuery.lean();
      if (revision?.reviewStatus === "approved") approved += 1;
      else if (revision?.reviewStatus === "changes_requested") changesRequested += 1;
      else awaitingReview += 1;
    }
    const total = drawings.length;
    return {
      ready: total === 0 || approved === total,
      total,
      approved,
      awaitingReview,
      changesRequested
    };
  };

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

    async listClient(user, estimateId) {
      await requireClientEstimate(user, estimateId);
      const drawings = await EstimateDesignDrawingModel.find({
        estimateId,
        active: true
      }).sort({ _id: 1 }).lean();
      const visibleDrawings: Array<Record<string, unknown>> = [];
      const revisions: Array<Record<string, unknown>> = [];
      const pages = new Map<string, Record<string, unknown>>();
      const uploadIds = new Set<string>();
      for (const drawing of drawings) {
        const history = await EstimateDesignRevisionModel.find({
          drawingId: drawing._id
        }).sort({ revisionNumber: 1 }).lean();
        const visibleHistory = history.filter((revision) =>
          ["submitted", "approved", "changes_requested"].includes(
            String(revision.reviewStatus)
          )
        );
        const latest = visibleHistory.at(-1);
        if (!latest) {
          continue;
        }
        const draft = latest.reviewStatus === "submitted"
          ? await EstimateDesignAnnotationDraftModel.findOne({
              revisionId: latest._id,
              clientId: user.id
            }).lean()
          : null;
        revisions.push(...visibleHistory.map((revision) => ({
          ...revisionDto(revision),
          annotationDraft:
            String(revision._id) === String(latest._id) && draft
              ? annotationDraftDto(draft)
              : null
        })));
        const page = await EstimateDesignSourcePageModel.findById(latest.sourcePageId).lean();
        if (!page) throw estimateNotFound();
        visibleDrawings.push(clientDrawingDto(drawing, latest, page));
        uploadIds.add(String(page.uploadId));
        pages.set(String(page._id), sourcePageDto(page));
      }
      const uploads = await EstimateDesignUploadModel.find({
        _id: { $in: [...uploadIds] }
      }).sort({ uploadedAt: -1, _id: -1 }).lean();
      return {
        uploads: uploads.map(uploadDto),
        pages: [...pages.values()],
        drawings: visibleDrawings,
        revisions,
        readiness: await calculateApprovalReadiness(user, estimateId)
      };
    },

    async saveAnnotationDraft(user, revisionId, draftInput) {
      await requireClientRevision(user, revisionId);
      let draft: Record<string, any> | null = null;
      try {
        await withMongoTransaction(async (session) => {
          const current = await requireClientRevision(user, revisionId, session);
          if (current.revision.reviewStatus !== "submitted") drawingLocked();
          await advanceDesignLifecycle(current.estimate, session);
          const guarded = await EstimateDesignRevisionModel.updateOne(
            {
              _id: revisionId,
              drawingId: current.drawing._id,
              revisionNumber: current.revision.revisionNumber,
              reviewStatus: "submitted"
            },
            {
              $set: { reviewStatus: "submitted" },
              $currentDate: { updatedAt: true }
            },
            { session }
          );
          requireMatchedTransition(guarded, staleAnnotation);
          if (draftInput.version === 0) {
            const existing = await EstimateDesignAnnotationDraftModel.findOne({
              revisionId,
              clientId: user.id
            }).session(session).lean();
            if (existing) staleAnnotation();
          }
          draft = await EstimateDesignAnnotationDraftModel.findOneAndUpdate(
            {
              revisionId,
              clientId: user.id,
              version: draftInput.version
            },
            {
              $setOnInsert: { _id: randomUUID(), revisionId, clientId: user.id },
              $set: { annotations: draftInput.annotations },
              $inc: { version: 1 }
            },
            {
              new: true,
              upsert: draftInput.version === 0,
              runValidators: true,
              setDefaultsOnInsert: true,
              session
            }
          ).lean();
          if (!draft) staleAnnotation();
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ) {
          staleAnnotation();
        }
        throw error;
      }
      if (!draft) throw new Error("Annotation draft transaction did not complete.");
      return annotationDraftDto(draft);
    },

    async decideDrawing(user, revisionId, decision) {
      const initial = await requireClientRevision(user, revisionId);
      if (Number(initial.revision.revisionNumber) !== decision.version) staleDrawing();
      if (
        decision.decision === "approve" &&
        initial.revision.reviewStatus === "approved" &&
        String(initial.revision.reviewerId) === user.id
      ) {
        return revisionDto(initial.revision);
      }
      if (
        decision.decision === "request_changes" &&
        equivalentChangeRequest(initial.revision, user.id, decision)
      ) {
        return revisionDto(initial.revision);
      }
      if (initial.revision.reviewStatus !== "submitted") drawingLocked();
      if (
        decision.decision === "request_changes" &&
        (!decision.summary.trim() || decision.annotations.elements.length === 0)
      ) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "A change request needs a summary and at least one annotation.",
          { annotations: "Add a marking or text note." }
        );
      }
      let saved: Record<string, any> | null = null;
      await withMongoTransaction(async (session) => {
        const current = await requireClientRevision(user, revisionId, session);
        if (Number(current.revision.revisionNumber) !== decision.version) staleDrawing();
        if (
          decision.decision === "approve" &&
          current.revision.reviewStatus === "approved" &&
          String(current.revision.reviewerId) === user.id
        ) {
          saved = current.revision;
          return;
        }
        if (
          decision.decision === "request_changes" &&
          equivalentChangeRequest(current.revision, user.id, decision)
        ) {
          saved = current.revision;
          return;
        }
        if (current.revision.reviewStatus !== "submitted") drawingLocked();
        await advanceDesignLifecycle(current.estimate, session);
        const reviewedAt = now();
        const update = decision.decision === "approve"
          ? {
              reviewStatus: "approved",
              reviewerId: user.id,
              reviewedAt,
              changeSummary: null,
              annotations: null
            }
          : {
              reviewStatus: "changes_requested",
              reviewerId: user.id,
              reviewedAt,
              changeSummary: decision.summary,
              annotations: decision.annotations
            };
        const changed = await EstimateDesignRevisionModel.updateOne(
          {
            _id: revisionId,
            drawingId: current.drawing._id,
            revisionNumber: decision.version,
            reviewStatus: "submitted"
          },
          { $set: update },
          { session, runValidators: true }
        );
        requireMatchedTransition(changed, staleDrawing);
        const draftDeletion = EstimateDesignAnnotationDraftModel.deleteOne({
          revisionId,
          clientId: user.id
        });
        if ("session" in draftDeletion && typeof draftDeletion.session === "function") {
          draftDeletion.session(session);
        }
        await draftDeletion;
        const aggregate = await refreshUploadReviewStatus(
          String(current.drawing.uploadId),
          String(current.drawing.estimateId),
          session
        );
        const sourcePage = await EstimateDesignSourcePageModel.findById(
          current.revision.sourcePageId
        ).session(session).lean();
        if (
          sourcePage &&
          String(sourcePage.uploadId) !== String(current.drawing.uploadId)
        ) {
          await mirrorUploadReviewStatus(
            String(sourcePage.uploadId),
            String(current.drawing.estimateId),
            aggregate,
            session
          );
        }
        saved = { ...current.revision, ...update };
      });
      if (!saved) throw new Error("Estimate drawing decision did not complete.");
      return revisionDto(saved);
    },

    async replaceDrawing(user, drawingId, replacement) {
      const drawing = await EstimateDesignDrawingModel.findById(drawingId).lean();
      if (!drawing) throw estimateNotFound();
      const estimate = await requireOwnedEstimate(user, String(drawing.estimateId));
      if (estimate.status === "client_approved") drawingLocked();
      const latest = await EstimateDesignRevisionModel.findOne({ drawingId })
        .sort({ revisionNumber: -1 })
        .lean();
      if (
        !latest ||
        latest.reviewStatus !== "changes_requested" ||
        Number(latest.revisionNumber) !== replacement.version ||
        Boolean(latest.replacementUploadId)
      ) {
        staleReplacement();
      }
      if (replacement.file.sizeBytes > input.maxUploadBytes) {
        throw new ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.");
      }
      if (
        replacement.file.mimeType === "application/pdf" ||
        replacement.file.mimeType === "image/heic"
      ) {
        return queueReplacement(user, estimate, drawing, latest, replacement.file);
      }
      let normalized: Buffer;
      let metadata: Metadata;
      try {
        const image = sharp(replacement.file.data, {
          pages: 1,
          failOn: "error",
          limitInputPixels: 40_000_000
        });
        metadata = await image.metadata();
        if (
          (metadata.pages ?? 1) !== 1 ||
          !metadata.width ||
          !metadata.height ||
          metadata.width > 20_000 ||
          metadata.height > 20_000 ||
          metadata.width * metadata.height > 40_000_000
        ) {
          throw new ApiError(
            400,
            "INVALID_REPLACEMENT_IMAGE",
            "A replacement must contain exactly one drawing image."
          );
        }
        normalized = await image.png().toBuffer();
        if (normalized.length > input.maxUploadBytes) {
          throw new ApiError(
            400,
            "INVALID_REPLACEMENT_IMAGE",
            "The normalized replacement exceeds the configured image limit."
          );
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          400,
          "INVALID_REPLACEMENT_IMAGE",
          "The replacement image dimensions or decoded pixels exceed the safe limits."
        );
      }
      const references: string[] = [];
      try {
        const stored = await input.storage.saveGenerated({
          data: normalized,
          extension: ".png"
        });
        references.push(stored.reference);
        const pageId = randomUUID();
        const revision = {
          _id: randomUUID(),
          drawingId,
          revisionNumber: replacement.version + 1,
          sourcePageId: pageId,
          crop: { x: 0, y: 0, width: metadata.width!, height: metadata.height! },
          croppedFileReference: stored.reference,
          roomId: String(latest.roomId),
          scopeSectionId: String(latest.scopeSectionId),
          label: String(latest.label),
          reviewStatus: "draft",
          submittedAt: null,
          reviewerId: null,
          reviewedAt: null,
          changeSummary: null,
          annotationLayerId: null,
          annotations: null,
          replacesRevisionId: latest._id
        };
        await withMongoTransaction(async (session) => {
          const currentDrawing = await EstimateDesignDrawingModel.findById(drawingId)
            .session(session)
            .lean();
          if (!currentDrawing) throw estimateNotFound();
          const currentEstimate = await requireOwnedEstimate(
            user,
            String(currentDrawing.estimateId),
            session
          );
          const current = await EstimateDesignRevisionModel.findOne({ drawingId })
            .sort({ revisionNumber: -1 })
            .session(session)
            .lean();
          if (
            !current ||
            String(current._id) !== String(latest._id) ||
            Number(current.revisionNumber) !== replacement.version ||
            current.reviewStatus !== "changes_requested" ||
            Boolean(current.replacementUploadId)
          ) {
            staleReplacement();
          }
          await advanceDesignLifecycle(currentEstimate, session);
          await EstimateDesignSourcePageModel.create([{
            _id: pageId,
            uploadId: currentDrawing.uploadId,
            pageNumber: await nextPageNumber(String(currentDrawing.uploadId), session),
            normalizedFileReference: stored.reference,
            width: metadata.width,
            height: metadata.height
          }], { session });
          await EstimateDesignRevisionModel.create([revision], { session });
          const drawingUpdated = await EstimateDesignDrawingModel.updateOne(
            { _id: drawingId, active: true, verified: Boolean(currentDrawing.verified) },
            { $set: { sourcePageId: pageId, verified: false } },
            { session }
          );
          requireMatchedTransition(drawingUpdated, staleReplacement);
          await transitionUploadForReplacement(
            String(currentDrawing.uploadId),
            String(currentDrawing.estimateId),
            session
          );
        });
        return {
          ...drawingDto({ ...drawing, sourcePageId: pageId, verified: false }),
          revision: revisionDto(revision)
        };
      } catch (error) {
        await cleanupReferences(input.storage, references);
        throw error;
      }
    },

    approvalReadiness(user, estimateId, session) {
      return calculateApprovalReadiness(user, estimateId, session);
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
      if (user.role === "estimator_sales") {
        await requireOwnedEstimate(user, String(drawing.estimateId));
      } else if (
        user.role === "client" &&
        ["submitted", "approved", "changes_requested"].includes(String(revision.reviewStatus))
      ) {
        await requireClientEstimate(user, String(drawing.estimateId));
      } else {
        throw estimateNotFound();
      }
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
      if (estimateDesignIsFrozen(estimate)) {
        await withMongoTransaction(async (session) => {
          const currentJob = await EstimateDesignExtractionJobModel.findById(job._id)
            .session(session)
            .lean();
          const currentUpload = await EstimateDesignUploadModel.findById(upload._id)
            .session(session)
            .lean();
          const currentEstimate = currentUpload
            ? await EstimateModel.findById(currentUpload.estimateId)
                .session(session)
                .lean()
            : null;
          if (!currentJob || !currentUpload || !currentEstimate) {
            throw new ApiError(
              500,
              "EXTRACTION_JOB_INVALID",
              "The extraction job source is unavailable."
            );
          }
          if (!estimateDesignIsFrozen(currentEstimate)) {
            extractionStateConflict();
          }
          await terminallyCancelFrozenWorkerJob(
            currentJob,
            currentUpload,
            claimId,
            at,
            session
          );
        });
        return { cancelled: true };
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
      if (upload.replacementDrawingId) {
        if (normalized.pages.length !== 1) {
          invalidWorkerResult("A replacement must contain exactly one drawing image.");
        }
        return completeQueuedReplacement(
          job,
          upload,
          claimToken,
          processedAt,
          result.resultId,
          normalized.pages[0]!
        );
      }
      const references: string[] = [];
      try {
        const pageDocuments: Array<Record<string, unknown>> = [];
        const drawingDocuments: Array<Record<string, unknown>> = [];
        const revisionDocuments: Array<Record<string, unknown>> = [];
        let completedJob: Record<string, any> | null = null;
        let cancelled = false;
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
          const currentJob = await EstimateDesignExtractionJobModel.findById(jobId)
            .session(session)
            .lean();
          if (!currentJob) throw estimateNotFound();
          requireEstimateClaim(currentJob, claimToken, processedAt);
          const currentUpload = await EstimateDesignUploadModel.findById(currentJob.uploadId)
            .session(session)
            .lean();
          if (
            !currentUpload ||
            String(currentUpload._id) !== String(upload._id) ||
            String(currentUpload.extractionStatus) !== "processing"
          ) {
            extractionStateConflict();
          }
          const currentEstimate = await EstimateModel.findById(currentUpload.estimateId)
            .session(session)
            .lean();
          if (
            !currentEstimate ||
            JSON.stringify(taxonomyForEstimate(currentEstimate)) !== JSON.stringify(taxonomy)
          ) {
            extractionStateConflict();
          }
          if (estimateDesignIsFrozen(currentEstimate)) {
            completedJob = await terminallyCancelFrozenWorkerJob(
              currentJob,
              currentUpload,
              claimToken,
              processedAt,
              session
            );
            cancelled = true;
            return;
          }
          await guardDesignLifecycle(currentEstimate, session);
          if (pageDocuments.length) await EstimateDesignSourcePageModel.create(pageDocuments, { session });
          if (drawingDocuments.length) await EstimateDesignDrawingModel.create(drawingDocuments, { session });
          if (revisionDocuments.length) await EstimateDesignRevisionModel.create(revisionDocuments, { session });
          const completed = await EstimateDesignExtractionJobModel.updateOne(
            {
              _id: jobId,
              status: "processing",
              claimId: claimToken,
              uploadId: currentUpload._id,
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
          requireTransition(completed, staleClaim);
          const uploadUpdated = await EstimateDesignUploadModel.updateOne(
            {
              _id: currentUpload._id,
              estimateId: currentUpload.estimateId,
              extractionStatus: "processing"
            },
            {
              $set: {
                extractionStatus: "estimator_review",
                failureCode: null,
                failureMessage: null
              }
            },
            { session }
          );
          requireTransition(uploadUpdated, extractionStateConflict);
          completedJob = {
            ...currentJob,
            status: "estimator_review",
            completedAt: new Date(processedAt),
            leaseExpiresAt: null,
            claimId: null,
            workerResultId: result.resultId
          };
        });
        if (!completedJob) {
          throw new Error("Estimate extraction completion transaction did not complete.");
        }
        if (cancelled) await cleanupReferences(input.storage, references);
        return workerJobDto(completedJob);
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
        const currentJob = await EstimateDesignExtractionJobModel.findById(jobId)
          .session(session)
          .lean();
        if (!currentJob) throw estimateNotFound();
        requireEstimateClaim(currentJob, claimToken, failedAt);
        const currentUpload = await EstimateDesignUploadModel.findById(currentJob.uploadId)
          .session(session)
          .lean();
        if (!currentUpload || String(currentUpload.extractionStatus) !== "processing") {
          extractionStateConflict();
        }
        const currentEstimate = await EstimateModel.findById(
          currentUpload.estimateId
        ).session(session).lean();
        if (!currentEstimate) throw estimateNotFound();
        if (estimateDesignIsFrozen(currentEstimate)) {
          failed = await terminallyCancelFrozenWorkerJob(
            currentJob,
            currentUpload,
            claimToken,
            failedAt,
            session
          );
          return;
        }
        await guardDesignLifecycle(currentEstimate, session);
        failed = await EstimateDesignExtractionJobModel.findOneAndUpdate(
          {
            _id: jobId,
            uploadId: currentUpload._id,
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
        const uploadUpdated = await EstimateDesignUploadModel.updateOne(
          {
            _id: currentUpload._id,
            estimateId: currentUpload.estimateId,
            extractionStatus: "processing"
          },
          {
            $set: {
              extractionStatus: "processing_failed",
              failureCode: code,
              failureMessage: message
            }
          },
          { session }
        );
        requireTransition(uploadUpdated, extractionStateConflict);
        if (currentUpload.replacesRevisionId) {
          const released = await EstimateDesignRevisionModel.updateOne(
            {
              _id: currentUpload.replacesRevisionId,
              replacementUploadId: currentUpload._id,
              reviewStatus: "changes_requested"
            },
            { $set: { replacementUploadId: null } },
            { session }
          );
          requireMatchedTransition(released, extractionStateConflict);
        }
      });
      return workerJobDto(failed!);
    },

    async editDrawing(user, drawingId, change) {
      const drawing = await EstimateDesignDrawingModel.findById(drawingId).lean();
      if (!drawing) throw estimateNotFound();
      const estimate = await requireOwnedEstimate(user, drawing.estimateId);
      const latest = await EstimateDesignRevisionModel.findOne({ drawingId })
        .sort({ revisionNumber: -1 })
        .lean();
      if (!latest) throw estimateNotFound();
      if (!estimateAllowsDrawingEdit(String(estimate.status), latest)) {
        throw new ApiError(409, "ESTIMATE_DESIGN_LOCKED", "This estimate design is read-only.");
      }
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
      let savedDrawing: Record<string, any> | null = null;
      let savedRevision: Record<string, any> | null = null;
      try {
        await withMongoTransaction(async (session) => {
          const currentDrawing = await EstimateDesignDrawingModel.findById(drawingId)
            .session(session)
            .lean();
          if (!currentDrawing) throw estimateNotFound();
          const currentEstimate = await requireOwnedEstimate(
            user,
            String(currentDrawing.estimateId),
            session
          );
          if (!currentDrawing.active) {
            drawingLocked();
          }
          const currentUpload = await EstimateDesignUploadModel.findById(
            currentDrawing.uploadId
          )
            .session(session)
            .lean();
          const currentJob = await EstimateDesignExtractionJobModel.findOne({
            uploadId: currentDrawing.uploadId
          })
            .session(session)
            .lean();
          if (
            !currentUpload ||
            !currentJob ||
            String(currentUpload.estimateId) !== String(currentDrawing.estimateId) ||
            String(currentUpload.extractionStatus) !== "estimator_review" ||
            String(currentJob.status) !== "estimator_review"
          ) {
            drawingLocked();
          }
          const current = await EstimateDesignRevisionModel.findOne({ drawingId })
            .sort({ revisionNumber: -1 })
            .session(session)
            .lean();
          if (!current || Number(current.revisionNumber) !== change.version) {
            staleDrawing();
          }
          if (!estimateAllowsDrawingEdit(String(currentEstimate.status), current)) {
            drawingLocked();
          }
          if (!["draft", "changes_requested"].includes(String(current.reviewStatus))) {
            drawingLocked();
          }
          await guardDesignLifecycle(currentEstimate, session);
          const currentTaxonomy = taxonomyForEstimate(currentEstimate);
          const currentRoomId = change.roomId ?? currentDrawing.roomId ?? null;
          const currentScopeSectionId =
            change.scopeSectionId ?? currentDrawing.scopeSectionId ?? null;
          validateMapping(currentRoomId, currentScopeSectionId, currentTaxonomy);
          const currentVerified = change.verified ?? Boolean(currentDrawing.verified);
          if (currentVerified && (!currentRoomId || !currentScopeSectionId)) {
            throw new ApiError(
              400,
              "INVALID_ESTIMATE_MAPPING",
              "Verified drawings require a room and enabled scope."
            );
          }
          const currentPage = await EstimateDesignSourcePageModel.findById(
            currentDrawing.sourcePageId
          )
            .session(session)
            .lean();
          if (!currentPage) throw estimateNotFound();
          const currentCrop = change.crop ? { ...change.crop } : { ...current.crop };
          if (
            !cropIsWithinPage(
              currentCrop,
              Number(currentPage.width),
              Number(currentPage.height)
            )
          ) {
            throw new ApiError(
              400,
              "INVALID_WORKER_RESULT",
              "Drawing crops must remain within their source page."
            );
          }
          const currentDisplayTitle =
            change.displayTitle?.replace(/\s+/g, " ").trim() ??
            String(currentDrawing.displayTitle);
          const revision = {
            _id: randomUUID(),
            drawingId,
            revisionNumber: change.version + 1,
            sourcePageId: currentDrawing.sourcePageId,
            crop: currentCrop,
            croppedFileReference,
            roomId: currentRoomId ?? "",
            scopeSectionId: currentScopeSectionId ?? "",
            label: currentDisplayTitle,
            reviewStatus: "draft",
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            changeSummary: null,
            annotationLayerId: null,
            replacesRevisionId: current._id
          };
          const guarded = await EstimateDesignRevisionModel.updateOne(
            {
              _id: current._id,
              drawingId,
              revisionNumber: change.version,
              reviewStatus: { $in: ["draft", "changes_requested"] }
            },
            {
              $set: { reviewStatus: current.reviewStatus },
              $currentDate: { updatedAt: true }
            },
            { session }
          );
          if (guarded.matchedCount !== 1) staleDrawing();
          await EstimateDesignRevisionModel.create([revision], { session });
          const updated = await EstimateDesignDrawingModel.updateOne(
            {
              _id: drawingId,
              active: true,
              uploadId: currentDrawing.uploadId,
              sourcePageId: currentDrawing.sourcePageId,
              displayTitle: currentDrawing.displayTitle,
              roomId: currentDrawing.roomId ?? null,
              scopeSectionId: currentDrawing.scopeSectionId ?? null,
              verified: Boolean(currentDrawing.verified)
            },
            {
              $set: {
                displayTitle: currentDisplayTitle,
                roomId: currentRoomId,
                scopeSectionId: currentScopeSectionId,
                verified: currentVerified
              }
            },
            { session }
          );
          if (updated.matchedCount !== 1) staleDrawing();
          savedDrawing = {
            ...currentDrawing,
            displayTitle: currentDisplayTitle,
            roomId: currentRoomId,
            scopeSectionId: currentScopeSectionId,
            verified: currentVerified
          };
          savedRevision = revision;
        });
      } catch (error) {
        if (generatedReference) await cleanupReferences(input.storage, [generatedReference]);
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 11000
        ) {
          staleDrawing();
        }
        throw error;
      }
      if (!savedDrawing || !savedRevision) {
        throw new Error("Estimate drawing transaction did not complete.");
      }
      return {
        ...drawingDto(savedDrawing),
        revision: revisionDto(savedRevision)
      };
    },

    async submitDrawings(user, estimateId) {
      const submittedAt = now();
      await requireOwnedEstimate(user, estimateId);
      const requestDrawings = await EstimateDesignDrawingModel.find({
        estimateId,
        active: true
      })
        .sort({ _id: 1 })
        .lean();
      const requestRevisionIds = new Map<string, string | null>();
      for (const drawing of requestDrawings) {
        const revision = await EstimateDesignRevisionModel.findOne({
          drawingId: drawing._id
        })
          .sort({ revisionNumber: -1 })
          .lean();
        requestRevisionIds.set(
          String(drawing._id),
          revision ? String(revision._id) : null
        );
      }
      let submittedCount = 0;
      await withMongoTransaction(async (session) => {
        const estimate = await requireOwnedEstimate(user, estimateId, session);
        if (
          !isEstimateDesignEditable(estimate.status) &&
          !["sent_to_client", "client_changes_requested"].includes(
            String(estimate.status)
          )
        ) {
          throw new ApiError(
            409,
            "ESTIMATE_DESIGN_LOCKED",
            "This estimate design is read-only."
          );
        }
        const taxonomy = taxonomyForEstimate(estimate);
        const drawings = await EstimateDesignDrawingModel.find({
          estimateId,
          active: true
        })
          .sort({ _id: 1 })
          .session(session)
          .lean();
        if (drawings.length === 0) {
          throw new ApiError(
            409,
            "ESTIMATE_DRAWINGS_EMPTY",
            "Add at least one drawing before submitting."
          );
        }
        if (
          drawings.length !== requestDrawings.length ||
          drawings.some(
            (drawing, index) =>
              String(drawing._id) !== String(requestDrawings[index]?._id)
          )
        ) {
          staleDrawing();
        }
        const latest: Array<Record<string, any> | null> = [];
        for (const drawing of drawings) {
          latest.push(
            await EstimateDesignRevisionModel.findOne({
              drawingId: drawing._id
            })
              .sort({ revisionNumber: -1 })
              .session(session)
              .lean()
          );
        }
        if (
          latest.some(
            (revision, index) =>
              (revision ? String(revision._id) : null) !==
              requestRevisionIds.get(String(drawings[index]!._id))
          )
        ) {
          staleDrawing();
        }
        for (let index = 0; index < drawings.length; index += 1) {
          const drawing = drawings[index]!;
          const revision = latest[index];
          validateMapping(
            drawing.roomId ?? null,
            drawing.scopeSectionId ?? null,
            taxonomy
          );
          if (!revision || revision.reviewStatus === "changes_requested") {
            unverifiedDrawings();
          }
          if (
            revision.reviewStatus !== "approved" &&
            (!drawing.verified || revision.reviewStatus !== "draft")
          ) {
            unverifiedDrawings();
          }
        }
        const draftLatest = latest.filter(
          (revision): revision is Record<string, any> =>
            Boolean(revision && revision.reviewStatus === "draft")
        );
        if (draftLatest.length === 0) unverifiedDrawings();
        const uploadIdSet = new Set<string>();
        for (let index = 0; index < drawings.length; index += 1) {
          const revision = latest[index];
          if (revision?.reviewStatus !== "draft") continue;
          uploadIdSet.add(String(drawings[index]!.uploadId));
          const sourcePage = await EstimateDesignSourcePageModel.findById(
            revision.sourcePageId
          ).session(session).lean();
          if (!sourcePage) throw estimateNotFound();
          uploadIdSet.add(String(sourcePage.uploadId));
        }
        const uploadIds = [...uploadIdSet];
        const uploadStates: Array<{
          upload: Record<string, any>;
          job: Record<string, any>;
        }> = [];
        for (const uploadId of uploadIds) {
          const upload = await EstimateDesignUploadModel.findById(uploadId)
            .session(session)
            .lean();
          const job = await EstimateDesignExtractionJobModel.findOne({
            uploadId
          })
            .session(session)
            .lean();
          if (
            !upload ||
            !job ||
            String(upload.estimateId) !== estimateId ||
            String(upload.extractionStatus) !== "estimator_review" ||
            String(job.status) !== "estimator_review"
          ) {
            extractionStateConflict();
          }
          uploadStates.push({ upload, job });
        }
        await guardDesignLifecycle(estimate, session);
        const revisionIds = draftLatest.map((revision) => revision._id);
        const updated = await EstimateDesignRevisionModel.updateMany(
          { _id: { $in: revisionIds }, reviewStatus: { $in: ["draft"] } },
          { $set: { reviewStatus: "submitted", submittedAt } },
          { session }
        );
        if (
          updated.matchedCount !== revisionIds.length ||
          updated.modifiedCount !== revisionIds.length
        ) {
          staleDrawing();
        }
        for (const { upload, job } of uploadStates) {
          const uploadUpdated = await EstimateDesignUploadModel.updateOne(
            {
              _id: upload._id,
              estimateId,
              extractionStatus: "estimator_review"
            },
            { $set: { extractionStatus: "submitted" } },
            { session }
          );
          requireTransition(uploadUpdated, extractionStateConflict);
          const jobUpdated = await EstimateDesignExtractionJobModel.updateOne(
            {
              _id: job._id,
              uploadId: upload._id,
              status: "estimator_review"
            },
            { $set: { status: "submitted" } },
            { session }
          );
          requireTransition(jobUpdated, extractionStateConflict);
        }
        submittedCount = revisionIds.length;
      });
      return { submittedCount };
    }
  };

  async function requireOwnedEstimate(
    user: AuthenticatedUser,
    estimateId: string,
    session?: mongoose.ClientSession
  ) {
    if (user.role !== "estimator_sales") forbidden();
    const estimateQuery = EstimateModel.findOne({
      _id: estimateId,
      ownerId: user.id
    });
    if (session) estimateQuery.session(session);
    const estimate = await estimateQuery.lean();
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

  async function advanceDesignLifecycle(
    estimate: Record<string, any>,
    session: mongoose.ClientSession
  ) {
    await guardDesignLifecycle(estimate, session);
  }

  async function requireClientEstimate(
    user: AuthenticatedUser,
    estimateId: string,
    session?: mongoose.ClientSession
  ) {
    if (user.role !== "client") forbidden();
    const estimateQuery = EstimateModel.findById(estimateId);
    if (session) estimateQuery.session(session);
    const estimate = await estimateQuery.lean();
    if (
      !estimate ||
      !["sent_to_client", "client_changes_requested", "client_approved"].includes(
        String(estimate.status)
      )
    ) {
      throw estimateNotFound();
    }
    const leadQuery = LeadModel.findById(estimate.leadId);
    if (session) leadQuery.session(session);
    const lead = await leadQuery.lean();
    if (
      !lead ||
      normalizeEmail(String(lead.clientEmail)) !== normalizeEmail(user.email)
    ) {
      throw estimateNotFound();
    }
    return { estimate, lead };
  }

  async function requireClientRevision(
    user: AuthenticatedUser,
    revisionId: string,
    session?: mongoose.ClientSession
  ) {
    if (user.role !== "client") forbidden();
    const revisionQuery = EstimateDesignRevisionModel.findById(revisionId);
    if (session) revisionQuery.session(session);
    const revision = await revisionQuery.lean();
    if (
      !revision ||
      !["submitted", "approved", "changes_requested"].includes(
        String(revision.reviewStatus)
      )
    ) {
      throw estimateNotFound();
    }
    const drawingQuery = EstimateDesignDrawingModel.findById(revision.drawingId);
    if (session) drawingQuery.session(session);
    const drawing = await drawingQuery.lean();
    if (!drawing || !drawing.active) throw estimateNotFound();
    const { estimate } = await requireClientEstimate(
      user,
      String(drawing.estimateId),
      session
    );
    const latestQuery = EstimateDesignRevisionModel.findOne({
      drawingId: drawing._id
    }).sort({ revisionNumber: -1 });
    if (session) latestQuery.session(session);
    const latest = await latestQuery.lean();
    if (!latest || String(latest._id) !== revisionId) throw estimateNotFound();
    return { revision, drawing, estimate };
  }

  async function refreshUploadReviewStatus(
    uploadId: string,
    estimateId: string,
    session: mongoose.ClientSession
  ) {
    const drawings = await EstimateDesignDrawingModel.find({
      uploadId,
      estimateId,
      active: true
    }).session(session).lean();
    const statuses: string[] = [];
    for (const drawing of drawings) {
      const latest = await EstimateDesignRevisionModel.findOne({
        drawingId: drawing._id
      }).sort({ revisionNumber: -1 }).session(session).lean();
      if (latest) statuses.push(String(latest.reviewStatus));
    }
    const aggregate = statuses.length > 0 && statuses.every((status) => status === "approved")
      ? "approved"
      : statuses.includes("changes_requested")
        ? "changes_requested"
        : "submitted";
    const upload = await EstimateDesignUploadModel.updateOne(
      {
        _id: uploadId,
        estimateId,
        extractionStatus: { $in: ["submitted", "changes_requested", "approved"] }
      },
      { $set: { extractionStatus: aggregate } },
      { session }
    );
    requireMatchedTransition(upload, extractionStateConflict);
    const job = await EstimateDesignExtractionJobModel.updateOne(
      {
        uploadId,
        status: { $in: ["submitted", "changes_requested", "approved"] }
      },
      { $set: { status: aggregate } },
      { session }
    );
    requireMatchedTransition(job, extractionStateConflict);
    return aggregate;
  }

  async function mirrorUploadReviewStatus(
    uploadId: string,
    estimateId: string,
    aggregate: "submitted" | "changes_requested" | "approved",
    session: mongoose.ClientSession
  ) {
    const upload = await EstimateDesignUploadModel.updateOne(
      {
        _id: uploadId,
        estimateId,
        extractionStatus: {
          $in: ["estimator_review", "submitted", "changes_requested", "approved"]
        }
      },
      { $set: { extractionStatus: aggregate } },
      { session }
    );
    requireMatchedTransition(upload, extractionStateConflict);
    const job = await EstimateDesignExtractionJobModel.updateOne(
      {
        uploadId,
        status: {
          $in: ["estimator_review", "submitted", "changes_requested", "approved"]
        }
      },
      { $set: { status: aggregate } },
      { session }
    );
    requireMatchedTransition(job, extractionStateConflict);
  }

  async function transitionUploadForReplacement(
    uploadId: string,
    estimateId: string,
    session: mongoose.ClientSession
  ) {
    const upload = await EstimateDesignUploadModel.updateOne(
      { _id: uploadId, estimateId, extractionStatus: "changes_requested" },
      { $set: { extractionStatus: "estimator_review" } },
      { session }
    );
    requireTransition(upload, staleReplacement);
    const job = await EstimateDesignExtractionJobModel.updateOne(
      { uploadId, status: "changes_requested" },
      { $set: { status: "estimator_review" } },
      { session }
    );
    requireTransition(job, staleReplacement);
  }

  async function nextPageNumber(
    uploadId: string,
    session: mongoose.ClientSession
  ) {
    const pages = await EstimateDesignSourcePageModel.find({ uploadId })
      .sort({ pageNumber: -1 })
      .session(session)
      .lean();
    return pages.reduce(
      (maximum, page) => Math.max(maximum, Number(page.pageNumber)),
      0
    ) + 1;
  }

  async function queueReplacement(
    user: AuthenticatedUser,
    estimate: Record<string, any> & { _id: string; leadId: string },
    drawing: Record<string, any>,
    revision: Record<string, any>,
    file: ValidatedUpload
  ) {
    let stored: { reference: string };
    try {
      stored = await input.storage.save({ data: file.data, extension: file.extension });
    } catch {
      throw new ApiError(503, "FILE_STORAGE_ERROR", "The replacement file could not be stored.");
    }
    const uploadId = randomUUID();
    const uploadedAt = now();
    try {
      await persistReplacementUploadAndJob({
        uploadId,
        estimate,
        user,
        file,
        storedFileReference: stored.reference,
        uploadedAt,
        drawingId: String(drawing._id),
        revisionId: String(revision._id),
        version: Number(revision.revisionNumber)
      });
    } catch (error) {
      await cleanupReferences(input.storage, [stored.reference]);
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        staleReplacement();
      }
      throw error;
    }
    return {
      queued: true,
      upload: uploadDto({
        _id: uploadId,
        estimateId: estimate._id,
        leadId: estimate.leadId,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        uploaderId: user.id,
        uploadedAt,
        extractionStatus: "queued",
        failureCode: null,
        failureMessage: null
      })
    };
  }

  async function completeQueuedReplacement(
    job: Record<string, any>,
    upload: Record<string, any>,
    claimToken: string,
    processedAt: string,
    resultId: string,
    page: {
      pageNumber: number;
      width: number;
      height: number;
      image: Buffer;
    }
  ) {
    const stored = await saveGeneratedImage(input.storage, page.image);
    const pageId = randomUUID();
    const revisionId = randomUUID();
    let completedJob: Record<string, any> | null = null;
    let cancelled = false;
    try {
      await withMongoTransaction(async (session) => {
        const currentJob = await EstimateDesignExtractionJobModel.findById(job._id)
          .session(session)
          .lean();
        if (!currentJob) throw estimateNotFound();
        requireEstimateClaim(currentJob, claimToken, processedAt);
        const currentUpload = await EstimateDesignUploadModel.findById(upload._id)
          .session(session)
          .lean();
        if (
          !currentUpload ||
          currentUpload.extractionStatus !== "processing" ||
          String(currentUpload.replacementDrawingId) !==
            String(upload.replacementDrawingId) ||
          String(currentUpload.replacesRevisionId) !==
            String(upload.replacesRevisionId) ||
          Number(currentUpload.replacementVersion) !==
            Number(upload.replacementVersion)
        ) {
          extractionStateConflict();
        }
        const currentEstimate = await EstimateModel.findById(
          currentUpload.estimateId
        ).session(session).lean();
        if (!currentEstimate) throw estimateNotFound();
        if (estimateDesignIsFrozen(currentEstimate)) {
          completedJob = await terminallyCancelFrozenWorkerJob(
            currentJob,
            currentUpload,
            claimToken,
            processedAt,
            session
          );
          cancelled = true;
          return;
        }
        const drawing = await EstimateDesignDrawingModel.findById(
          currentUpload.replacementDrawingId
        ).session(session).lean();
        if (
          !drawing ||
          !drawing.active ||
          String(drawing.estimateId) !== String(currentUpload.estimateId)
        ) {
          staleReplacement();
        }
        const current = await EstimateDesignRevisionModel.findOne({
          drawingId: drawing._id
        }).sort({ revisionNumber: -1 }).session(session).lean();
        if (
          !current ||
          String(current._id) !== String(currentUpload.replacesRevisionId) ||
          Number(current.revisionNumber) !==
            Number(currentUpload.replacementVersion) ||
          current.reviewStatus !== "changes_requested"
          || String(current.replacementUploadId) !== String(currentUpload._id)
        ) {
          staleReplacement();
        }
        await guardDesignLifecycle(currentEstimate, session);
        await EstimateDesignSourcePageModel.create([{
          _id: pageId,
          uploadId: currentUpload._id,
          pageNumber: 1,
          normalizedFileReference: stored.reference,
          width: page.width,
          height: page.height
        }], { session });
        await EstimateDesignRevisionModel.create([{
          _id: revisionId,
          drawingId: drawing._id,
          revisionNumber: Number(current.revisionNumber) + 1,
          sourcePageId: pageId,
          crop: { x: 0, y: 0, width: page.width, height: page.height },
          croppedFileReference: stored.reference,
          roomId: String(current.roomId),
          scopeSectionId: String(current.scopeSectionId),
          label: String(current.label),
          reviewStatus: "draft",
          submittedAt: null,
          reviewerId: null,
          reviewedAt: null,
          changeSummary: null,
          annotationLayerId: null,
          annotations: null,
          replacesRevisionId: current._id
        }], { session });
        const drawingUpdated = await EstimateDesignDrawingModel.updateOne(
          { _id: drawing._id, active: true, verified: Boolean(drawing.verified) },
          { $set: { sourcePageId: pageId, verified: false } },
          { session }
        );
        requireMatchedTransition(drawingUpdated, staleReplacement);
        const completed = await EstimateDesignExtractionJobModel.updateOne(
          {
            _id: currentJob._id,
            uploadId: currentUpload._id,
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
              workerResultId: resultId
            }
          },
          { session }
        );
        requireTransition(completed, staleClaim);
        const replacementUpload = await EstimateDesignUploadModel.updateOne(
          {
            _id: currentUpload._id,
            estimateId: currentUpload.estimateId,
            extractionStatus: "processing"
          },
          { $set: { extractionStatus: "estimator_review" } },
          { session }
        );
        requireTransition(replacementUpload, extractionStateConflict);
        await transitionUploadForReplacement(
          String(drawing.uploadId),
          String(drawing.estimateId),
          session
        );
        completedJob = {
          ...currentJob,
          status: "estimator_review",
          completedAt: new Date(processedAt),
          leaseExpiresAt: null,
          claimId: null,
          workerResultId: resultId
        };
      });
      if (!completedJob) {
        throw new Error("Estimate replacement completion transaction did not complete.");
      }
      if (cancelled) await cleanupReferences(input.storage, [stored.reference]);
      return workerJobDto(completedJob);
    } catch (error) {
      await cleanupReferences(input.storage, [stored.reference]);
      throw error;
    }
  }
}

async function persistUploadAndJob(input: {
  uploadId: string;
  estimate: { _id: string; leadId: string };
  user: AuthenticatedUser;
  file: ValidatedUpload;
  storedFileReference: string;
  uploadedAt: Date;
  replacement?: { drawingId: string; revisionId: string; version: number };
}) {
  const session = await mongoose.startSession();
  let completed = false;
  try {
    await session.withTransaction(async () => {
      const currentEstimate = await EstimateModel.findOne({
        _id: input.estimate._id,
        ownerId: input.user.id
      }).session(session).lean();
      if (!currentEstimate) throw estimateNotFound();
      await guardDesignLifecycle(currentEstimate, session);
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
          replacementDrawingId: input.replacement?.drawingId ?? null,
          replacesRevisionId: input.replacement?.revisionId ?? null,
          replacementVersion: input.replacement?.version ?? null,
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

async function persistReplacementUploadAndJob(input: {
  uploadId: string;
  estimate: { _id: string; leadId: string };
  user: AuthenticatedUser;
  file: ValidatedUpload;
  storedFileReference: string;
  uploadedAt: Date;
  drawingId: string;
  revisionId: string;
  version: number;
}) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const drawing = await EstimateDesignDrawingModel.findById(input.drawingId)
        .session(session)
        .lean();
      const estimate = drawing
        ? await EstimateModel.findOne({
            _id: drawing.estimateId,
            ownerId: input.user.id
          }).session(session).lean()
        : null;
      const latest = drawing
        ? await EstimateDesignRevisionModel.findOne({
            drawingId: drawing._id
          }).sort({ revisionNumber: -1 }).session(session).lean()
        : null;
      if (
        input.user.role !== "estimator_sales" ||
        !drawing ||
        !drawing.active ||
        !estimate ||
        String(estimate._id) !== String(input.estimate._id) ||
        !latest ||
        String(latest._id) !== input.revisionId ||
        Number(latest.revisionNumber) !== input.version ||
        latest.reviewStatus !== "changes_requested"
      ) {
        staleReplacement();
      }
      await guardDesignLifecycle(estimate, session);
      const reserved = await EstimateDesignRevisionModel.updateOne(
        {
          _id: latest._id,
          drawingId: drawing._id,
          revisionNumber: input.version,
          reviewStatus: "changes_requested",
          replacementUploadId: { $in: [null] }
        },
        { $set: { replacementUploadId: input.uploadId } },
        { session }
      );
      requireMatchedTransition(reserved, staleReplacement);
      await EstimateDesignUploadModel.create([{
        _id: input.uploadId,
        estimateId: estimate._id,
        leadId: estimate.leadId,
        originalFilename: input.file.originalFilename,
        storedFileReference: input.storedFileReference,
        mimeType: input.file.mimeType,
        sizeBytes: input.file.sizeBytes,
        uploaderId: input.user.id,
        uploadedAt: input.uploadedAt,
        extractionStatus: "queued",
        replacementDrawingId: drawing._id,
        replacesRevisionId: latest._id,
        replacementVersion: latest.revisionNumber,
        failureCode: null,
        failureMessage: null
      }], { session });
      await EstimateDesignExtractionJobModel.create([{
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
      }], { session });
    });
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

function clientDrawingDto(
  drawing: Record<string, unknown>,
  revision: Record<string, unknown>,
  page: Record<string, unknown>
) {
  return {
    ...drawingDto(drawing),
    uploadId: String(page.uploadId),
    sourcePageId: String(revision.sourcePageId),
    verified: true,
    roomId: revision.roomId ?? null,
    scopeSectionId: revision.scopeSectionId ?? null,
    displayTitle: String(revision.label)
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
    annotations: revision.annotations ?? null,
    replacementUploadId: revision.replacementUploadId ?? null,
    replacesRevisionId: revision.replacesRevisionId ?? null
  };
}

function annotationDraftDto(draft: Record<string, unknown>) {
  return {
    id: String(draft._id),
    revisionId: String(draft.revisionId),
    version: Number(draft.version),
    annotations: draft.annotations
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

function extractionStateConflict(): never {
  throw new ApiError(
    409,
    "ESTIMATE_EXTRACTION_STATE_CONFLICT",
    "The estimate extraction state changed before this transition."
  );
}

function staleDrawing(): never {
  throw new ApiError(
    409,
    "STALE_ESTIMATE_DRAWING",
    "A drawing changed before this update."
  );
}

function staleAnnotation(): never {
  throw new ApiError(
    409,
    "STALE_ESTIMATE_ANNOTATION",
    "The annotation draft changed before this update."
  );
}

function staleReplacement(): never {
  throw new ApiError(
    409,
    "STALE_ESTIMATE_DRAWING",
    "The drawing changed before this replacement."
  );
}

function designLifecycleConflict(): never {
  throw new ApiError(
    409,
    "ESTIMATE_DESIGN_LIFECYCLE_CONFLICT",
    "The estimate design lifecycle changed before this operation."
  );
}

function drawingLocked(): never {
  throw new ApiError(
    409,
    "ESTIMATE_DRAWING_LOCKED",
    "This drawing revision is read-only."
  );
}

function estimateAllowsDrawingEdit(
  estimateStatus: string,
  revision: Record<string, any>
) {
  return (
    isEstimateDesignEditable(estimateStatus) ||
    (
      ["sent_to_client", "client_changes_requested"].includes(estimateStatus) &&
      revision.reviewStatus === "draft" &&
      Boolean(revision.replacesRevisionId)
    )
  );
}

function unverifiedDrawings(): never {
  throw new ApiError(
    409,
    "ESTIMATE_DRAWINGS_UNVERIFIED",
    "Verify every active drawing before submitting."
  );
}

function requireTransition(
  result: { matchedCount: number; modifiedCount: number },
  conflict: () => never
) {
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) conflict();
}

function requireMatchedTransition(
  result: { matchedCount: number },
  conflict: () => never
) {
  if (result.matchedCount !== 1) conflict();
}

function lifecycleVersionFilter(version: number) {
  return version === 0 ? { $in: [0, null] } : version;
}

function estimateDesignIsFrozen(estimate: Record<string, any>) {
  return Boolean(estimate.designFrozenAt) || estimate.status === "client_approved";
}

async function terminallyCancelFrozenWorkerJob(
  job: Record<string, any>,
  upload: Record<string, any>,
  claimToken: string,
  cancelledAt: string,
  session: mongoose.ClientSession
) {
  const cancelled = await EstimateDesignExtractionJobModel.findOneAndUpdate(
    {
      _id: job._id,
      uploadId: upload._id,
      status: "processing",
      claimId: claimToken,
      leaseExpiresAt: { $gt: new Date(cancelledAt) }
    },
    {
      $set: {
        status: "processing_failed",
        completedAt: new Date(cancelledAt),
        leaseExpiresAt: null,
        claimId: null,
        failureCode: frozenEstimateJobFailure.code,
        failureMessage: frozenEstimateJobFailure.message,
        workerResultId: null
      }
    },
    { new: true, runValidators: true, session }
  ).lean();
  if (!cancelled) staleClaim();
  const uploadUpdated = await EstimateDesignUploadModel.updateOne(
    {
      _id: upload._id,
      estimateId: upload.estimateId,
      extractionStatus: { $in: ["queued", "processing"] }
    },
    {
      $set: {
        extractionStatus: "processing_failed",
        failureCode: frozenEstimateJobFailure.code,
        failureMessage: frozenEstimateJobFailure.message
      }
    },
    { session }
  );
  requireTransition(uploadUpdated, extractionStateConflict);
  return cancelled;
}

async function guardDesignLifecycle(
  estimate: Record<string, any>,
  session: mongoose.ClientSession
) {
  const expectedVersion = Number(estimate.designLifecycleVersion ?? 0);
  const guarded = await EstimateModel.updateOne(
    {
      _id: estimate._id,
      designLifecycleVersion: lifecycleVersionFilter(expectedVersion),
      designFrozenAt: { $in: [null] },
      status: { $in: mutableDesignEstimateStatuses }
    },
    {
      $inc: { designLifecycleVersion: 1 },
      $currentDate: { designLifecycleUpdatedAt: true }
    },
    { session }
  );
  requireMatchedTransition(guarded, designLifecycleConflict);
}

function equivalentChangeRequest(
  revision: Record<string, any>,
  reviewerId: string,
  decision: Extract<DrawingDecisionInput, { decision: "request_changes" }>
) {
  return (
    revision.reviewStatus === "changes_requested" &&
    Number(revision.revisionNumber) === decision.version &&
    String(revision.reviewerId) === reviewerId &&
    revision.changeSummary === decision.summary &&
    JSON.stringify(revision.annotations) === JSON.stringify(decision.annotations)
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
