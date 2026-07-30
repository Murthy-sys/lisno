import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import sharp, { type Metadata } from "sharp";
import {
  isEstimateDesignEditable,
  type AnnotationDocumentV1,
  type EstimateDesignExtractionStatus
} from "../domain/estimate-design.js";
import {
  assertEstimateDesignMapping,
  assignEstimateItem as resolveEstimateItemAssignment,
  autoMapDrawingTitle,
  InvalidEstimateDesignAssignmentError,
  mappingContextForEstimate
} from "../domain/estimate-design-mapping.js";
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
import type { AuditService, AuditWrite } from "./audit.service.js";
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
  audit: AuditService;
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
  canRetry: boolean;
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

type EditEstimateDrawingBase = {
  version: number;
  displayTitle?: string;
  crop?: CropRect;
  verified?: boolean;
};

export type ExactMappingChange = {
  roomId: string;
  catalogueId: string;
};

export type LegacyMappingChange = {
  roomId: string;
  scopeSectionId: string;
};

export type DeprecatedMappingChange = ExactMappingChange | LegacyMappingChange;

export type EditEstimateDrawingInput = EditEstimateDrawingBase & (
  | DeprecatedMappingChange
  | { roomId?: never; catalogueId?: never; scopeSectionId?: never }
);

export interface AssignEstimateItemInput extends ExactMappingChange {
  version: number;
}

