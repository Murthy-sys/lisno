import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { isCollaborativeEstimate, newEstimationLifecycle, type EstimationPreparationSource } from "../domain/estimation-lifecycle.js";
import { sha256Hex, type EstimateClientReviewSnapshot } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimatePreparationSnapshotModel } from "../models/EstimatePreparationSnapshot.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { FinanceLedgerEntryModel } from "../models/FinanceLedgerEntry.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { ProcurementBasketEnquiryModel } from "../models/ProcurementBasketTender.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import { assertEstimateEditable, canStaffEditEstimate, fenceCollaborativeEstimate, requireEstimateStaffActor } from "./estimate-collaboration-policy.service.js";
import { assertCurrentConfiguredPublication, assertPublishableConfiguredLines, toEstimateSnapshot } from "./estimate-publication.service.js";
import { ensureCollaborativePreparationTask } from "./project-workflow.service.js";

type Row = Record<string, any>;

export function createEstimateCollaborationService(audit: AuditService) {
  const load = async (actor: PublicUser, estimateId: string, expectedVersion: number, session: mongoose.ClientSession) => {
    const estimate = await EstimateModel.findById(estimateId).session(session).lean() as Row | null;
    if (!estimate || !canStaffEditEstimate(actor, estimate)) throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
    await requireEstimateStaffActor(actor.id, estimate, session, actor.role);
    if (!isCollaborativeEstimate(estimate) || estimate.version !== expectedVersion || estimate.estimation.editClosedAt)
      throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The estimate changed or its edit window is closed. Refresh before continuing.");
    await fenceCollaborativeEstimate(estimate, session);
    return estimate;
  };
  return {
    async enable(actor: PublicUser, estimateId: string, expectedVersion: number) {
      return transaction(async (session) => {
        const estimate = await EstimateModel.findById(estimateId).session(session).lean() as Row | null;
        if (!estimate || !canStaffEditEstimate(actor, estimate)) throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
        await requireEstimateStaffActor(actor.id, estimate, session, actor.role);
        if (estimate.version !== expectedVersion) throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "Refresh the estimate before continuing.");
        if (isCollaborativeEstimate(estimate)) return { ...estimate, id: estimateId, status: estimate.estimation.status };
        const conflict = () => new ApiError(409, "ESTIMATE_TRANSITION_CONFLICT",
          "This historical estimate needs source reconciliation before collaborative estimation can be enabled.");
        if (!estimate.projectId || estimate.designFrozenAt || estimate.designPlanStatus === "approved" ||
          !["draft", "designer_changes_requested", "client_changes_requested", "client_approved"].includes(estimate.status)) throw conflict();
        const project = await ProjectModel.findOne({ _id: estimate.projectId, status: "planning", actualEndAt: null }).session(session).lean();
        const lead = await LeadModel.findOne({ _id: estimate.leadId, projectId: estimate.projectId, ownerId: estimate.ownerId }).session(session).lean();
        if (!project || !lead || project.assignedEstimatorId !== estimate.ownerId) throw conflict();
        const commitments = await Promise.all([
          ProjectPurchaseOrderModel.exists({ projectId: estimate.projectId }).session(session),
          ProjectPurchaseOrderRequestModel.exists({ projectId: estimate.projectId }).session(session),
          ProjectProcurementItemModel.exists({ projectId: estimate.projectId }).session(session),
          FinanceLedgerEntryModel.exists({ projectId: estimate.projectId }).session(session),
          VendorWorkAssignmentModel.exists({ projectId: estimate.projectId }).session(session),
          ProcurementBasketEnquiryModel.exists({ projectId: estimate.projectId }).session(session)
        ]);
        if (commitments.some(Boolean)) throw conflict();
        const rounds = await EstimateClientReviewRoundModel.find({ estimateId, status: { $in: ["approved", "pending"] } }).session(session).lean();
        const estimation = newEstimationLifecycle(Number(project.estimateRequirementsVersion ?? 0));
        if (estimate.status === "client_approved") {
          if (rounds.length !== 1) throw conflict();
          const round = rounds[0];
          if (round.status !== "approved" || round.decision !== "approve" || !round.decidedAt ||
            round.projectId !== estimate.projectId || round.leadId !== estimate.leadId || round.estimateVersion + 1 !== estimate.version ||
            !round.estimateSnapshot?.lineItems?.length) throw conflict();
          const snapshot = round.estimateSnapshot;
          if (["subtotal", "gst", "total"].some((key) => snapshot[key] !== estimate[key]) ||
            snapshot.lineItems.length !== estimate.lineItems.length || snapshot.lineItems.some((line: Row, index: number) => {
              const working = estimate.lineItems[index];
              return !line.id || line.id !== working.id || ["catalogueId", "roomName", "quantity", "included", "amount"].some((key) => line[key] !== working[key]);
            })) throw conflict();
          estimation.phase = "post";
          estimation.preApproval = { reviewRoundId: String(round._id), estimateVersion: Number(round.estimateVersion), approvedAt: new Date(round.decidedAt).toISOString() };
        } else if (rounds.length) throw conflict();
        const updatedProject = await ProjectModel.updateOne({ _id: project._id, status: "planning", actualEndAt: null,
          estimationWorkflowVersion: { $ne: 2 } }, { $set: { estimationWorkflowVersion: 2 }, $inc: { estimationFenceEpoch: 1 } }, { session });
        if (updatedProject.matchedCount !== 1) throw conflict();
        const updated = await EstimateModel.findOneAndUpdate({ _id: estimateId, version: expectedVersion, "estimation.workflowVersion": { $ne: 2 } },
          { $set: { estimation, status: estimation.preApproval ? "client_approved" : "draft" }, $inc: { version: 1 } },
          { session, returnDocument: "after", runValidators: true }).lean();
        if (!updated) throw conflict();
        if (estimation.preApproval) await ensureCollaborativePreparationTask(updated, new Date(estimation.preApproval.approvedAt), session);
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "estimate_collaboration_enabled", entityType: "estimate",
          entityId: estimateId, occurredAt: new Date().toISOString(), oldValues: { estimateVersion: expectedVersion },
          newValues: { workflowVersion: 2, phase: estimation.phase, preApprovalRoundId: estimation.preApproval?.reviewRoundId ?? null }
        }, session);
        return { ...updated, id: estimateId, status: estimation.status };
      });
    },
    async withdraw(actor: PublicUser, estimateId: string, input: { expectedVersion: number; reviewRoundId: string; reviewRoundVersion: number; reason: string }) {
      return transaction(async (session) => {
        const estimate = await load(actor, estimateId, input.expectedVersion, session);
        if (estimate.estimation.status !== "sent_to_client" || estimate.estimation.pendingReviewRoundId !== input.reviewRoundId)
          throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This estimate is no longer awaiting review.");
        const occurredAt = new Date();
        const changed = await EstimateClientReviewRoundModel.updateOne({
          _id: input.reviewRoundId, estimateId, estimateVersion: input.expectedVersion,
          version: input.reviewRoundVersion, status: "pending"
        }, { $set: { status: "superseded", decision: null, decisionSource: null, decisionNote: input.reason,
          decidedById: actor.id, decidedAt: occurredAt }, $inc: { version: 1 } }, { session, runValidators: true });
        if (changed.matchedCount !== 1) throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This review changed. Refresh before withdrawing it.");
        const updated = await EstimateModel.findOneAndUpdate({ _id: estimateId, version: input.expectedVersion }, {
          $set: { "estimation.status": "draft", "estimation.pendingReviewRoundId": null,
            status: estimate.estimation.preApproval ? "client_approved" : "draft" }, $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true }).lean();
        if (!updated) throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The estimate changed.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "estimate_review_withdrawn", entityType: "estimate",
          entityId: estimateId, occurredAt: occurredAt.toISOString(), oldValues: { reviewRoundId: input.reviewRoundId },
          newValues: { status: "superseded", reason: input.reason } }, session);
        return { ...updated, id: String(updated._id), status: "draft" };
      });
    },
    async releasePreparation(actor: PublicUser, estimateId: string, expectedVersion: number) {
      return transaction(async (session) => {
        const estimate = await load(actor, estimateId, expectedVersion, session);
        assertEstimateEditable(estimate);
        if (estimate.estimation.phase !== "post" || !estimate.estimation.preApproval)
          throw new ApiError(409, "ESTIMATE_PRE_APPROVAL_REQUIRED", "Approve the pre-estimate before releasing procurement preparation.");
        assertPublishableConfiguredLines(estimate as Parameters<typeof assertPublishableConfiguredLines>[0]);
        if (!estimate.lineItems.some((line: Row) => line.included)) throw new ApiError(409, "ESTIMATE_EMPTY", "Select at least one estimate item.");
        await assertCurrentConfiguredPublication(estimate as Parameters<typeof assertCurrentConfiguredPublication>[0], session);
        const existing = await EstimatePreparationSnapshotModel.findOne({ estimateId, estimateVersion: expectedVersion }).session(session).lean();
        if (existing) return preparationSource(existing as Row);
        const lead = await LeadModel.findById(estimate.leadId).session(session).lean();
        if (!lead) throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
        const snapshot = toEstimateSnapshot(estimate as Parameters<typeof toEstimateSnapshot>[0], lead as unknown as Parameters<typeof toEstimateSnapshot>[1]);
        const occurredAt = new Date();
        const value = { _id: `estimate-preparation-${randomUUID()}`, estimateId, projectId: estimate.projectId,
          estimateVersion: expectedVersion, phase: "post", requirementsVersion: estimate.estimation.requirementsVersion,
          designScopeRevision: estimate.estimation.designScopeRevision, snapshot, sourceDigest: sha256Hex(JSON.stringify(snapshot)),
          releasedById: actor.id, releasedAt: occurredAt };
        await EstimatePreparationSnapshotModel.create([value], { session });
        const updated = await EstimateModel.updateOne({ _id: estimateId, version: expectedVersion },
          { $set: { "estimation.preparationSnapshotId": value._id } }, { session });
        if (updated.matchedCount !== 1) throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The estimate changed.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "estimate_preparation_released", entityType: "estimate",
          entityId: estimateId, occurredAt: occurredAt.toISOString(), oldValues: {},
          newValues: { snapshotId: value._id, estimateVersion: expectedVersion, sourceDigest: value.sourceDigest } }, session);
        return preparationSource(value);
      });
    }
  };
}

