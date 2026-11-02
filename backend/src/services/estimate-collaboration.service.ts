import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { createProjectDesignWorkflow } from "../domain/design-workflow.js";
import { isCollaborativeEstimate, newEstimationLifecycle, newQuotationLifecycle, type EstimationPreparationSource } from "../domain/estimation-lifecycle.js";
import { sha256Hex, type EstimateClientReviewSnapshot } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { quotationSnapshotDigest } from "./quotation-digest.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import { QuotationUnlockReceiptModel } from "../models/QuotationUnlockReceipt.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimatePreparationSnapshotModel } from "../models/EstimatePreparationSnapshot.js";
import { UserModel } from "../models/User.js";
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
    async preview(actor: PublicUser, estimateId: string) {
      return (await quotationTransitionPreview(actor, estimateId)).preview;
    },
    async enableQuotation(actor: PublicUser, estimateId: string, input: { expectedVersion: number; targetVersion: 3; reason: string; previewFingerprint: string }) {
      if (input.targetVersion !== 3 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 ||
        !input.reason?.trim() || input.reason.length > 1000 || !/^[a-f0-9]{64}$/.test(input.previewFingerprint))
        throw new ApiError(400, "VALIDATION_ERROR", "Review the transition preview and provide a reason.");
      return transaction(async (session) => {
        const { preview, estimate, project } = await quotationTransitionPreview(actor, estimateId, session);
        if (estimate.estimation?.workflowVersion === 3 && project?.estimationWorkflowVersion === 3) {
          const receipt = await AuditEventModel.exists({ action: "estimate_collaboration_enabled", entityType: "estimate", entityId: estimateId,
            actorId: actor.id, "newValues.workflowVersion": 3, "newValues.previewFingerprint": input.previewFingerprint,
            "oldValues.estimateVersion": input.expectedVersion, "newValues.reason": input.reason.trim() }).session(session);
          if (receipt) return { ...estimate, id: estimateId, status: estimate.estimation.status };
        }
        if (!preview.eligible || preview.estimateVersion !== input.expectedVersion || preview.previewFingerprint !== input.previewFingerprint)
          throw new ApiError(409, "ESTIMATE_TRANSITION_CONFLICT", "The transition preview changed or has unresolved blockers. Refresh the preview.");
        const changedProject = await ProjectModel.updateOne({ _id: project!._id, status: "planning", actualEndAt: null,
          assignedEstimatorId: project!.assignedEstimatorId, estimationWorkflowVersion: project!.estimationWorkflowVersion ?? null,
          estimationFenceEpoch: project!.estimationFenceEpoch ?? { $in: [0, null] } },
          { $set: { estimationWorkflowVersion: 3,
            ...(!project!.designWorkflowStages?.length ? { designWorkflowStages: createProjectDesignWorkflow(String(project!._id)) } : {})
          }, $inc: { estimationFenceEpoch: 1 } }, { session, runValidators: true });
        if (changedProject.matchedCount !== 1) throw new ApiError(409, "ESTIMATE_TRANSITION_CONFLICT", "The project changed. Refresh the preview.");
        const estimation = newQuotationLifecycle(Number(project!.estimateRequirementsVersion ?? 0));
        const saved = await EstimateModel.findOneAndUpdate({ _id: estimateId, version: input.expectedVersion, "estimation.workflowVersion": { $ne: 3 } },
          { $set: { estimation, status: "draft" }, $inc: { version: 1 } }, { session, returnDocument: "after", runValidators: true }).lean();
        if (!saved) throw new ApiError(409, "ESTIMATE_TRANSITION_CONFLICT", "The estimate changed. Refresh the preview.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "estimate_collaboration_enabled", entityType: "estimate", entityId: estimateId,
          occurredAt: new Date().toISOString(), oldValues: { workflowVersion: preview.currentWorkflowVersion, estimateVersion: input.expectedVersion },
          newValues: { workflowVersion: 3, reason: input.reason.trim(), previewFingerprint: input.previewFingerprint, estimateVersion: saved.version } }, session);
        return { ...saved, id: estimateId, status: "draft" };
      });
    },
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
    async unlock(actor: PublicUser, estimateId: string, input: { expectedVersion: number; reviewRoundId: string; reason: string; idempotencyKey: string }) {
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !input.reviewRoundId?.trim() ||
        !input.reason?.trim() || input.reason.length > 1000 || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey))
        throw new ApiError(400, "VALIDATION_ERROR", "Provide the current quotation, a reason and request identity.");
      return transaction(async (session) => {
        const estimate = await EstimateModel.findById(estimateId).session(session).lean() as Row | null;
        if (!estimate || estimate.estimation?.workflowVersion !== 3 || !["estimator_sales", "designer"].includes(actor.role))
          throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
        await requireEstimateStaffActor(actor.id, estimate, session, actor.role);
        await fenceCollaborativeEstimate(estimate, session);
        const receipt = await QuotationUnlockReceiptModel.findOne({ estimateId, idempotencyKey: input.idempotencyKey }).session(session).lean();
        if (receipt) {
          if (receipt.actorId !== actor.id || receipt.expectedVersion !== input.expectedVersion || receipt.reviewRoundId !== input.reviewRoundId || receipt.reason !== input.reason.trim())
            throw new ApiError(409, "QUOTATION_UNLOCK_CONFLICT", "This request identity was already used for a different unlock.");
          return { ...estimate, id: estimateId, status: estimate.estimation.status };
        }
        if (estimate.version !== input.expectedVersion || !estimate.estimation.editClosedAt || estimate.estimation.finalApproval?.reviewRoundId !== input.reviewRoundId)
          throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "Refresh the current approved quotation before unlocking.");
        const now = new Date();
        const saved = await EstimateModel.findOneAndUpdate({ _id: estimateId, version: input.expectedVersion,
          "estimation.finalApproval.reviewRoundId": input.reviewRoundId, "estimation.editClosedAt": estimate.estimation.editClosedAt },
          { $set: { "estimation.editClosedAt": null, "estimation.status": "draft", "estimation.phase": "post", "estimation.pendingReviewRoundId": null,
            "estimation.salesApproval": null }, $inc: { version: 1, "estimation.pricedRevision": 1 },
            $push: { reviews: { actorId: actor.id, action: "quotation_unlocked", note: input.reason.trim(), occurredAt: now } } },
          { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
        if (!saved) throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The quotation changed before it was unlocked.");
        await QuotationUnlockReceiptModel.create([{ _id: `quotation-unlock-${randomUUID()}`, estimateId, projectId: estimate.projectId,
          actorId: actor.id, ...input, reason: input.reason.trim(), resultVersion: saved.version, occurredAt: now }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "quotation_unlocked", entityType: "estimate", entityId: estimateId,
          occurredAt: now.toISOString(), oldValues: { estimateVersion: estimate.version, approvedReviewRoundId: input.reviewRoundId },
          newValues: { estimateVersion: saved.version, reason: input.reason.trim(), idempotencyKey: input.idempotencyKey } }, session);
        return { ...saved, id: estimateId, status: saved.estimation.status };
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
        if (existing) return preparationSource(existing as Row, estimate.estimation.workflowVersion);
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
        return preparationSource(value, estimate.estimation.workflowVersion);
      });
    }
  };
}