export type CreateManualEstimateDrawingInput = {
  displayTitle: string;
  crop: CropRect;
} & DeprecatedMappingChange;

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
  createManualDrawing(
    user: AuthenticatedUser,
    pageId: string,
    input: CreateManualEstimateDrawingInput
  ): Promise<Record<string, unknown>>;
  assignEstimateItem(
    user: AuthenticatedUser,
    drawingId: string,
    input: AssignEstimateItemInput
  ): Promise<Record<string, unknown>>;
  editDrawing(user: AuthenticatedUser, drawingId: string, change: EditEstimateDrawingInput): Promise<Record<string, unknown>>;
  retryUpload(user: AuthenticatedUser, uploadId: string): Promise<EstimateDesignUploadDto>;
  removeDrawing(user: AuthenticatedUser, drawingId: string, version: number): Promise<{ id: string; active: false }>;
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
          uploadedAt,
          audit: input.audit
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
        failureMessage: null,
        canRetry: false
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
        uploads: await Promise.all(
          uploads.map(async (upload) =>
            uploadDto(upload, await canRetryUpload(upload))
          )
        ),
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
        uploads: uploads.map((upload) => uploadDto(upload)),
        pages: [...pages.values()],
        drawings: visibleDrawings,
        revisions,
        readiness: await calculateApprovalReadiness(user, estimateId)
      };
    },

    async saveAnnotationDraft(user, revisionId, draftInput) {
      const initial = await requireClientRevision(user, revisionId);
      requireAnnotationDimensions(initial.revision, draftInput.annotations);
      let draft: Record<string, any> | null = null;
      try {
        await withMongoTransaction(async (session) => {
          const current = await requireClientRevision(user, revisionId, session);
          requireAnnotationDimensions(current.revision, draftInput.annotations);
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
          await appendEstimateDesignAudit(input.audit, session, {
            actorId: user.id,
            action: "estimate_design_annotation_draft_saved",
            entityType: "estimate_design_revision",
            entityId: revisionId,
            occurredAt: now().toISOString(),
            newValues: {
              revisionNumber: Number(current.revision.revisionNumber),
              draftVersion: Number(draft.version),
              elementCount: draftInput.annotations.elements.length,
              imageWidth: draftInput.annotations.imageWidth,
              imageHeight: draftInput.annotations.imageHeight
            }
          });
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
      if (decision.decision === "request_changes") {
        requireAnnotationDimensions(initial.revision, decision.annotations);
      }
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
        if (decision.decision === "request_changes") {
          requireAnnotationDimensions(current.revision, decision.annotations);
        }
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
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: user.id,
          action: decision.decision === "approve"
            ? "estimate_design_drawing_approved"
            : "estimate_design_changes_requested",
          entityType: "estimate_design_revision",
          entityId: revisionId,
          occurredAt: reviewedAt.toISOString(),
          oldValues: {
            reviewStatus: "submitted"
          },
          newValues: {
            reviewStatus: update.reviewStatus,
            revisionNumber: Number(current.revision.revisionNumber),
            ...(decision.decision === "request_changes"
              ? {
                  summaryLength: decision.summary.trim().length,
                  annotationCount: decision.annotations.elements.length
                }
              : {})
          }
        });
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
        let revision: Record<string, any> | null = null;
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
          revision = {
            _id: randomUUID(),
            drawingId,
            revisionNumber: replacement.version + 1,
            sourcePageId: pageId,
            crop: { x: 0, y: 0, width: metadata.width!, height: metadata.height! },
            croppedFileReference: stored.reference,
            ...mappingSnapshot(currentDrawing),
            label: String(current.label),
            reviewStatus: "draft",
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            changeSummary: null,
            annotationLayerId: null,
            annotations: null,
            replacesRevisionId: current._id
          };
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
          await appendEstimateDesignAudit(input.audit, session, {
            actorId: user.id,
            action: "estimate_design_replacement_created",
            entityType: "estimate_design_drawing",
            entityId: drawingId,
            occurredAt: now().toISOString(),
            oldValues: {
              revisionNumber: Number(current.revisionNumber),
              reviewStatus: String(current.reviewStatus)
            },
            newValues: {
              revisionId: String(revision._id),
              revisionNumber: Number(revision.revisionNumber),
              width: Number(metadata.width),
              height: Number(metadata.height)
            }
          });
        });
        return {
          ...drawingDto({ ...drawing, sourcePageId: pageId, verified: false }),
          revision: revisionDto(revision!)
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
      let outcome:
        | ClaimedEstimateWorkerJob
        | CancelledEstimateWorkerJobClaim
        | null = null;
      await withMongoTransaction(async (session) => {
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
          { new: true, runValidators: true, session }
        ).lean();
        if (!job) return;
        const upload = await EstimateDesignUploadModel.findById(job.uploadId)
          .session(session)
          .lean();
        const estimate = upload
          ? await EstimateModel.findById(upload.estimateId)
              .session(session)
              .lean()
          : null;
        if (!upload || !estimate) {
          throw new ApiError(
            500,
            "EXTRACTION_JOB_INVALID",
            "The extraction job source is unavailable."
          );
        }
        if (estimateDesignIsFrozen(estimate)) {
          await terminallyCancelFrozenWorkerJob(
            job,
            upload,
            claimId,
            at,
            session
          );
          outcome = { cancelled: true };
          return;
        }
        const uploadUpdated = await EstimateDesignUploadModel.updateOne(
          {
            _id: upload._id,
            estimateId: upload.estimateId,
            extractionStatus: { $in: ["queued", "processing"] }
          },
          {
            $set: {
              extractionStatus: "processing",
              failureCode: null,
              failureMessage: null
            }
          },
          { session }
        );
        requireMatchedTransition(uploadUpdated, extractionStateConflict);
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: "system-estimate-ocr-worker",
          action: "estimate_design_extraction_claimed",
          entityType: "estimate",
          entityId: String(upload.estimateId),
          occurredAt: new Date(at).toISOString(),
          newValues: {
            uploadId: String(upload._id),
            jobId: String(job._id),
            attemptCount: Number(job.attemptCount)
          }
        });
        outcome = {
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
      });
      return outcome;
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
      const mappingContext = mappingContextForEstimate(estimate);
      const normalized = await normalizeEstimateResult(result, input.maxUploadBytes);
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
            const { mapping } = autoMapDrawingTitle(
              section.proposal.detectedTitle,
              mappingContext
            );
            drawingDocuments.push({
              _id: drawingId,
              uploadId: upload._id,
              sourcePageId: pageId,
              estimateId: upload.estimateId,
              active: true,
              verified: false,
              ...mapping,
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
              ...mapping,
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
            JSON.stringify(taxonomyForEstimate(currentEstimate)) !== JSON.stringify(taxonomy) ||
            JSON.stringify(mappingContextForEstimate(currentEstimate)) !== JSON.stringify(mappingContext)
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
          if (pageDocuments.length) await EstimateDesignSourcePageModel.create(pageDocuments, { session, ordered: true });
          if (drawingDocuments.length) await EstimateDesignDrawingModel.create(drawingDocuments, { session, ordered: true });
          if (revisionDocuments.length) await EstimateDesignRevisionModel.create(revisionDocuments, { session, ordered: true });
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
          await appendEstimateDesignAudit(input.audit, session, {
            actorId: "system-estimate-ocr-worker",
            action: "estimate_design_extraction_completed",
            entityType: "estimate",
            entityId: String(currentUpload.estimateId),
            occurredAt: new Date(processedAt).toISOString(),
            newValues: {
              uploadId: String(currentUpload._id),
              workerResultId: result.resultId,
              pageCount: pageDocuments.length,
              drawingCount: drawingDocuments.length
            }
          });
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
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: "system-estimate-ocr-worker",
          action: "estimate_design_extraction_failed",
          entityType: "estimate",
          entityId: String(currentUpload.estimateId),
          occurredAt: new Date(failedAt).toISOString(),
          newValues: {
            uploadId: String(currentUpload._id),
            failureCode: code
          }
        });
      });
      return workerJobDto(failed!);
    },

    async createManualDrawing(user, pageId, manualInput) {
      const page = await EstimateDesignSourcePageModel.findById(pageId).lean();
      if (!page) throw estimateNotFound();
      const upload = await EstimateDesignUploadModel.findById(page.uploadId).lean();
      if (!upload) throw estimateNotFound();
      const estimate = await requireOwnedEstimate(user, String(upload.estimateId));
      requireManualDrawingState(upload);
      resolveDeprecatedMapping(manualInput, estimate);
      if (
        !cropIsWithinPage(
          manualInput.crop,
          Number(page.width),
          Number(page.height)
        )
      ) {
        invalidManualCrop();
      }

      let generatedReference: string | null = null;
      let savedDrawing: Record<string, any> | null = null;
      let savedRevision: Record<string, any> | null = null;
      try {
        const source = await input.storage.read(String(page.normalizedFileReference));
        const image = await sharp(source)
          .extract({
            left: manualInput.crop.x,
            top: manualInput.crop.y,
            width: manualInput.crop.width,
            height: manualInput.crop.height
          })
          .png()
          .toBuffer();
        const stored = await input.storage.saveGenerated({
          data: image,
          extension: ".png"
        });
        generatedReference = stored.reference;

        await withMongoTransaction(async (session) => {
          const currentPage = await EstimateDesignSourcePageModel.findById(pageId)
            .session(session)
            .lean();
          if (!currentPage) throw estimateNotFound();
          const currentUpload = await EstimateDesignUploadModel.findById(
            currentPage.uploadId
          ).session(session).lean();
          if (
            !currentUpload ||
            String(currentUpload._id) !== String(upload._id) ||
            String(currentUpload.estimateId) !== String(upload.estimateId)
          ) {
            extractionStateConflict();
          }
          const currentEstimate = await requireOwnedEstimate(
            user,
            String(currentUpload.estimateId),
            session
          );
          requireManualDrawingState(currentUpload);
          await guardDesignLifecycle(currentEstimate, session);
          const mapping = resolveDeprecatedMapping(manualInput, currentEstimate);
          if (
            !cropIsWithinPage(
              manualInput.crop,
              Number(currentPage.width),
              Number(currentPage.height)
            )
          ) {
            invalidManualCrop();
          }

          const drawingId = randomUUID();
          const revisionId = randomUUID();
          const displayTitle = manualInput.displayTitle
            .replace(/\s+/g, " ")
            .trim();
          savedDrawing = {
            _id: drawingId,
            uploadId: currentUpload._id,
            sourcePageId: currentPage._id,
            estimateId: currentUpload.estimateId,
            active: true,
            verified: true,
            ...mapping,
            detectedTitle: displayTitle,
            displayTitle,
            source: "manual",
            roomConfidence: null,
            scopeConfidence: null,
            ocrConfidence: null,
            roomEvidence: [],
            scopeEvidence: []
          };
          savedRevision = {
            _id: revisionId,
            drawingId,
            revisionNumber: 1,
            sourcePageId: currentPage._id,
            crop: { ...manualInput.crop },
            croppedFileReference: generatedReference,
            ...mapping,
            label: displayTitle,
            reviewStatus: "draft",
            submittedAt: null,
            reviewerId: null,
            reviewedAt: null,
            changeSummary: null,
            annotationLayerId: null,
            annotations: null,
            replacementUploadId: null,
            replacesRevisionId: null
          };
          await EstimateDesignDrawingModel.create([savedDrawing], { session });
          await EstimateDesignRevisionModel.create([savedRevision], { session });

          if (currentUpload.extractionStatus === "processing_failed") {
            const uploadRecovered = await EstimateDesignUploadModel.updateOne(
              {
                _id: currentUpload._id,
                estimateId: currentUpload.estimateId,
                extractionStatus: "processing_failed"
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
            requireTransition(uploadRecovered, extractionStateConflict);
            const jobRecovered = await EstimateDesignExtractionJobModel.updateOne(
              {
                uploadId: currentUpload._id,
                status: "processing_failed"
              },
              {
                $set: {
                  status: "estimator_review",
                  failureCode: null,
                  failureMessage: null,
                  claimId: null,
                  leaseExpiresAt: null
                }
              },
              { session }
            );
            requireTransition(jobRecovered, extractionStateConflict);
          }
          await appendEstimateDesignAudit(input.audit, session, {
            actorId: user.id,
            action: "estimate_design_manual_drawing_created",
            entityType: "estimate_design_drawing",
            entityId: drawingId,
            occurredAt: now().toISOString(),
            newValues: {
              estimateId: String(currentUpload.estimateId),
              uploadId: String(currentUpload._id),
              sourcePageId: String(currentPage._id),
              revisionId,
              revisionNumber: 1,
              ...mapping,
              crop: { ...manualInput.crop }
            }
          });
        });
      } catch (error) {
        if (generatedReference) {
          await cleanupReferences(input.storage, [generatedReference]);
          throw error;
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          503,
          "FILE_STORAGE_ERROR",
          "The manual drawing crop could not be stored."
        );
      }
      if (!savedDrawing || !savedRevision) {
        throw new Error("Manual drawing transaction did not complete.");
      }
      return {
        ...drawingDto(savedDrawing),
        revision: revisionDto(savedRevision)
      };
    },

    async assignEstimateItem(user, drawingId, assignment) {
      const drawing = await EstimateDesignDrawingModel.findById(drawingId).lean();
      if (!drawing) throw estimateNotFound();
      const estimate = await requireOwnedEstimate(user, String(drawing.estimateId));
      const latest = await EstimateDesignRevisionModel.findOne({ drawingId })
        .sort({ revisionNumber: -1 })
        .lean();
      if (!latest) throw estimateNotFound();
      if (Number(latest.revisionNumber) !== assignment.version) staleDrawing();
      if (!estimateAllowsDrawingEdit(String(estimate.status), latest)) drawingLocked();
      if (!drawing.active || !["draft", "changes_requested"].includes(String(latest.reviewStatus))) drawingLocked();
      resolveExactMapping(assignment, estimate);

      let savedDrawing: Record<string, any> | null = null;
      let savedRevision: Record<string, any> | null = null;
      await withMongoTransaction(async (session) => {
        const currentDrawing = await EstimateDesignDrawingModel.findById(drawingId)
          .session(session)
          .lean();
        if (!currentDrawing) throw estimateNotFound();
        const currentEstimate = await requireOwnedEstimate(user, String(currentDrawing.estimateId), session);
        const currentUpload = await EstimateDesignUploadModel.findById(currentDrawing.uploadId).session(session).lean();
        const currentJob = await EstimateDesignExtractionJobModel.findOne({ uploadId: currentDrawing.uploadId })
          .session(session)
          .lean();
        const current = await EstimateDesignRevisionModel.findOne({ drawingId })
          .sort({ revisionNumber: -1 })
          .session(session)
          .lean();
        if (!current || Number(current.revisionNumber) !== assignment.version) {
          staleDrawing();
        }
        if (
          !currentDrawing.active ||
          !currentUpload ||
          !currentJob ||
          String(currentUpload.estimateId) !== String(currentDrawing.estimateId) ||
          String(currentUpload.extractionStatus) !== "estimator_review" ||
          String(currentJob.status) !== "estimator_review" ||
          !estimateAllowsDrawingEdit(String(currentEstimate.status), current) ||
          !["draft", "changes_requested"].includes(String(current.reviewStatus))
        ) {
          drawingLocked();
        }
        await guardDesignLifecycle(currentEstimate, session);
        const mapping = resolveExactMapping(assignment, currentEstimate);
        const revision = {
          _id: randomUUID(),
          drawingId,
          revisionNumber: Number(current.revisionNumber) + 1,
          sourcePageId: current.sourcePageId,
          crop: { ...current.crop },
          croppedFileReference: current.croppedFileReference,
          ...mapping,
          label: String(currentDrawing.displayTitle),
          reviewStatus: "draft",
          submittedAt: null,
          reviewerId: null,
          reviewedAt: null,
          changeSummary: null,
          annotationLayerId: null,
          annotations: null,
          replacementUploadId: null,
          replacesRevisionId: current._id
        };
        const guarded = await EstimateDesignRevisionModel.updateOne(
          {
            _id: current._id,
            drawingId,
            revisionNumber: assignment.version,
            reviewStatus: { $in: ["draft", "changes_requested"] }
          },
          { $set: { reviewStatus: current.reviewStatus }, $currentDate: { updatedAt: true } },
          { session }
        );
        if (guarded.matchedCount !== 1) staleDrawing();
        await EstimateDesignRevisionModel.create([revision], { session });
        const updated = await EstimateDesignDrawingModel.updateOne(
          {
            _id: drawingId,
            active: true,
            roomId: currentDrawing.roomId ?? null,
            scopeSectionId: currentDrawing.scopeSectionId ?? null,
            catalogueId: currentDrawing.catalogueId ?? null,
            mappingStatus: currentDrawing.mappingStatus ?? "misc",
            verified: Boolean(currentDrawing.verified)
          },
          { $set: mapping },
          { session, runValidators: true }
        );
        if (updated.matchedCount !== 1) staleDrawing();
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: user.id,
          action: "estimate_design_item_assigned",
          entityType: "estimate_design_drawing",
          entityId: drawingId,
          occurredAt: now().toISOString(),
          oldValues: { ...mappingSnapshot(currentDrawing), revisionNumber: Number(current.revisionNumber) },
          newValues: { ...mapping, revisionNumber: Number(revision.revisionNumber) }
        });
        savedDrawing = { ...currentDrawing, ...mapping };
        savedRevision = revision;
      });
      if (!savedDrawing || !savedRevision) throw new Error("Estimate item assignment transaction did not complete.");
      return { ...drawingDto(savedDrawing), revision: revisionDto(savedRevision) };
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
      if (hasMappingChange(change)) {
        resolveDeprecatedMapping(change as DeprecatedMappingChange, estimate);
      }
      const verified = change.verified ?? Boolean(drawing.verified);
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
          const mapping = hasMappingChange(change)
            ? resolveDeprecatedMapping(change as DeprecatedMappingChange, currentEstimate)
            : mappingSnapshot(currentDrawing);
          assertEstimateDesignMapping(mapping);
          const currentVerified = change.verified ?? Boolean(currentDrawing.verified);
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
            ...mapping,
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
          const mappingCorrected =
            String(currentDrawing.displayTitle) !== currentDisplayTitle ||
            (currentDrawing.roomId ?? null) !== mapping.roomId ||
            (currentDrawing.scopeSectionId ?? null) !== mapping.scopeSectionId ||
            (currentDrawing.catalogueId ?? null) !== mapping.catalogueId ||
            (currentDrawing.mappingStatus ?? "misc") !== mapping.mappingStatus;
          const cropCorrected = !sameCrop(current.crop, currentCrop);
          const newlyVerified =
            !Boolean(currentDrawing.verified) && currentVerified;
          const updated = await EstimateDesignDrawingModel.updateOne(
            {
              _id: drawingId,
              active: true,
              uploadId: currentDrawing.uploadId,
              sourcePageId: currentDrawing.sourcePageId,
              displayTitle: currentDrawing.displayTitle,
              roomId: currentDrawing.roomId ?? null,
              scopeSectionId: currentDrawing.scopeSectionId ?? null,
              catalogueId: currentDrawing.catalogueId ?? null,
              mappingStatus: currentDrawing.mappingStatus ?? "misc",
              verified: Boolean(currentDrawing.verified)
            },
            {
              $set: {
                displayTitle: currentDisplayTitle,
                ...mapping,
                verified: currentVerified
              }
            },
            { session }
          );
          if (updated.matchedCount !== 1) staleDrawing();
          if (mappingCorrected) {
            await appendEstimateDesignAudit(input.audit, session, {
              actorId: user.id,
              action: "estimate_design_mapping_corrected",
              entityType: "estimate_design_drawing",
              entityId: drawingId,
              occurredAt: now().toISOString(),
              oldValues: {
                displayTitle: String(currentDrawing.displayTitle),
                ...mappingSnapshot(currentDrawing),
                revisionNumber: Number(current.revisionNumber)
              },
              newValues: {
                displayTitle: currentDisplayTitle,
                ...mapping,
                revisionNumber: Number(revision.revisionNumber)
              }
            });
          }
          if (cropCorrected) {
            await appendEstimateDesignAudit(input.audit, session, {
              actorId: user.id,
              action: "estimate_design_crop_corrected",
              entityType: "estimate_design_drawing",
              entityId: drawingId,
              occurredAt: now().toISOString(),
              oldValues: {
                crop: { ...current.crop },
                revisionNumber: Number(current.revisionNumber)
              },
              newValues: {
                crop: currentCrop,
                revisionNumber: Number(revision.revisionNumber)
              }
            });
          }
          if (newlyVerified) {
            await appendEstimateDesignAudit(input.audit, session, {
              actorId: user.id,
              action: "estimate_design_verified",
              entityType: "estimate_design_drawing",
              entityId: drawingId,
              occurredAt: now().toISOString(),
              oldValues: { verified: false },
              newValues: {
                verified: true,
                revisionNumber: Number(revision.revisionNumber),
                ...mapping
              }
            });
          }
          savedDrawing = {
            ...currentDrawing,
            displayTitle: currentDisplayTitle,
            ...mapping,
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

    async retryUpload(user, uploadId) {
      const upload = await EstimateDesignUploadModel.findById(uploadId).lean();
      if (!upload) throw estimateNotFound();
      await requireOwnedEditableEstimate(user, String(upload.estimateId));
      const queuedAt = now();
      let saved: Record<string, any> | null = null;
      await withMongoTransaction(async (session) => {
        const currentUpload = await EstimateDesignUploadModel.findById(uploadId).session(session).lean();
        if (!currentUpload) throw estimateNotFound();
        const estimate = await requireOwnedEstimate(user, String(currentUpload.estimateId), session);
        if (!isEstimateDesignEditable(estimate.status)) drawingLocked();
        const job = await EstimateDesignExtractionJobModel.findOne({ uploadId }).session(session).lean();
        if (!job || currentUpload.extractionStatus !== "processing_failed" || job.status !== "processing_failed") {
          extractionStateConflict();
        }
        await guardDesignLifecycle(estimate, session);
        if (currentUpload.replacesRevisionId) {
          const reserved = await EstimateDesignRevisionModel.updateOne(
            {
              _id: currentUpload.replacesRevisionId,
              drawingId: currentUpload.replacementDrawingId,
              revisionNumber: currentUpload.replacementVersion,
              reviewStatus: "changes_requested",
              replacementUploadId: { $in: [null] }
            },
            { $set: { replacementUploadId: currentUpload._id } },
            { session }
          );
          requireMatchedTransition(reserved, staleReplacement);
        }
        const resetJob = await EstimateDesignExtractionJobModel.updateOne(
          { _id: job._id, uploadId, status: "processing_failed" },
          { $set: { status: "queued", queuedAt, startedAt: null, completedAt: null, leaseExpiresAt: null, claimId: null, failureCode: null, failureMessage: null, workerResultId: null } },
          { session }
        );
        requireTransition(resetJob, extractionStateConflict);
        const resetUpload = await EstimateDesignUploadModel.updateOne(
          { _id: uploadId, estimateId: currentUpload.estimateId, extractionStatus: "processing_failed" },
          { $set: { extractionStatus: "queued", failureCode: null, failureMessage: null } },
          { session }
        );
        requireTransition(resetUpload, extractionStateConflict);
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: user.id,
          action: "estimate_design_upload_retried",
          entityType: "estimate",
          entityId: String(currentUpload.estimateId),
          occurredAt: queuedAt.toISOString(),
          oldValues: {
            extractionStatus: "processing_failed"
          },
          newValues: {
            extractionStatus: "queued",
            uploadId,
            jobId: String(job._id),
            replacement: Boolean(currentUpload.replacesRevisionId)
          }
        });
        saved = { ...currentUpload, extractionStatus: "queued", failureCode: null, failureMessage: null };
      });
      if (!saved) throw new Error("Estimate upload retry did not complete.");
      return uploadDto(saved);
    },

    async removeDrawing(user, drawingId, version) {
      const drawing = await EstimateDesignDrawingModel.findById(drawingId).lean();
      if (!drawing) throw estimateNotFound();
      await requireOwnedEditableEstimate(user, String(drawing.estimateId));
      const latest = await EstimateDesignRevisionModel.findOne({ drawingId }).sort({ revisionNumber: -1 }).lean();
      if (!latest || !drawing.active || drawing.verified || latest.reviewStatus !== "draft" || Number(latest.revisionNumber) !== version) {
        drawingLocked();
      }
      await withMongoTransaction(async (session) => {
        const currentDrawing = await EstimateDesignDrawingModel.findById(drawingId).session(session).lean();
        if (!currentDrawing) throw estimateNotFound();
        const estimate = await requireOwnedEstimate(user, String(currentDrawing.estimateId), session);
        if (!isEstimateDesignEditable(estimate.status)) drawingLocked();
        const currentRevision = await EstimateDesignRevisionModel.findOne({ drawingId }).sort({ revisionNumber: -1 }).session(session).lean();
        if (!currentRevision || !currentDrawing.active || currentDrawing.verified || currentRevision.reviewStatus !== "draft" || Number(currentRevision.revisionNumber) !== version) drawingLocked();
        await guardDesignLifecycle(estimate, session);
        const removed = await EstimateDesignDrawingModel.updateOne(
          { _id: drawingId, estimateId: currentDrawing.estimateId, active: true, verified: false },
          { $set: { active: false } },
          { session }
        );
        requireTransition(removed, staleDrawing);
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: user.id,
          action: "estimate_design_drawing_removed",
          entityType: "estimate_design_drawing",
          entityId: drawingId,
          occurredAt: now().toISOString(),
          oldValues: {
            active: true,
            revisionNumber: Number(currentRevision.revisionNumber)
          },
          newValues: { active: false }
        });
      });
      return { id: drawingId, active: false };
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
          assertEstimateDesignMapping({
            roomId: drawing.roomId ?? null,
            scopeSectionId: drawing.scopeSectionId ?? null,
            catalogueId: drawing.catalogueId ?? null,
            mappingStatus: drawing.mappingStatus ?? "misc"
          });
          if (!drawing.verified) {
            unverifiedDrawings();
          }
          if (!revision || revision.reviewStatus === "changes_requested") {
            unverifiedDrawings();
          }
          if (
            revision.reviewStatus !== "approved" &&
            revision.reviewStatus !== "draft"
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
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: user.id,
          action: "estimate_design_drawings_submitted",
          entityType: "estimate",
          entityId: estimateId,
          occurredAt: submittedAt.toISOString(),
          newValues: {
            submittedCount: revisionIds.length,
            activeDrawingCount: drawings.length,
            uploadCount: uploadStates.length
          }
        });
        submittedCount = revisionIds.length;
      });
      return { submittedCount };
    }
  };

  async function canRetryUpload(upload: Record<string, any>) {
    if (String(upload.extractionStatus) !== "processing_failed") return false;
    const job = await EstimateDesignExtractionJobModel.findOne({
      uploadId: upload._id
    }).lean();
    if (!job || String(job.status) !== "processing_failed") return false;
    if (!upload.replacesRevisionId) return true;
    if (!upload.replacementDrawingId || !upload.replacementVersion) return false;
    const drawing = await EstimateDesignDrawingModel.findById(
      upload.replacementDrawingId
    ).lean();
    if (!drawing || !drawing.active) return false;
    const latest = await EstimateDesignRevisionModel.findOne({
      drawingId: drawing._id
    }).sort({ revisionNumber: -1 }).lean();
    return Boolean(
      latest &&
      String(latest._id) === String(upload.replacesRevisionId) &&
      Number(latest.revisionNumber) === Number(upload.replacementVersion) &&
      String(latest.reviewStatus) === "changes_requested" &&
      latest.replacementUploadId == null
    );
  }

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
        audit: input.audit,
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
        failureMessage: null,
        canRetry: false
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
          ...mappingSnapshot(drawing),
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
        await appendEstimateDesignAudit(input.audit, session, {
          actorId: "system-estimate-ocr-worker",
          action: "estimate_design_replacement_created",
          entityType: "estimate_design_drawing",
          entityId: String(drawing._id),
          occurredAt: new Date(processedAt).toISOString(),
          oldValues: {
            revisionNumber: Number(current.revisionNumber),
            reviewStatus: String(current.reviewStatus)
          },
          newValues: {
            uploadId: String(currentUpload._id),
            workerResultId: resultId,
            revisionId,
            revisionNumber: Number(current.revisionNumber) + 1,
            width: page.width,
            height: page.height
          }
        });
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
  audit: AuditService;
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
      await appendEstimateDesignAudit(input.audit, session, {
        actorId: input.user.id,
        action: input.replacement
          ? "estimate_design_replacement_queued"
          : "estimate_design_uploaded",
        entityType: "estimate",
        entityId: input.estimate._id,
        occurredAt: input.uploadedAt.toISOString(),
        newValues: {
          uploadId: input.uploadId,
          sizeBytes: input.file.sizeBytes,
          mimeType: input.file.mimeType,
          ...(input.replacement
            ? {
                drawingId: input.replacement.drawingId,
                replacesRevisionId: input.replacement.revisionId,
                replacementVersion: input.replacement.version
              }
            : {})
        }
      });
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
  audit: AuditService;
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
      await appendEstimateDesignAudit(input.audit, session, {
        actorId: input.user.id,
        action: "estimate_design_replacement_queued",
        entityType: "estimate",
        entityId: String(estimate._id),
        occurredAt: input.uploadedAt.toISOString(),
        newValues: {
          uploadId: input.uploadId,
          drawingId: String(drawing._id),
          replacesRevisionId: String(latest._id),
          replacementVersion: Number(latest.revisionNumber),
          sizeBytes: input.file.sizeBytes,
          mimeType: input.file.mimeType
        }
      });
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

