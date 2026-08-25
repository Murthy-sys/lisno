import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import {
  sha256Hex,
  type StoredEstimateClientResponseProof
} from "../domain/estimate-client-review.js";
import {
  projectWorkflowBlueprints,
  type DesignPlanStatus
} from "../domain/project-workflow.js";
import { isWorkerRole } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import { DesignPlanResponseProofModel } from "../models/DesignPlanResponseProof.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../models/EstimateDesignRevision.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimatePlanChangeRequestModel } from "../models/EstimatePlanChangeRequest.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import type { Storage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { DesignPlanMailer } from "./design-plan-mailer.js";
import { synchronizeEstimateDesignReviewState } from "./estimate-design-review-state.js";
import { approvePlanTargetsForDrawingRevision } from "./estimate-plan-review.service.js";

type Row = Record<string, any>;

export interface DesignPlanTaskDto {
  id: string;
  estimateId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  status: DesignPlanStatus;
  designPlanVersion: number;
  rooms: Array<Record<string, unknown>>;
  scopes: string[];
  lineItems: Array<Record<string, unknown>>;
}

export interface DesignPlanReviewTaskDto {
  id: string;
  estimateId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  designPlanVersion: number;
  status: "pending" | "approved" | "changes_requested";
  deliveryStatus: "queued" | "sending" | "sent" | "failed" | "disabled";
  submittedAt: string;
  version: number;
  attachmentNames: string[];
}

export interface ProjectWorkflowTaskDto {
  id: string;
  projectId: string;
  projectName: string;
  estimateId: string;
  kind: string;
  title: string;
  description: string;
  assigneeRole: string;
  sourceSectionId: string | null;
  roomName: string | null;
  status: string;
  openedAt: string;
}

export interface ProjectWorkflowService {
  listAssignableDesigners(
    actor: PublicUser
  ): Promise<Array<{ id: string; name: string; email: string }>>;
  assignDesigner(
    actor: PublicUser,
    projectId: string,
    designerId: string
  ): Promise<DesignPlanTaskDto>;
  listDesignerTasks(actor: PublicUser): Promise<DesignPlanTaskDto[]>;
  prepareDesignReview(
    actor: PublicUser,
    estimateId: string,
    submittedRevisionIds: string[],
    attachmentUploadIds: string[],
    submittedAt: Date,
    session: mongoose.ClientSession
  ): Promise<{ roundId: string; designPlanVersion: number }>;
  deliverDesignReview(roundId: string, actorId: string): Promise<void>;
  recordClientDrawingDecision(
    estimateId: string,
    actor: PublicUser,
    decision: "approve" | "request_changes",
    note: string,
    occurredAt: Date,
    session: mongoose.ClientSession
  ): Promise<void>;
  listDesignReviewTasks(
    actor: PublicUser,
    status?: "pending" | "approved" | "changes_requested"
  ): Promise<DesignPlanReviewTaskDto[]>;
  decideDesignReviewAsAdmin(input: {
    actor: PublicUser;
    roundId: string;
    expectedVersion: number;
    decision: "approve" | "request_changes";
    note: string;
    proof: StoredEstimateClientResponseProof;
  }): Promise<DesignPlanReviewTaskDto>;
  listOperationalTasks(actor: PublicUser): Promise<ProjectWorkflowTaskDto[]>;
}

export function createProjectWorkflowService(input: {
  storage: Storage;
  mailer: DesignPlanMailer;
  portalUrl: string;
  audit: AuditService;
  now?: () => Date;
}): ProjectWorkflowService {
  const now = input.now ?? (() => new Date());

  return {
    async listAssignableDesigners(actor) {
      if (!(actor.role === "admin" || actor.role === "super_admin")) forbidden();
      const designers = await UserModel.find({ role: "designer", active: true })
        .select({ _id: 1, name: 1, email: 1 })
        .sort({ name: 1, _id: 1 })
        .lean();
      return designers.map((designer) => ({
        id: String(designer._id),
        name: String(designer.name),
        email: String(designer.email)
      }));
    },

    async assignDesigner(actor, projectId, designerId) {
      await requireAdminProjectScope(actor, projectId);
      const designer = await UserModel.findOne({
        _id: designerId,
        role: "designer",
        active: true
      }).lean();
      if (!designer) {
        throw new ApiError(
          400,
          "DESIGNER_NOT_ASSIGNABLE",
          "Choose an active Designer."
        );
      }
      const assignedAt = now();
      let result: DesignPlanTaskDto | null = null;
      await withMongoTransaction(async (session) => {
        await requireAdminProjectScope(actor, projectId, session);
        const currentDesigner = await UserModel.findOne({
          _id: designerId,
          role: "designer",
          active: true
        }).session(session).lean();
        if (!currentDesigner) {
          throw new ApiError(
            409,
            "DESIGNER_NOT_ASSIGNABLE",
            "The selected Designer is no longer active."
          );
        }
        const estimate = await EstimateModel.findOne({
          projectId,
          status: "client_approved",
          designPlanStatus: {
            $in: [null, "pending_assignment", "assigned", "in_progress", "changes_requested"]
          }
        }).session(session).lean();
        if (!estimate) {
          throw new ApiError(
            409,
            "DESIGN_PLAN_NOT_ASSIGNABLE",
            "The estimate must be approved before assigning Design work."
          );
        }
        if (estimate.designPlanStatus === "approved") {
          throw new ApiError(409, "DESIGN_PLAN_APPROVED", "The approved Design plan cannot be reassigned.");
        }
        const project = await ProjectModel.findById(projectId).session(session).lean();
        const lead = await LeadModel.findById(estimate.leadId).session(session).lean();
        if (!project || !lead) notFound();

        const estimateUpdated = await EstimateModel.updateOne(
          {
            _id: estimate._id,
            projectId,
            status: "client_approved",
            designPlanStatus: estimate.designPlanStatus == null
              ? { $in: [null] }
              : estimate.designPlanStatus,
            designPlanVersion: Number(estimate.designPlanVersion ?? 0) === 0
              ? { $in: [null, 0] }
              : Number(estimate.designPlanVersion)
          },
          {
            $set: {
              designPlanStatus: "assigned",
              designPlanDesignerId: designer._id,
              designPlanAssignedById: actor.id,
              designPlanAssignedAt: assignedAt,
              designPlanSubmittedAt: null,
              designFrozenAt: null
            },
            $inc: { designLifecycleVersion: 1 }
          },
          { session }
        );
        requireMatched(estimateUpdated, "The Design assignment changed before it could be saved.");
        const projectUpdated = await ProjectModel.updateOne(
          { _id: projectId },
          {
            $set: {
              assignedDesignerIds: [String(designer._id)],
              managerId: null,
              updatedAt: assignedAt
            }
          },
          { session }
        );
        requireMatched(projectUpdated, "The project changed before the Design assignment could be saved.");
        const leadUpdated = await LeadModel.updateOne(
          { _id: lead._id, projectId },
          {
            $set: {
              nextAction: "Designer to upload design plan",
              nextActionAt: assignedAt,
              updatedAt: assignedAt
            }
          },
          { session }
        );
        requireMatched(leadUpdated, "The project handoff changed before the Design assignment could be saved.");
        const dedupeKey = `${String(estimate._id)}:design-plan-upload`;
        await ProjectWorkflowTaskModel.findOneAndUpdate(
          { dedupeKey },
          {
            $setOnInsert: {
              _id: `workflow-task-${randomUUID()}`,
              dedupeKey,
              projectId,
              estimateId: String(estimate._id),
              designPlanVersion: Number(estimate.designPlanVersion ?? 0),
              kind: "design_plan_upload",
              title: "Upload design plan",
              description: "Upload the approved-estimate design plan, review extracted drawings, and submit it to the Client.",
              assigneeRole: "designer",
              sourceSectionId: null,
              sourceLineItemKey: null,
              roomName: null,
              openedAt: assignedAt
            },
            $set: {
              assigneeUserId: String(designer._id),
              status: "open",
              completedAt: null
            }
          },
          { upsert: true, new: true, runValidators: true, session }
        ).lean();
        await input.audit.appendInMongoTransaction({
          actorId: actor.id,
          action: "design_plan_designer_assigned",
          entityType: "estimate",
          entityId: String(estimate._id),
          occurredAt: assignedAt.toISOString(),
          oldValues: {
            designPlanStatus: estimate.designPlanStatus,
            designerId: estimate.designPlanDesignerId ?? null,
            projectManagerId: project.managerId ?? null,
            nextAction: lead.nextAction
          },
          newValues: {
            designPlanStatus: "assigned",
            designerId: String(designer._id),
            projectId,
            projectManagerId: null,
            nextAction: "Designer to upload design plan"
          }
        }, session);
        result = taskDto({
          ...estimate,
          designPlanStatus: "assigned",
          designPlanDesignerId: designer._id
        }, project, lead);
      });
      if (!result) throw new Error("Design assignment did not complete.");
      return result;
    },

    async listDesignerTasks(actor) {
      if (actor.role !== "designer") forbidden();
      const estimates = await EstimateModel.find({
        status: "client_approved",
        designPlanDesignerId: actor.id,
        designPlanStatus: {
          $in: ["assigned", "in_progress", "ready_for_client", "changes_requested", "approved"]
        }
      }).sort({ designPlanAssignedAt: -1, _id: 1 }).lean();
      const leads = await LeadModel.find({
        _id: { $in: estimates.map((estimate) => estimate.leadId) }
      }).lean();
      const projects = await ProjectModel.find({
        _id: { $in: estimates.map((estimate) => estimate.projectId).filter(Boolean) }
      }).lean();
      const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));
      const projectById = new Map(projects.map((project) => [String(project._id), project]));
      return estimates.flatMap((estimate) => {
        const lead = leadById.get(String(estimate.leadId));
        const project = projectById.get(String(estimate.projectId));
        return lead && project ? [taskDto(estimate, project, lead)] : [];
      });
    },

    async prepareDesignReview(
      actor,
      estimateId,
      submittedRevisionIds,
      attachmentUploadIds,
      submittedAt,
      session
    ) {
      const estimate = await EstimateModel.findOne({
        _id: estimateId,
        status: "client_approved",
        designPlanDesignerId: actor.id,
        designPlanStatus: { $in: ["assigned", "in_progress", "changes_requested"] },
        designFrozenAt: { $in: [null] }
      }).session(session).lean();
      if (!estimate || actor.role !== "designer") forbidden();
      const [lead, project, uploads] = await Promise.all([
        LeadModel.findById(estimate.leadId).session(session).lean(),
        ProjectModel.findById(estimate.projectId).session(session).lean(),
        EstimateDesignUploadModel.find({
          _id: { $in: attachmentUploadIds },
          estimateId
        }).session(session).lean()
      ]);
      if (!lead || !project) notFound();
      const currentRevisions = await currentDrawingRevisions(estimateId, session);
      const expectedRevisionIds = currentRevisions.map(({ revision }) => String(revision._id));
      if (
        expectedRevisionIds.length === 0 ||
        new Set(submittedRevisionIds).size !== submittedRevisionIds.length ||
        submittedRevisionIds.length !== expectedRevisionIds.length ||
        expectedRevisionIds.some((revisionId) => !submittedRevisionIds.includes(revisionId)) ||
        currentRevisions.some(({ revision }) =>
          !["submitted", "approved"].includes(String(revision.reviewStatus))
        )
      ) {
        throw new ApiError(
          409,
          "DESIGN_PLAN_REVISION_CONFLICT",
          "The submitted Design drawings changed before Client review could be prepared."
        );
      }
      if (
        attachmentUploadIds.length === 0 ||
        uploads.length !== new Set(attachmentUploadIds).size
      ) {
        throw new ApiError(
          409,
          "DESIGN_PLAN_ATTACHMENT_CONFLICT",
          "The submitted Design plan attachments changed before Client review could be prepared."
        );
      }
      const uploadAttachmentSnapshots = await Promise.all(uploads.map(async (upload) => {
        const bytes = await input.storage.read(String(upload.storedFileReference));
        if (bytes.byteLength !== Number(upload.sizeBytes)) {
          throw new ApiError(
            409,
            "DESIGN_PLAN_ATTACHMENT_CONFLICT",
            "A submitted Design plan attachment no longer matches its stored upload."
          );
        }
        return {
          uploadId: String(upload._id),
          filename: String(upload.originalFilename),
          mimeType: String(upload.mimeType),
          byteSize: bytes.byteLength,
          sha256: sha256Hex(bytes),
          storageReference: String(upload.storedFileReference)
        };
      }));
      const replacementAttachmentSnapshots = await Promise.all(
        currentRevisions
          .filter(({ revision }) => Boolean(revision.replacesRevisionId))
          .map(async ({ drawing, revision }) => {
            const storageReference = String(revision.croppedFileReference);
            const bytes = await input.storage.read(storageReference);
            if (bytes.byteLength === 0) {
              throw new ApiError(
                409,
                "DESIGN_PLAN_ATTACHMENT_CONFLICT",
                "A revised Design drawing is no longer available."
              );
            }
            const title = safeAttachmentStem(
              String(drawing.displayTitle ?? revision.label ?? "drawing")
            );
            return {
              uploadId: `revision:${String(revision._id)}`,
              filename: `revised-${title}-v${Number(revision.revisionNumber)}.png`,
              mimeType: "image/png",
              byteSize: bytes.byteLength,
              sha256: sha256Hex(bytes),
              storageReference
            };
          })
      );
      const attachmentSnapshots = [
        ...uploadAttachmentSnapshots,
        ...replacementAttachmentSnapshots
      ];
      const designPlanVersion = Number(estimate.designPlanVersion ?? 0) + 1;
      const assignedAdminId = await resolveDesignReviewAdmin(project._id, session);
      const roundId = `design-plan-review-${randomUUID()}`;
      await DesignPlanReviewRoundModel.create([{
        _id: roundId,
        estimateId,
        projectId: String(project._id),
        leadId: String(lead._id),
        designPlanVersion,
        recipientEmail: String(lead.clientEmail),
        clientName: String(lead.clientName),
        projectName: String(lead.projectName),
        submittedRevisionIds,
        attachments: attachmentSnapshots,
        submittedById: actor.id,
        submittedAt,
        assignedAdminId,
        deliveryStatus: "queued",
        deliveryAttemptCount: 0,
        deliveredAt: null,
        deliveryFailureCode: null,
        status: "pending",
        decision: null,
        decisionSource: null,
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
        version: 1
      }], { session });
      const updated = await EstimateModel.updateOne(
        {
          _id: estimateId,
          designPlanStatus: estimate.designPlanStatus,
          designPlanVersion: Number(estimate.designPlanVersion ?? 0),
          designPlanDesignerId: actor.id
        },
        {
          $set: {
            designPlanStatus: "ready_for_client",
            designPlanSubmittedAt: submittedAt
          },
          $inc: { designPlanVersion: 1 }
        },
        { session }
      );
      requireMatched(updated, "The Design plan changed before it could be submitted.");
      await ProjectWorkflowTaskModel.updateOne(
        { dedupeKey: `${estimateId}:design-plan-upload`, assigneeUserId: actor.id },
        { $set: { status: "completed", completedAt: submittedAt } },
        { session }
      );
      await input.audit.appendInMongoTransaction({
        actorId: actor.id,
        action: "design_plan_submitted_for_client_review",
        entityType: "design_plan_review_round",
        entityId: roundId,
        occurredAt: submittedAt.toISOString(),
        oldValues: { designPlanStatus: estimate.designPlanStatus },
        newValues: {
          designPlanStatus: "ready_for_client",
          designPlanVersion,
          submittedDrawingCount: submittedRevisionIds.length,
          attachmentCount: attachmentSnapshots.length
        }
      }, session);
      return { roundId, designPlanVersion };
    },

    async deliverDesignReview(roundId, actorId) {
      const round = await DesignPlanReviewRoundModel.findOne({
        _id: roundId,
        status: "pending",
        deliveryStatus: "queued"
      }).lean();
      if (!round) return;
      if (input.mailer.deliveryKind === "disabled") {
        await DesignPlanReviewRoundModel.updateOne(
          { _id: roundId, deliveryStatus: "queued" },
          {
            $set: { deliveryStatus: "disabled" },
            $inc: { version: 1 }
          }
        );
        return;
      }
      const deliveryRound = await DesignPlanReviewRoundModel.findOneAndUpdate(
        { _id: roundId, status: "pending", deliveryStatus: "queued" },
        {
          $set: { deliveryStatus: "sending", deliveryFailureCode: null },
          $inc: { deliveryAttemptCount: 1, version: 1 }
        },
        { new: true }
      ).select("+attachments.storageReference").lean();
      if (!deliveryRound) return;
      let outcome: { status: "sent" | "failed"; failureCode: string | null };
      try {
        const attachments = await Promise.all(
          (deliveryRound.attachments as Row[]).map(async (attachment) => {
            const bytes = await input.storage.read(String(attachment.storageReference));
            if (
              bytes.byteLength !== Number(attachment.byteSize) ||
              sha256Hex(bytes) !== String(attachment.sha256)
            ) {
              throw new ApiError(
                409,
                "DESIGN_PLAN_ATTACHMENT_CONFLICT",
                "A submitted Design plan attachment no longer matches the review snapshot."
              );
            }
            return {
              filename: String(attachment.filename),
              mimeType: String(attachment.mimeType),
              bytes
            };
          })
        );
        const delivery = await input.mailer.sendDesignPlan({
          to: String(deliveryRound.recipientEmail),
          clientName: String(deliveryRound.clientName),
          projectName: String(deliveryRound.projectName),
          designPlanVersion: Number(deliveryRound.designPlanVersion),
          portalUrl: input.portalUrl,
          attachments
        });
        outcome = delivery.kind === "sent"
          ? { status: "sent", failureCode: null }
          : { status: "failed", failureCode: boundedFailureCode(delivery.failureCode) };
      } catch {
        outcome = { status: "failed", failureCode: "DESIGN_PLAN_MAILER_FAILED" };
      }
      const completedAt = now();
      const updated = await DesignPlanReviewRoundModel.updateOne(
        { _id: roundId, status: "pending", deliveryStatus: "sending" },
        {
          $set: {
            deliveryStatus: outcome.status,
            deliveredAt: outcome.status === "sent" ? completedAt : null,
            deliveryFailureCode: outcome.failureCode
          },
          $inc: { version: 1 }
        }
      );
      if (updated.matchedCount === 1) {
        await input.audit.append({
          actorId,
          action: outcome.status === "sent"
            ? "design_plan_email_delivery_sent"
            : "design_plan_email_delivery_failed",
          entityType: "design_plan_review_round",
          entityId: roundId,
          occurredAt: completedAt.toISOString(),
          oldValues: { deliveryStatus: "queued" },
          newValues: {
            deliveryStatus: outcome.status,
            ...(outcome.failureCode ? { failureCode: outcome.failureCode } : {})
          }
        });
      }
    },

    async recordClientDrawingDecision(
      estimateId,
      actor,
      decision,
      note,
      occurredAt,
      session
    ) {
      const estimate = await EstimateModel.findById(estimateId).session(session).lean();
      if (!estimate?.designPlanStatus || estimate.designPlanStatus === "approved") return;
      const round = await DesignPlanReviewRoundModel.findOne({
        estimateId,
        designPlanVersion: Number(estimate.designPlanVersion),
        status: "pending"
      }).session(session).lean();
      if (!round) return;
      if (decision === "request_changes") {
        await transitionReviewRound(round, {
          status: "changes_requested",
          decision: "request_changes",
          source: "client_portal",
          actorId: actor.id,
          note,
          occurredAt,
          session
        });
        await reopenDesignPlan(estimateId, occurredAt, session);
        return;
      }
      if (!(await designPlanIsReady(estimateId, session))) return;
      await finalizeDesignApproval({
        estimate,
        round,
        actorId: actor.id,
        source: "client_portal",
        note,
        occurredAt,
        session,
        audit: input.audit
      });
    },

    async listDesignReviewTasks(actor, status) {
      if (!(["admin", "super_admin"] as string[]).includes(actor.role)) forbidden();
      const filter: Row = status ? { status } : {};
      if (actor.role === "admin") {
        const grants = await ProjectAccessGrantModel.find({
          userId: actor.id,
          module: "projects",
          source: "admin_initiator",
          active: true
        }).select({ projectId: 1 }).lean();
        if (grants.length === 0) return [];
        filter.assignedAdminId = actor.id;
        filter.projectId = { $in: grants.map((grant) => String(grant.projectId)) };
      }
      const rounds = await DesignPlanReviewRoundModel.find(filter)
        .sort({ submittedAt: -1, _id: 1 })
        .limit(100)
        .lean();
      return rounds.map(reviewTaskDto);
    },

    async decideDesignReviewAsAdmin(decisionInput) {
      const { actor, roundId, expectedVersion, decision, proof } = decisionInput;
      const note = decisionInput.note.trim();
      if (!(["admin", "super_admin"] as string[]).includes(actor.role)) forbidden();
      if (decision === "request_changes" && !note) {
        throw new ApiError(400, "DESIGN_PLAN_NOTE_REQUIRED", "Explain the Client's requested changes.");
      }
      const occurredAt = now();
      let saved: Row | null = null;
      await withMongoTransaction(async (session) => {
        const roundFilter: Row = {
          _id: roundId,
          status: "pending",
          version: expectedVersion
        };
        if (actor.role === "admin") roundFilter.assignedAdminId = actor.id;
        const round = await DesignPlanReviewRoundModel.findOne(roundFilter).session(session).lean();
        if (!round) {
          throw new ApiError(409, "DESIGN_PLAN_NOT_REVIEWABLE", "This Design plan is no longer awaiting review.");
        }
        await requireAdminProjectScope(actor, String(round.projectId), session);
        const estimate = await EstimateModel.findOne({
          _id: round.estimateId,
          projectId: round.projectId,
          status: "client_approved",
          designPlanStatus: "ready_for_client",
          designPlanVersion: round.designPlanVersion,
          designFrozenAt: { $in: [null] }
        }).session(session).lean();
        if (!estimate) {
          throw new ApiError(409, "DESIGN_PLAN_NOT_REVIEWABLE", "This Design plan is no longer awaiting review.");
        }
        const drawings = await currentDrawingRevisions(String(estimate._id), session);
        if (drawings.length === 0) {
          throw new ApiError(409, "DESIGN_PLAN_EMPTY", "A Design plan must contain at least one drawing.");
        }
        if (decision === "approve") {
          if (drawings.some(({ revision }) => !["submitted", "approved"].includes(String(revision.reviewStatus)))) {
            throw new ApiError(409, "DESIGN_PLAN_INCOMPLETE", "Every current drawing must be submitted before approval.");
          }
          const ids = drawings
            .filter(({ revision }) => revision.reviewStatus === "submitted")
            .map(({ revision }) => revision._id);
          if (ids.length) {
            await EstimateDesignRevisionModel.updateMany(
              { _id: { $in: ids }, reviewStatus: "submitted" },
              {
                $set: {
                  reviewStatus: "approved",
                  reviewerId: actor.id,
                  reviewedAt: occurredAt,
                  changeSummary: null,
                  annotations: null
                }
              },
              { session }
            );
            for (const revisionId of ids) {
              await approvePlanTargetsForDrawingRevision(String(revisionId), session);
            }
          }
          const openFeedback = await EstimatePlanChangeRequestModel.countDocuments({
            estimateId: estimate._id,
            status: "open"
          }).session(session);
          if (openFeedback > 0) {
            throw new ApiError(
              409,
              "DESIGN_PLAN_FEEDBACK_OPEN",
              "Resolve open Design feedback before recording approval."
            );
          }
        } else {
          const ids = drawings
            .filter(({ revision }) => revision.reviewStatus === "submitted")
            .map(({ revision }) => revision._id);
          if (ids.length) {
            await EstimateDesignRevisionModel.updateMany(
              { _id: { $in: ids }, reviewStatus: "submitted" },
              {
                $set: {
                  reviewStatus: "changes_requested",
                  reviewerId: actor.id,
                  reviewedAt: occurredAt,
                  changeSummary: note,
                  annotations: null
                }
              },
              { session }
            );
          }
        }
        await synchronizeEstimateDesignReviewState(
          String(estimate._id),
          decision === "approve" ? "approved" : "changes_requested",
          session
        );
        const proofId = `design-plan-proof-${randomUUID()}`;
        await DesignPlanResponseProofModel.create([{
          _id: proofId,
          reviewRoundId: roundId,
          estimateId: String(estimate._id),
          storageReference: proof.storageReference,
          originalFilename: proof.originalFilename,
          mimeType: proof.mimeType,
          byteSize: proof.byteSize,
          sha256: proof.sha256,
          uploadedById: actor.id,
          uploadedAt: occurredAt
        }], { session });
        if (decision === "approve") {
          await finalizeDesignApproval({
            estimate,
            round,
            actorId: actor.id,
            source: "admin_proof",
            note,
            occurredAt,
            session,
            audit: input.audit
          });
        } else {
          await transitionReviewRound(round, {
            status: "changes_requested",
            decision: "request_changes",
            source: "admin_proof",
            actorId: actor.id,
            note,
            occurredAt,
            session
          });
          await reopenDesignPlan(String(estimate._id), occurredAt, session);
        }
        await input.audit.appendInMongoTransaction({
          actorId: actor.id,
          action: "design_plan_client_proof_stored",
          entityType: "design_plan_response_proof",
          entityId: proofId,
          occurredAt: occurredAt.toISOString(),
          oldValues: {},
          newValues: {
            reviewRoundId: roundId,
            estimateId: String(estimate._id),
            mimeType: proof.mimeType,
            byteSize: proof.byteSize,
            sha256: proof.sha256
          }
        }, session);
        saved = {
          ...round,
          status: decision === "approve" ? "approved" : "changes_requested",
          version: Number(round.version) + 1,
          decision,
          decisionSource: "admin_proof",
          decisionNote: note,
          decidedById: actor.id,
          decidedAt: occurredAt
        };
      });
      if (!saved) throw new Error("Design plan decision did not complete.");
      return reviewTaskDto(saved);
    },

    async listOperationalTasks(actor) {
      if (!(
        actor.role === "procurement" ||
        actor.role === "finance_head" ||
        actor.role === "site_manager" ||
        isWorkerRole(actor.role)
      )) forbidden();
      const filter: Row = { assigneeRole: actor.role };
      const tasks = await ProjectWorkflowTaskModel.find(filter)
        .sort({ status: 1, openedAt: -1, _id: 1 })
        .lean();
      const projects = await ProjectModel.find({
        _id: { $in: tasks.map((task) => task.projectId) }
      }).select({ _id: 1, name: 1 }).lean();
      const projectNames = new Map(
        projects.map((project) => [String(project._id), String(project.name)])
      );
      return tasks.map((task) => ({
        id: String(task._id),
        projectId: String(task.projectId),
        projectName: projectNames.get(String(task.projectId)) ?? "Project",
        estimateId: String(task.estimateId),
        kind: String(task.kind),
        title: String(task.title),
        description: String(task.description ?? ""),
        assigneeRole: String(task.assigneeRole),
        sourceSectionId: task.sourceSectionId == null ? null : String(task.sourceSectionId),
        roomName: task.roomName == null ? null : String(task.roomName),
        status: String(task.status),
        openedAt: new Date(task.openedAt).toISOString()
      }));
    }
  };
}

