import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { derivePlanRequestStatus } from "../domain/estimate-plan-review.js";

import { ApiError } from "../middleware/errors.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../models/EstimatePlanPageRevision.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";

type Row = Record<string, any>;
const withdrawalReason = "The Designer deleted an uploaded design before Client approval.";
const deletedFailure = {
  failureCode: "ESTIMATE_DESIGN_UPLOAD_DELETED",
  failureMessage: "The source design was deleted by its Designer."
};

export function uploadDeleteAvailability(
  user: PublicUser,
  estimate: Row,
  upload: Row,
  pages: readonly Row[],
  drawings: readonly Row[],
  revisions: readonly Row[]
): { canDelete: boolean; deleteBlockedReason?: string } {
  let reason: string | undefined;
  if (user.role !== "designer" || String(estimate.designPlanDesignerId) !== user.id || String(upload.uploaderId) !== user.id) {
    reason = "Only the assigned Designer who uploaded this file can delete it.";
  } else if (upload.deletedAt || String(estimate.status) !== "client_approved") {
    reason = "This design is read-only.";
  } else {
    const sourceIds = new Set(pages.filter((page) => String(page.uploadId) === String(upload._id)).map((page) => String(page._id)));
    const drawingIds = new Set(drawings.filter((drawing) => String(drawing.uploadId) === String(upload._id)).map((drawing) => String(drawing._id)));
    // An approved replacement also protects the original drawing source.
    const approved = revisions.some((revision) => revision.reviewStatus === "approved" && (
      sourceIds.has(String(revision.sourcePageId)) || drawingIds.has(String(revision.drawingId))
    ));
    if (estimate.designFrozenAt || estimate.designPlanStatus === "approved" || approved) {
      reason = "Approved designs cannot be deleted.";
    } else if (!["assigned", "in_progress", "ready_for_client", "changes_requested"].includes(String(estimate.designPlanStatus))) {
      reason = "This design is read-only.";
    }
  }
  return reason ? { canDelete: false, deleteBlockedReason: reason } : { canDelete: true };
}