function preparationSource(row: Row, workflowVersion: 2 | 3 = 2): EstimationPreparationSource {
  return { estimateId: String(row.estimateId), estimateVersion: Number(row.estimateVersion), estimateReviewRoundId: null,
    workflowVersion, phase: "post", kind: "released_post", sourceSnapshotId: String(row._id), sourceDigest: String(row.sourceDigest) };
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
    return { source: preparationSource(row, lifecycle.workflowVersion), snapshot: row.snapshot };
  }
  const reference = lifecycle.finalApproval ?? lifecycle.preApproval;
  const query = EstimateClientReviewRoundModel.findOne({ _id: reference.reviewRoundId,
    estimateId: estimate._id ?? estimate.id, projectId: estimate.projectId, estimateVersion: reference.estimateVersion,
    status: "approved", decision: "approve", phase: lifecycle.finalApproval ? "post" : { $in: ["pre", null] } });
  if (session) query.session(session);
  const round = await query.lean() as Row | null;
  if (!round) throw new ApiError(409, "ESTIMATE_SOURCE_CONFLICT", "The approved estimate source is unavailable.");
  return { source: { estimateId: String(round.estimateId), estimateVersion: Number(round.estimateVersion),
    estimateReviewRoundId: String(round._id), workflowVersion: lifecycle.workflowVersion, phase: lifecycle.finalApproval ? "post" : "pre",
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

function compatibleQuotationStages(projectId: string, stages: unknown): boolean {
  if (stages == null || Array.isArray(stages) && stages.length === 0) return true;
  const expected = createProjectDesignWorkflow(projectId);
  if (!Array.isArray(stages) || stages.length !== expected.length) return false;
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const stage of stages) {
    if (!stage || typeof stage.id !== "string" || !stage.id.trim() || stage.id !== stage.id.trim() || ids.has(stage.id) ||
      !Number.isSafeInteger(stage.order) || orders.has(stage.order) || expected[stage.order]?.type !== stage.type ||
      typeof stage.name !== "string" || !stage.name.trim()) return false;
    ids.add(stage.id); orders.add(stage.order);
  }
  return true;
}

/** Preview is read-only. The enable command recomputes it under the authorization transaction. */
async function quotationTransitionPreview(actor: PublicUser, estimateId: string, session?: mongoose.ClientSession) {
  const read = <T extends { session(value: mongoose.ClientSession): T }>(query: T): T => session ? query.session(session) : query;
  const estimate = await read(EstimateModel.findById(estimateId)).lean() as Row | null;
  if (!estimate || !canStaffEditEstimate(actor, estimate)) throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
  await requireEstimateStaffActor(actor.id, estimate, session, actor.role);
  const project = estimate.projectId ? await read(ProjectModel.findById(estimate.projectId)).lean() as Row | null : null;
  const lead = await read(LeadModel.findById(estimate.leadId)).lean() as Row | null;
  const blockers: string[] = [];
  const assignedSales = project?.assignedEstimatorId ? await read(UserModel.exists({ _id: project.assignedEstimatorId, role: "estimator_sales", active: true, deletedAt: null })) : null;
  const linkedClient = !project?.clientId || await read(UserModel.exists({ _id: project.clientId, role: "client", active: true, deletedAt: null }));
  if (!assignedSales || !linkedClient) blockers.push("Reconcile the active Sales and Client identities before enabling the workflow.");
  if (project && await read(EstimateModel.countDocuments({ projectId: project._id })) !== 1) blockers.push("The project has an ambiguous estimate source.");
  if (!project || !lead || lead.projectId !== estimate.projectId || lead.ownerId !== estimate.ownerId || project.assignedEstimatorId !== estimate.ownerId)
    blockers.push("Reconcile the project, Lead and assigned Sales estimator.");
  if (project && (project.status !== "planning" || project.actualEndAt)) blockers.push("Only open planning projects can enable this workflow.");
  if (project && !compatibleQuotationStages(String(project._id), project.designWorkflowStages))
    blockers.push("Reconcile the configured design stages, unique stage IDs and stage order before enabling this workflow.");
  if ((estimate.estimation?.workflowVersion ?? null) !== (project?.estimationWorkflowVersion ?? null))
    blockers.push("The project and estimate workflow versions must be reconciled first.");
  if (estimate.estimation?.workflowVersion === 3 || project?.estimationWorkflowVersion === 3) blockers.push("This quotation workflow is already enabled or needs lifecycle reconciliation.");
  if (estimate.estimation?.workflowVersion !== undefined && estimate.estimation.workflowVersion !== 2 ||
    project?.estimationWorkflowVersion !== undefined && project?.estimationWorkflowVersion !== 2)
    blockers.push("The existing workflow version requires reconciliation.");
  if (!['draft', 'designer_changes_requested', 'client_changes_requested'].includes(estimate.estimation?.status ?? estimate.status))
    blockers.push("Return the quotation to a draft before enabling the workflow.");
  if (estimate.estimation?.preApproval || estimate.estimation?.finalApproval || estimate.estimation?.editClosedAt || estimate.designFrozenAt ||
    estimate.designPlanStatus === "approved" || Number(estimate.designPlanVersion ?? 0) > 0)
    blockers.push("Existing quotation or design approvals require reconciliation; history will not be converted automatically.");
  if (estimate.designPlanDesignerId || project?.primaryDesignerId || (project?.assignedDesignerIds ?? []).length)
    blockers.push("Reconcile existing Designer assignments before enabling the workflow.");
  const rounds = await read(EstimateClientReviewRoundModel.find({ estimateId, status: { $in: ["pending", "approved"] } })).select({ _id: 1, status: 1, version: 1 }).sort({ _id: 1 }).lean();
  if (rounds.some(round => round.status === "pending")) blockers.push("Withdraw the pending Client review with a reason, then refresh this preview.");
  if (rounds.some(round => round.status === "approved")) blockers.push("Existing Client approvals cannot be converted without matching Sales approval evidence.");
  const designReview = await read(DesignPlanReviewRoundModel.exists({ estimateId }));
  if (designReview) blockers.push("Existing design review history requires reconciliation.");
  const commitments: boolean[] = [];
  for (const model of [ProjectPurchaseOrderModel, ProjectPurchaseOrderRequestModel, ProjectProcurementItemModel,
    FinanceLedgerEntryModel, VendorWorkAssignmentModel, ProcurementBasketEnquiryModel, ProjectFinanceBucketModel]) {
    commitments.push(!!(project && await read(model.exists({ projectId: project._id }))));
  }
  const workflow = project ? await read(DesignWorkflowStateModel.findOne({ projectId: project._id })).lean() as Row | null : null;
  if (commitments.some(Boolean) || workflow)
    blockers.push("Existing payments, procurement or design execution require reconciliation.");
  const currentWorkflowVersion = estimate.estimation?.workflowVersion ?? null;
  const estimateVersion = Number(estimate.version);
  const evidence = { estimateId, estimateVersion, currentWorkflowVersion, status: estimate.status, estimation: estimate.estimation ?? null,
    projectId: estimate.projectId ?? null, projectVersion: project?.estimationWorkflowVersion ?? null,
    fenceEpoch: project?.estimationFenceEpoch ?? 0, requirementsVersion: project?.estimateRequirementsVersion ?? 0,
    assignedEstimatorId: project?.assignedEstimatorId ?? null, clientId: project?.clientId ?? null,
    designWorkflowStages: project?.designWorkflowStages ?? null,
    projectUpdatedAt: project?.updatedAt ?? null, leadUpdatedAt: lead?.updatedAt ?? null, leadId: estimate.leadId, leadProjectId: lead?.projectId ?? null,
    rounds, commitments, designReview: !!designReview, workflowVersion: workflow?.version ?? null, blockers };
  return { estimate, project, preview: { estimateId, projectId: estimate.projectId as string | null,
    estimateVersion, currentWorkflowVersion: currentWorkflowVersion as 2 | 3 | null, targetVersion: 3 as const,
    eligible: blockers.length === 0, blockers, previewFingerprint: quotationSnapshotDigest(evidence) } };
}