function preparationSource(row: Row): EstimationPreparationSource {
  return { estimateId: String(row.estimateId), estimateVersion: Number(row.estimateVersion), estimateReviewRoundId: null,
    workflowVersion: 2, phase: "post", kind: "released_post", sourceSnapshotId: String(row._id), sourceDigest: String(row.sourceDigest) };
}

/** Frozen preparation data never follows unsaved or subsequently edited working lines. */
export async function resolveEstimationPreparationSource(estimate: Row, session?: mongoose.ClientSession): Promise<{
  source: EstimationPreparationSource; snapshot: EstimateClientReviewSnapshot;
}> {
  const lifecycle = estimate.estimation;
  if (!isCollaborativeEstimate(estimate) || !lifecycle.preApproval) throw new ApiError(409, "ESTIMATE_PRE_APPROVAL_REQUIRED", "An approved pre-estimate is required.");
  if (!lifecycle.finalApproval && lifecycle.preparationSnapshotId) {
    const query = EstimatePreparationSnapshotModel.findOne({ _id: lifecycle.preparationSnapshotId, estimateId: estimate._id ?? estimate.id, projectId: estimate.projectId });
    if (session) query.session(session);
    const row = await query.lean() as Row | null;
    if (!row || row.sourceDigest !== sha256Hex(JSON.stringify(row.snapshot))) throw new ApiError(409, "ESTIMATE_SOURCE_CONFLICT", "The released preparation source is unavailable.");
    return { source: preparationSource(row), snapshot: row.snapshot };
  }
  const reference = lifecycle.finalApproval ?? lifecycle.preApproval;
  const query = EstimateClientReviewRoundModel.findOne({ _id: reference.reviewRoundId,
    estimateId: estimate._id ?? estimate.id, projectId: estimate.projectId, estimateVersion: reference.estimateVersion,
    status: "approved", decision: "approve", phase: lifecycle.finalApproval ? "post" : { $in: ["pre", null] } });
  if (session) query.session(session);
  const round = await query.lean() as Row | null;
  if (!round) throw new ApiError(409, "ESTIMATE_SOURCE_CONFLICT", "The approved estimate source is unavailable.");
  return { source: { estimateId: String(round.estimateId), estimateVersion: Number(round.estimateVersion),
    estimateReviewRoundId: String(round._id), workflowVersion: 2, phase: lifecycle.finalApproval ? "post" : "pre",
    kind: lifecycle.finalApproval ? "approved_final" : "approved_pre", sourceSnapshotId: String(round._id),
    sourceDigest: sha256Hex(JSON.stringify(round.estimateSnapshot)) }, snapshot: round.estimateSnapshot };
}

async function transaction<T>(operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { await createMongoRepository(session).coordinateAuthorizationMutation(); result = await operation(session); });
    return result;
  } finally { await session.endSession(); }
}