export async function deleteEstimateDesignUpload(input: {
  user: PublicUser;
  uploadId: string;
  audit: AuditService;
  occurredAt: Date;
  transaction: (work: (session: ClientSession) => Promise<void>) => Promise<void>;
  guardLifecycle: (estimate: Row, session: ClientSession) => Promise<void>;
}): Promise<{ id: string; deleted: true }> {
  if (input.user.role !== "designer") throw new ApiError(403, "FORBIDDEN", "Only Designers can delete uploaded designs.");
  await input.transaction(async (session) => {
    const actor = await UserModel.findOne({ _id: input.user.id, role: "designer", active: true }).session(session).lean();
    if (!actor) throw new ApiError(403, "FORBIDDEN", "An active Designer is required.");
    const upload = await EstimateDesignUploadModel.findOne({ _id: input.uploadId, uploaderId: input.user.id }).session(session).lean();
    const estimate = upload ? await EstimateModel.findOne({ _id: upload.estimateId, designPlanDesignerId: input.user.id }).session(session).lean() : null;
    if (!upload || !estimate) throw new ApiError(404, "ESTIMATE_DESIGN_UPLOAD_NOT_FOUND", "Uploaded design not found.");
    if (upload.deletedAt && String(upload.deletedById) === input.user.id) return;
    const pages = await EstimateDesignSourcePageModel.find({ uploadId: upload._id }).session(session).lean();
    const drawings = await EstimateDesignDrawingModel.find({ estimateId: estimate._id }).session(session).lean();
    const revisions = await EstimateDesignRevisionModel.find({ drawingId: { $in: drawings.map((drawing) => drawing._id) } }).session(session).lean();
    const availability = uploadDeleteAvailability(input.user, estimate, upload, pages, drawings, revisions);
    if (!availability.canDelete) throw new ApiError(409, "ESTIMATE_DESIGN_UPLOAD_LOCKED", availability.deleteBlockedReason!);
    // Every drawing approval and final on-behalf approval writes this same Estimate.
    // Transaction retries therefore re-read approval and source lineage before deletion.
    await input.guardLifecycle(estimate, session);
    const pageIds = new Set(pages.map((page) => String(page._id)));
    const latest = new Map<string, Row>();
    for (const revision of revisions) {
      const id = String(revision.drawingId);
      if (!latest.has(id) || Number(latest.get(id)!.revisionNumber) < Number(revision.revisionNumber)) latest.set(id, revision);
    }
    const affectedIds = drawings.filter((drawing) => String(drawing.uploadId) === input.uploadId || pageIds.has(String(latest.get(String(drawing._id))?.sourcePageId))).map((drawing) => String(drawing._id));
    const removed = await EstimateDesignUploadModel.updateOne(
      { _id: upload._id, deletedAt: null },
      { $set: { deletedAt: input.occurredAt, deletedById: input.user.id } },
      { session }
    );
    if (removed.modifiedCount !== 1) throw new ApiError(409, "ESTIMATE_DESIGN_UPLOAD_CONFLICT", "The uploaded design changed. Refresh and try again.");
    await EstimateDesignDrawingModel.updateMany(
      { _id: { $in: affectedIds }, active: true },
      { $set: { active: false, deletedAt: input.occurredAt, deletedById: input.user.id } },
      { session }
    );
    const dependentUploads = await EstimateDesignUploadModel.find({ replacementDrawingId: { $in: affectedIds }, deletedAt: null }).session(session).lean();
    const cancelledUploadIds = [input.uploadId, ...dependentUploads.map((row) => String(row._id))];
    await EstimateDesignExtractionJobModel.updateMany(
      { uploadId: { $in: cancelledUploadIds }, status: { $in: ["queued", "processing"] } },
      { $set: { status: "processing_failed", nextAttemptAt: null, completedAt: input.occurredAt, claimId: null, leaseExpiresAt: null, workerResultId: null, ...deletedFailure }, $inc: { claimGeneration: 1 } },
      { session }
    );
    await EstimateDesignUploadModel.updateMany(
      { _id: { $in: cancelledUploadIds }, extractionStatus: { $in: ["queued", "processing"] } },
      { $set: { extractionStatus: "processing_failed", ...deletedFailure } },
      { session }
    );
    await EstimateDesignRevisionModel.updateMany(
      { replacementUploadId: { $in: cancelledUploadIds }, reviewStatus: { $ne: "approved" } },
      { $set: { replacementUploadId: null } }, { session }
    );
    const affectedRequests = await EstimatePlanChangeRequestModel.find({ estimateId: estimate._id, status: "open", $or: [{ uploadId: upload._id }, { "targets.drawingId": { $in: affectedIds } }] }).session(session);
    for (const request of affectedRequests) {
      if (String(request.uploadId) === input.uploadId) {
        request.status = "withdrawn";
      } else {
        // A replacement may be only one target on an original page. Keep all
        // surviving feedback open and preserve the removed target's history.
        for (const target of request.targets) {
          if (affectedIds.includes(String(target.drawingId)) && ["open", "replacement_submitted"].includes(String(target.status))) target.status = "withdrawn";
        }
        request.status = derivePlanRequestStatus(request.targets.map((target: Row) => target.status), Boolean(request.unassigned), Boolean(request.unassignedResolved));
      }
      request.withdrawnAt = input.occurredAt;
      request.withdrawnById = input.user.id;
      request.withdrawalReason = withdrawalReason;
      request.version += 1;
      await request.save({ session });
    }
    const withdrawnRounds = await DesignPlanReviewRoundModel.find({ estimateId: estimate._id, status: "pending" }).session(session).lean();
    const reopenedRevisionIds = new Map<string, string>();
    if (withdrawnRounds.length > 0 || estimate.designPlanStatus === "ready_for_client") {
      await DesignPlanReviewRoundModel.updateMany(
        { estimateId: estimate._id, status: "pending" },
        { $set: { status: "withdrawn", withdrawnAt: input.occurredAt, withdrawnById: input.user.id, withdrawalReason }, $inc: { version: 1 } },
        { session, runValidators: true }
      );
      // Retain submitted snapshots; create new editable drafts for remaining drawings.
      for (const drawing of drawings) {
        const revision = latest.get(String(drawing._id));
        if (!drawing.active || affectedIds.includes(String(drawing._id)) || !revision || revision.reviewStatus !== "submitted") continue;
        const draftId = randomUUID();
        reopenedRevisionIds.set(String(revision._id), draftId);
        await EstimateDesignRevisionModel.create([{
          ...revision, _id: draftId, revisionNumber: Number(revision.revisionNumber) + 1,
          reviewStatus: "draft", submittedAt: null, reviewerId: null, reviewedAt: null,
          changeSummary: null, annotationLayerId: null, annotations: null, replacementUploadId: null,
          createdAt: input.occurredAt, updatedAt: input.occurredAt
        }], { session });
        await EstimatePlanChangeRequestModel.updateMany(
          { estimateId: estimate._id, status: "open", targets: { $elemMatch: { resolvedByRevisionId: revision._id, status: "replacement_submitted" } } },
          { $set: { "targets.$[target].resolvedByRevisionId": draftId }, $inc: { version: 1 } },
          { session, arrayFilters: [{ "target.resolvedByRevisionId": revision._id, "target.status": "replacement_submitted" }] }
        );
      }
      await EstimateDesignUploadModel.updateMany(
        { estimateId: estimate._id, deletedAt: null, extractionStatus: "submitted" },
        { $set: { extractionStatus: "estimator_review" } }, { session }
      );
      await EstimateDesignExtractionJobModel.updateMany(
        { status: "submitted", uploadId: { $in: drawings.filter((drawing) => !affectedIds.includes(String(drawing._id))).map((drawing) => drawing.uploadId) } },
        { $set: { status: "estimator_review" } }, { session }
      );
    }
    // Composite page snapshots must stop referring to removed drawings and use
    // the reopened draft identities. Preserve the prior page revision verbatim.
    const pageHistory = await EstimatePlanPageRevisionModel.find({ estimateId: estimate._id }).sort({ revisionNumber: -1 }).session(session).lean();
    const seenPages = new Set<string>();
    for (const pageRevision of pageHistory) {
      const sourcePageId = String(pageRevision.sourcePageId);
      if (seenPages.has(sourcePageId) || pageIds.has(sourcePageId)) continue;
      seenPages.add(sourcePageId);
      const patches = pageRevision.patches
        .filter((patch: Row) => !affectedIds.includes(String(patch.drawingId)))
        .map((patch: Row, order: number) => ({ ...patch, drawingRevisionId: reopenedRevisionIds.get(String(patch.drawingRevisionId)) ?? String(patch.drawingRevisionId), order }));
      if (JSON.stringify(patches) === JSON.stringify(pageRevision.patches)) continue;
      await EstimatePlanPageRevisionModel.create([{
        _id: randomUUID(), estimateId: String(estimate._id), sourcePageId,
        revisionNumber: Number(pageRevision.revisionNumber) + 1,
        basePageReference: pageRevision.basePageReference, status: "revised", patches,
        previousRevisionId: String(pageRevision._id), createdBy: input.user.id
      }], { session });
    }
    await EstimateModel.updateOne({ _id: estimate._id }, { $set: { designPlanStatus: "in_progress", designPlanSubmittedAt: null } }, { session });
    await ProjectWorkflowTaskModel.updateOne(
      { dedupeKey: `${String(estimate._id)}:design-plan-upload`, assigneeUserId: input.user.id },
      { $set: { status: "open", progress: 0, completedAt: null }, $inc: { version: 1 } }, { session }
    );
    await input.audit.appendInMongoTransaction({
      actorId: input.user.id, action: "estimate_design_upload_deleted", entityType: "estimate", entityId: String(estimate._id), occurredAt: input.occurredAt.toISOString(),
      oldValues: { uploadId: input.uploadId, designPlanStatus: estimate.designPlanStatus, extractionStatus: upload.extractionStatus },
      newValues: { uploadId: input.uploadId, deleted: true, drawingIds: affectedIds, withdrawnReviewRoundIds: withdrawnRounds.map((round) => String(round._id)), designPlanStatus: "in_progress" }
    }, session);
  });
  return { id: input.uploadId, deleted: true };
}