function uploadDto(
  upload: Record<string, unknown>,
  canRetry = false
): EstimateDesignUploadDto {
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
    failureMessage: upload.failureMessage === null ? null : String(upload.failureMessage),
    canRetry
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

function mappingDto(record: Record<string, unknown>) {
  const candidate: Record<string, unknown> = {
    roomId: record.roomId ?? null,
    scopeSectionId: record.scopeSectionId ?? null,
    catalogueId: record.catalogueId ?? null,
    mappingStatus: record.mappingStatus ?? "misc"
  };
  try {
    assertMappingIdentifiers(candidate);
    assertEstimateDesignMapping(candidate);
    return candidate;
  } catch {
    return {
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc" as const
    };
  }
}

function mappingSnapshot(record: Record<string, unknown>) {
  return {
    roomId: record.roomId ?? null,
    scopeSectionId: record.scopeSectionId ?? null,
    catalogueId: record.catalogueId ?? null,
    mappingStatus: record.mappingStatus ?? "misc"
  };
}

function resolveExactMapping(
  assignment: ExactMappingChange,
  estimate: Record<string, unknown>
) {
  try {
    return resolveEstimateItemAssignment(assignment, mappingContextForEstimate(estimate));
  } catch (error) {
    if (error instanceof InvalidEstimateDesignAssignmentError) {
      throw new ApiError(
        400,
        "INVALID_ESTIMATE_DESIGN_ASSIGNMENT",
        "The selected estimate item is not included for this room."
      );
    }
    throw error;
  }
}

function resolveDeprecatedMapping(
  change: DeprecatedMappingChange,
  estimate: Record<string, unknown>
) {
  if ("catalogueId" in change) return resolveExactMapping(change, estimate);
  const candidates = mappingContextForEstimate(estimate).candidates.filter(
    (candidate) =>
      candidate.roomId === change.roomId &&
      candidate.scopeSectionId === change.scopeSectionId
  );
  if (candidates.length !== 1) {
    throw new ApiError(
      409,
      "EXACT_ESTIMATE_ITEM_REQUIRED",
      "Refresh and select the exact included estimate item before saving this drawing."
    );
  }
  return resolveExactMapping(
    { roomId: candidates[0]!.roomId, catalogueId: candidates[0]!.catalogueId },
    estimate
  );
}

function hasMappingChange(change: EditEstimateDrawingInput): boolean {
  return typeof change.roomId === "string";
}

function assertMappingIdentifiers(mapping: Record<string, unknown>) {
  for (const key of ["roomId", "scopeSectionId", "catalogueId"] as const) {
    const value = mapping[key];
    if (
      value !== null &&
      (
        typeof value !== "string" ||
        value.trim().length === 0 ||
        ["null", "undefined"].includes(value.trim().toLowerCase())
      )
    ) {
      throw new TypeError("Mapping identifiers must be a real identifier or null.");
    }
  }
}

function miscMapping() {
  return {
    roomId: null,
    scopeSectionId: null,
    catalogueId: null,
    mappingStatus: "misc" as const
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
    ...mappingDto(drawing),
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
    verified: Boolean(drawing.verified),
    ...mappingDto(revision),
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
    ...mappingDto(revision),
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

function requireAnnotationDimensions(
  revision: Record<string, any>,
  annotations: AnnotationDocumentV1
) {
  const expectedWidth = Number(revision.crop?.width);
  const expectedHeight = Number(revision.crop?.height);
  if (
    annotations.imageWidth !== expectedWidth ||
    annotations.imageHeight !== expectedHeight
  ) {
    throw new ApiError(
      400,
      "INVALID_ANNOTATION_DIMENSIONS",
      "Annotation dimensions must match the reviewed drawing crop.",
      {
        imageWidth: `Use the reviewed crop width (${expectedWidth}).`,
        imageHeight: `Use the reviewed crop height (${expectedHeight}).`
      }
    );
  }
}

function requireManualDrawingState(upload: Record<string, any>) {
  if (
    !["estimator_review", "processing_failed"].includes(
      String(upload.extractionStatus)
    )
  ) {
    throw new ApiError(
      409,
      "ESTIMATE_DRAWING_LOCKED",
      "Manual drawings can only be added while reviewing retained source pages."
    );
  }
}

function invalidManualCrop(): never {
  throw new ApiError(
    400,
    "INVALID_MANUAL_CROP",
    "Drawing crops must remain within their source page."
  );
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

async function normalizeEstimateResult(
  result: EstimateWorkerResult,
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

function sameCrop(left: CropRect, right: CropRect) {
  return (
    Number(left.x) === Number(right.x) &&
    Number(left.y) === Number(right.y) &&
    Number(left.width) === Number(right.width) &&
    Number(left.height) === Number(right.height)
  );
}

function invalidWorkerResult(message: string): never {
  throw new ApiError(400, "INVALID_WORKER_RESULT", message);
}

function appendEstimateDesignAudit(
  audit: AuditService,
  session: mongoose.ClientSession,
  event: AuditWrite
) {
  return audit.appendInMongoTransaction(event, session);
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