async function requireAdminProjectScope(
  actor: PublicUser,
  projectId: string,
  session?: mongoose.ClientSession
) {
  if (actor.role === "super_admin") {
    const query = ProjectModel.exists({ _id: projectId });
    if (session) query.session(session);
    if (!(await query)) notFound();
    return;
  }
  if (actor.role !== "admin") forbidden();
  const query = ProjectAccessGrantModel.exists({
    projectId,
    userId: actor.id,
    module: "projects",
    source: "admin_initiator",
    active: true
  });
  if (session) query.session(session);
  if (!(await query)) notFound();
}

async function resolveDesignReviewAdmin(
  projectId: string,
  session: mongoose.ClientSession
) {
  const grant = await ProjectAccessGrantModel.findOne({
    projectId,
    module: "projects",
    source: "admin_initiator",
    active: true
  }).session(session).lean();
  if (grant) {
    const admin = await UserModel.findOne({
      _id: grant.userId,
      role: "admin",
      active: true
    }).session(session).lean();
    if (admin) return String(admin._id);
  }
  const superAdmin = await UserModel.findOne({
    role: "super_admin",
    active: true
  }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
  if (!superAdmin) {
    throw new ApiError(409, "DESIGN_REVIEW_ASSIGNEE_REQUIRED", "An active Admin is required for Design review.");
  }
  return String(superAdmin._id);
}

async function currentDrawingRevisions(
  estimateId: string,
  session: mongoose.ClientSession
) {
  const drawings = await EstimateDesignDrawingModel.find({
    estimateId,
    active: true
  }).sort({ _id: 1 }).session(session).lean();
  const rows: Array<{ drawing: Row; revision: Row }> = [];
  for (const drawing of drawings) {
    const revision = await EstimateDesignRevisionModel.findOne({
      drawingId: drawing._id
    }).sort({ revisionNumber: -1 }).session(session).lean();
    if (revision) rows.push({ drawing, revision });
  }
  return rows;
}

async function designPlanIsReady(
  estimateId: string,
  session: mongoose.ClientSession
) {
  const revisions = await currentDrawingRevisions(estimateId, session);
  if (revisions.length === 0) return false;
  if (revisions.some(({ revision }) => revision.reviewStatus !== "approved")) return false;
  return (await EstimatePlanChangeRequestModel.countDocuments({
    estimateId,
    status: "open"
  }).session(session)) === 0;
}

async function transitionReviewRound(
  round: Row,
  input: {
    status: "approved" | "changes_requested";
    decision: "approve" | "request_changes";
    source: "client_portal" | "admin_proof";
    actorId: string;
    note: string;
    occurredAt: Date;
    session: mongoose.ClientSession;
  }
) {
  const updated = await DesignPlanReviewRoundModel.updateOne(
    { _id: round._id, status: "pending", version: Number(round.version) },
    {
      $set: {
        status: input.status,
        decision: input.decision,
        decisionSource: input.source,
        decisionNote: input.note,
        decidedById: input.actorId,
        decidedAt: input.occurredAt
      },
      $inc: { version: 1 }
    },
    { session: input.session }
  );
  requireMatched(updated, "This Design decision was already recorded.");
}

async function reopenDesignPlan(
  estimateId: string,
  occurredAt: Date,
  session: mongoose.ClientSession
) {
  const updated = await EstimateModel.updateOne(
    {
      _id: estimateId,
      status: "client_approved",
      designPlanStatus: "ready_for_client",
      designFrozenAt: { $in: [null] }
    },
    {
      $set: { designPlanStatus: "changes_requested" },
      $inc: { designLifecycleVersion: 1 }
    },
    { session }
  );
  requireMatched(updated, "This Design plan changed before feedback was recorded.");
  await ProjectWorkflowTaskModel.updateOne(
    { dedupeKey: `${estimateId}:design-plan-upload` },
    { $set: { status: "open", completedAt: null, openedAt: occurredAt } },
    { session }
  );
}

async function finalizeDesignApproval(input: {
  estimate: Row;
  round: Row;
  actorId: string;
  source: "client_portal" | "admin_proof";
  note: string;
  occurredAt: Date;
  session: mongoose.ClientSession;
  audit: AuditService;
}) {
  await transitionReviewRound(input.round, {
    status: "approved",
    decision: "approve",
    source: input.source,
    actorId: input.actorId,
    note: input.note,
    occurredAt: input.occurredAt,
    session: input.session
  });
  const estimateUpdated = await EstimateModel.updateOne(
    {
      _id: input.estimate._id,
      status: "client_approved",
      designPlanStatus: "ready_for_client",
      designPlanVersion: Number(input.round.designPlanVersion),
      designFrozenAt: { $in: [null] }
    },
    {
      $set: {
        designPlanStatus: "approved",
        designPlanApprovedAt: input.occurredAt,
        designPlanApprovedById: input.actorId,
        designPlanApprovalSource: input.source,
        designFrozenAt: input.occurredAt
      },
      $inc: { designLifecycleVersion: 1 }
    },
    { session: input.session }
  );
  requireMatched(estimateUpdated, "This Design plan changed before approval was recorded.");
  await generateDownstreamTasks(
    input.estimate,
    Number(input.round.designPlanVersion),
    input.occurredAt,
    input.session
  );
  await ProjectModel.updateOne(
    { _id: input.estimate.projectId, status: "planning" },
    { $set: { status: "active", actualStartAt: input.occurredAt, updatedAt: input.occurredAt } },
    { session: input.session }
  );
  await LeadModel.updateOne(
    { _id: input.estimate.leadId, projectId: input.estimate.projectId },
    {
      $set: {
        nextAction: "project kickoff",
        nextActionAt: input.occurredAt
      }
    },
    { session: input.session }
  );
  await input.audit.appendInMongoTransaction({
    actorId: input.actorId,
    action: "design_plan_approved",
    entityType: "estimate",
    entityId: String(input.estimate._id),
    occurredAt: input.occurredAt.toISOString(),
    oldValues: { designPlanStatus: "ready_for_client" },
    newValues: {
      designPlanStatus: "approved",
      designPlanVersion: Number(input.round.designPlanVersion),
      decisionSource: input.source
    }
  }, input.session);
}

async function generateDownstreamTasks(
  estimate: Row,
  designPlanVersion: number,
  openedAt: Date,
  session: mongoose.ClientSession
) {
  const blueprints = projectWorkflowBlueprints({
    estimateId: String(estimate._id),
    lineItems: (estimate.lineItems ?? []) as never
  });
  for (const blueprint of blueprints) {
    await ProjectWorkflowTaskModel.updateOne(
      { dedupeKey: blueprint.dedupeKey },
      {
        $setOnInsert: {
          _id: `workflow-task-${randomUUID()}`,
          ...blueprint,
          projectId: String(estimate.projectId),
          estimateId: String(estimate._id),
          designPlanVersion,
          assigneeUserId: null,
          status: "open",
          openedAt,
          completedAt: null
        }
      },
      { upsert: true, session, runValidators: true }
    );
  }
}

function taskDto(estimate: Row, project: Row, lead: Row): DesignPlanTaskDto {
  return {
    id: `${String(estimate._id)}:design-plan-upload`,
    estimateId: String(estimate._id),
    projectId: String(project._id),
    projectName: String(project.name),
    clientName: String(lead.clientName),
    status: String(estimate.designPlanStatus) as DesignPlanStatus,
    designPlanVersion: Number(estimate.designPlanVersion ?? 0),
    rooms: (estimate.rooms ?? []) as Array<Record<string, unknown>>,
    scopes: (estimate.scopes ?? []).map(String),
    lineItems: (estimate.lineItems ?? []) as Array<Record<string, unknown>>
  };
}

function reviewTaskDto(round: Row): DesignPlanReviewTaskDto {
  return {
    id: String(round._id),
    estimateId: String(round.estimateId),
    projectId: String(round.projectId),
    projectName: String(round.projectName),
    clientName: String(round.clientName),
    designPlanVersion: Number(round.designPlanVersion),
    status: round.status,
    deliveryStatus: round.deliveryStatus,
    submittedAt: new Date(round.submittedAt).toISOString(),
    version: Number(round.version),
    attachmentNames: (round.attachments ?? []).map((attachment: Row) => String(attachment.filename))
  };
}

function requireMatched(result: { matchedCount: number }, message: string) {
  if (result.matchedCount !== 1) {
    throw new ApiError(409, "WORKFLOW_CONFLICT", message);
  }
}

function boundedFailureCode(value: string) {
  return /^[A-Z0-9_]{1,64}$/u.test(value) ? value : "DESIGN_PLAN_MAILER_FAILED";
}

function safeAttachmentStem(value: string) {
  const stem = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return stem || "drawing";
}

function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You do not have access to this operation.");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

async function withMongoTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
) {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
