import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import {
  sha256Hex,
  type StoredEstimateClientResponseProof
} from "../domain/estimate-client-review.js";
import {
  projectWorkflowBlueprints,
  workflowTaskDueAt,
  WORKFLOW_TASK_SCHEDULE,
  type DesignPlanStatus
} from "../domain/project-workflow.js";
import {
  WORKER_ROLES,
  isWorkerRole,
  type WorkerRole
} from "../domain/roles.js";
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
import type { OpenFinanceBucketInput } from "./project-finance.service.js";

type Row = Record<string, any>;

const DOWNSTREAM_EXECUTION_TASK_KINDS = [
  "procurement",
  "finance",
  "site_execution",
  "trade_execution"
] as const;

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
  assignedWorker: {
    id: string;
    name: string;
    email: string;
    role: WorkerRole;
    active: boolean;
  } | null;
  sourceSectionId: string | null;
  roomName: string | null;
  status: string;
  progress: number;
  version: number;
  openedAt: string;
  updatedAt: string;
}

export interface WorkerAssignmentOptionDto {
  id: string;
  name: string;
  email: string;
  role: WorkerRole;
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
  deliverDesignReview(
    roundId: string,
    actorId: string
  ): Promise<DesignPlanReviewTaskDto["deliveryStatus"] | undefined>;
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
  readDesignReviewAttachment(
    actor: PublicUser,
    roundId: string,
    attachmentIndex: number
  ): Promise<{ filename: string; mimeType: string; bytes: Buffer }>;
  retryDesignReviewDelivery(
    actor: PublicUser,
    roundId: string,
    expectedVersion: number
  ): Promise<DesignPlanReviewTaskDto>;
  decideDesignReviewAsAdmin(input: {
    actor: PublicUser;
    roundId: string;
    expectedVersion: number;
    decision: "approve" | "request_changes";
    note: string;
    proof: StoredEstimateClientResponseProof;
  }): Promise<DesignPlanReviewTaskDto>;
  listAssignableWorkers(actor: PublicUser): Promise<WorkerAssignmentOptionDto[]>;
  listProjectWorkflowTasks(
    actor: PublicUser,
    projectId: string
  ): Promise<ProjectWorkflowTaskDto[]>;
  overrideWorkerAssignment(input: {
    actor: PublicUser;
    projectId: string;
    taskId: string;
    expectedVersion: number;
    workerId: string | null;
  }): Promise<ProjectWorkflowTaskDto>;
  listOperationalTasks(actor: PublicUser): Promise<ProjectWorkflowTaskDto[]>;
  updateOperationalTask(
    actor: PublicUser,
    taskId: string,
    expectedVersion: number,
    progress: number
  ): Promise<ProjectWorkflowTaskDto>;
}

export function createProjectWorkflowService(input: {
  storage: Storage;
  mailer: DesignPlanMailer;
  portalUrl: string;
  audit: AuditService;
  finance?: {
    open(
      input: OpenFinanceBucketInput,
      session: mongoose.ClientSession
    ): Promise<unknown>;
  };
  now?: () => Date;
}): ProjectWorkflowService {
  const now = input.now ?? (() => new Date());

  const service: ProjectWorkflowService = {
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
        const designPlanVersion = Number(estimate.designPlanVersion ?? 0);

        const estimateUpdated = await EstimateModel.updateOne(
          {
            _id: estimate._id,
            projectId,
            status: "client_approved",
            designPlanStatus: estimate.designPlanStatus == null
              ? { $in: [null] }
              : estimate.designPlanStatus,
            designPlanVersion: legacyZeroVersionFilter(designPlanVersion)
          },
          {
            $set: {
              designPlanStatus: "assigned",
              designPlanVersion,
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
              openedAt: assignedAt,
              dueAt: workflowTaskDueAt("design_plan_upload", assignedAt),
              plannedEffort: WORKFLOW_TASK_SCHEDULE.design_plan_upload.plannedEffort
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
      const previousDesignPlanVersion = Number(estimate.designPlanVersion ?? 0);
      const designPlanVersion = previousDesignPlanVersion + 1;
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
          designPlanVersion: legacyZeroVersionFilter(previousDesignPlanVersion),
          designPlanDesignerId: actor.id
        },
        {
          $set: {
            designPlanStatus: "ready_for_client",
            designPlanSubmittedAt: submittedAt,
            designPlanVersion
          }
        },
        { session }
      );
      requireMatched(updated, "The Design plan changed before it could be submitted.");
      await ProjectWorkflowTaskModel.updateOne(
        { dedupeKey: `${estimateId}:design-plan-upload`, assigneeUserId: actor.id },
        {
          $set: {
            status: "completed",
            progress: 100,
            completedAt: submittedAt
          },
          $inc: { version: 1 }
        },
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
        const disabled = await DesignPlanReviewRoundModel.updateOne(
          { _id: roundId, deliveryStatus: "queued" },
          {
            $set: { deliveryStatus: "disabled" },
            $inc: { version: 1 }
          }
        );
        return disabled.matchedCount === 1 ? "disabled" : undefined;
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
        return outcome.status;
      }
      return undefined;
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
        audit: input.audit,
        finance: input.finance
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

    async readDesignReviewAttachment(actor, roundId, attachmentIndex) {
      if (!(["admin", "super_admin"] as string[]).includes(actor.role)) forbidden();
      if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0) notFound();
      const filter: Row = { _id: roundId };
      if (actor.role === "admin") filter.assignedAdminId = actor.id;
      const round = await DesignPlanReviewRoundModel.findOne(filter)
        .select("+attachments.storageReference")
        .lean();
      if (!round) notFound();
      await requireAdminProjectScope(actor, String(round.projectId));
      const attachment = (round.attachments as Row[] | undefined)?.[attachmentIndex];
      if (!attachment) notFound();
      const storageReference = attachment.storageReference;
      if (typeof storageReference !== "string" || storageReference.length === 0) {
        throw designPlanAttachmentConflict();
      }
      let bytes: Buffer;
      try {
        bytes = await input.storage.read(storageReference);
      } catch {
        throw designPlanAttachmentConflict();
      }
      if (
        bytes.byteLength !== Number(attachment.byteSize) ||
        sha256Hex(bytes) !== String(attachment.sha256)
      ) {
        throw designPlanAttachmentConflict();
      }
      return {
        filename: String(attachment.filename),
        mimeType: String(attachment.mimeType),
        bytes
      };
    },

    async retryDesignReviewDelivery(actor, roundId, expectedVersion) {
      if (!(actor.role === "admin" || actor.role === "super_admin")) forbidden();
      const requestedAt = now();
      await withMongoTransaction(async (session) => {
        const retryFilter: Row = {
          _id: roundId,
          status: "pending",
          deliveryStatus: { $in: ["failed", "disabled"] },
          version: expectedVersion
        };
        if (actor.role === "admin") retryFilter.assignedAdminId = actor.id;
        const round = await DesignPlanReviewRoundModel.findOne(retryFilter)
          .session(session)
          .lean();
        if (!round) {
          throw new ApiError(
            409,
            "DESIGN_PLAN_EMAIL_NOT_RETRYABLE",
            "This Design plan email can no longer be retried."
          );
        }
        await requireAdminProjectScope(actor, String(round.projectId), session);
        const compareAndSwapFilter: Row = {
          _id: roundId,
          status: "pending",
          deliveryStatus: round.deliveryStatus,
          version: expectedVersion
        };
        if (actor.role === "admin") compareAndSwapFilter.assignedAdminId = actor.id;
        const requeued = await DesignPlanReviewRoundModel.updateOne(
          compareAndSwapFilter,
          {
            $set: {
              deliveryStatus: "queued",
              deliveredAt: null,
              deliveryFailureCode: null
            },
            $inc: { version: 1 }
          },
          { session }
        );
        if (requeued.matchedCount !== 1) {
          throw new ApiError(
            409,
            "DESIGN_PLAN_EMAIL_NOT_RETRYABLE",
            "This Design plan email can no longer be retried."
          );
        }
        await input.audit.appendInMongoTransaction({
          actorId: actor.id,
          action: "design_plan_email_retry_requested",
          entityType: "design_plan_review_round",
          entityId: roundId,
          occurredAt: requestedAt.toISOString(),
          oldValues: {
            deliveryStatus: String(round.deliveryStatus),
            ...(round.deliveryFailureCode
              ? { deliveryFailureCode: String(round.deliveryFailureCode) }
              : {})
          },
          newValues: { deliveryStatus: "queued" }
        }, session);
      });

      await service.deliverDesignReview(roundId, actor.id);

      const refreshedFilter: Row = { _id: roundId };
      if (actor.role === "admin") refreshedFilter.assignedAdminId = actor.id;
      const refreshed = await DesignPlanReviewRoundModel.findOne(refreshedFilter).lean();
      if (!refreshed) notFound();
      return reviewTaskDto(refreshed);
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
            audit: input.audit,
            finance: input.finance
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

    async listAssignableWorkers(actor) {
      if (actor.role !== "super_admin") forbidden();
      const workers = await UserModel.find({
        role: { $in: WORKER_ROLES },
        active: true
      })
        .select({ _id: 1, name: 1, email: 1, role: 1 })
        .sort({ role: 1, name: 1, _id: 1 })
        .lean();
      return workers.map((worker) => ({
        id: String(worker._id),
        name: String(worker.name),
        email: String(worker.email),
        role: String(worker.role) as WorkerRole
      }));
    },

    async listProjectWorkflowTasks(actor, projectId) {
      if (actor.role !== "super_admin") forbidden();
      const project = await ProjectModel.findById(projectId)
        .select({ _id: 1, name: 1 })
        .lean();
      if (!project) notFound();
      const tasks = await ProjectWorkflowTaskModel.find({ projectId })
        .sort({ kind: 1, assigneeRole: 1, status: 1, openedAt: -1, _id: 1 })
        .lean();
      return hydrateOperationalTaskDtos(tasks, new Map([
        [String(project._id), String(project.name)]
      ]));
    },

    async overrideWorkerAssignment(assignmentInput) {
      const {
        actor,
        projectId,
        taskId,
        expectedVersion,
        workerId
      } = assignmentInput;
      if (actor.role !== "super_admin") forbidden();
      const occurredAt = now();
      return withMongoTransaction(async (session) => {
        const project = await ProjectModel.findById(projectId)
          .select({ _id: 1, name: 1 })
          .session(session)
          .lean();
        if (!project) notFound();
        const task = await ProjectWorkflowTaskModel.findOne({
          _id: taskId,
          projectId,
          kind: "trade_execution"
        }).session(session).lean();
        if (!task) notFound();

        const currentVersion = Number(task.version ?? 1);
        if (currentVersion !== expectedVersion) workflowTaskStale();
        if (task.status === "completed") {
          throw new ApiError(
            409,
            "WORKFLOW_TASK_COMPLETED",
            "A completed worker task cannot be reassigned."
          );
        }

        const worker = workerId === null
          ? null
          : await UserModel.findOne({
              _id: workerId,
              role: task.assigneeRole,
              active: true
            })
              .select({ _id: 1, name: 1, email: 1, role: 1, active: 1 })
              .session(session)
              .lean();
        if (workerId !== null && !worker) {
          throw new ApiError(
            400,
            "WORKER_NOT_ASSIGNABLE",
            "Choose an active worker for this task's trade."
          );
        }

        const currentWorkerId = task.assigneeUserId == null
          ? null
          : String(task.assigneeUserId);
        if (currentWorkerId === workerId) {
          const currentWorker = currentWorkerId === null
            ? null
            : await UserModel.findById(currentWorkerId)
                .select({ _id: 1, name: 1, email: 1, role: 1, active: 1 })
                .session(session)
                .lean();
          return operationalTaskDto(task, String(project.name), currentWorker);
        }

        const updated = await ProjectWorkflowTaskModel.findOneAndUpdate(
          {
            _id: taskId,
            projectId,
            kind: "trade_execution",
            status: { $ne: "completed" },
            version: task.version == null ? { $in: [null, 1] } : currentVersion
          },
          task.version == null
            ? {
                $set: {
                  assigneeUserId: workerId,
                  updatedAt: occurredAt,
                  version: 2
                }
              }
            : {
                $set: { assigneeUserId: workerId, updatedAt: occurredAt },
                $inc: { version: 1 }
              },
          { new: true, runValidators: true, session }
        ).lean();
        if (!updated) workflowTaskStale();

        await input.audit.appendInMongoTransaction({
          actorId: actor.id,
          action: "project_workflow_task_assignee_changed",
          entityType: "project_workflow_task",
          entityId: taskId,
          occurredAt: occurredAt.toISOString(),
          oldValues: {
            assigneeUserId: currentWorkerId,
            version: currentVersion
          },
          newValues: {
            assigneeUserId: workerId,
            version: currentVersion + 1
          }
        }, session);
        return operationalTaskDto(updated, String(project.name), worker);
      });
    },

    async listOperationalTasks(actor) {
      if (!isOperationalTaskRole(actor.role)) forbidden();
      const filter: Row = actor.role === "site_manager"
        ? {
            $or: [
              { assigneeRole: "site_manager" },
              { kind: "trade_execution" }
            ]
          }
        : isWorkerRole(actor.role)
          ? { assigneeRole: actor.role, assigneeUserId: actor.id }
          : { assigneeRole: actor.role };
      const tasks = await ProjectWorkflowTaskModel.find(filter)
        .sort({ projectId: 1, kind: 1, status: 1, openedAt: -1, _id: 1 })
        .lean();
      const projects = await ProjectModel.find({
        _id: { $in: tasks.map((task) => task.projectId) }
      }).select({ _id: 1, name: 1 }).lean();
      const projectNames = new Map(
        projects.map((project) => [String(project._id), String(project.name)])
      );
      return hydrateOperationalTaskDtos(tasks, projectNames);
    },

    async updateOperationalTask(actor, taskId, expectedVersion, progress) {
      if (!isOperationalTaskRole(actor.role)) forbidden();
      const occurredAt = now();
      return withMongoTransaction(async (session) => {
        const ownershipFilter = isWorkerRole(actor.role)
          ? { assigneeUserId: actor.id }
          : {};
        const task = await ProjectWorkflowTaskModel.findOne({
          _id: taskId,
          assigneeRole: actor.role,
          ...ownershipFilter,
          kind: { $in: DOWNSTREAM_EXECUTION_TASK_KINDS }
        }).session(session).lean();
        if (!task) notFound();

        const currentVersion = Number(task.version ?? 1);
        if (currentVersion !== expectedVersion) {
          throw new ApiError(
            409,
            "WORKFLOW_TASK_STALE",
            "This task changed before your progress update was saved."
          );
        }
        if (task.status === "completed") {
          throw new ApiError(
            409,
            "WORKFLOW_TASK_COMPLETED",
            "A completed execution task cannot be reopened."
          );
        }

        let project = await ProjectModel.findById(task.projectId)
          .select({
            _id: 1,
            name: 1,
            status: 1,
            actualEndAt: 1,
            updatedAt: 1
          })
          .session(session)
          .lean();
        if (!project) notFound();

        const projectStatusBefore = String(project.status);
        const projectActualEndAtBefore = nullableDateIso(project.actualEndAt);
        let completionFenceAt: Date | null = null;
        if (progress === 100 && project.status !== "completed") {
          completionFenceAt = nextProjectCompletionFence(
            project.updatedAt,
            occurredAt
          );
          const lockedProject = await ProjectModel.findOneAndUpdate(
            {
              _id: task.projectId,
              status: { $ne: "completed" },
              updatedAt: new Date(project.updatedAt)
            },
            { $set: { updatedAt: completionFenceAt } },
            {
              returnDocument: "after",
              session,
              timestamps: false
            }
          ).lean();
          if (!lockedProject) projectCompletionStale();
          project = lockedProject;
        }

        const status = progress === 100
          ? "completed"
          : progress > 0
            ? "in_progress"
            : "open";
        const taskUpdate = task.version == null
          ? {
              $set: {
                progress,
                status,
                completedAt: progress === 100 ? occurredAt : null,
                updatedAt: occurredAt,
                version: 2
              }
            }
          : {
              $set: {
                progress,
                status,
                completedAt: progress === 100 ? occurredAt : null,
                updatedAt: occurredAt
              },
              $inc: { version: 1 }
            };
        const updated = await ProjectWorkflowTaskModel.findOneAndUpdate(
          {
            _id: taskId,
            assigneeRole: actor.role,
            ...ownershipFilter,
            status: { $ne: "completed" },
            version: task.version == null ? { $in: [null, 1] } : currentVersion
          },
          taskUpdate,
          { new: true, runValidators: true, session }
        ).lean();
        if (!updated) {
          throw new ApiError(
            409,
            "WORKFLOW_TASK_STALE",
            "This task changed before your progress update was saved."
          );
        }

        let projectCompleted = false;
        if (
          progress === 100 &&
          project.status !== "completed" &&
          completionFenceAt
        ) {
          const remainingExecutionTask = await ProjectWorkflowTaskModel.exists({
            projectId: task.projectId,
            kind: { $in: DOWNSTREAM_EXECUTION_TASK_KINDS },
            status: { $ne: "completed" }
          }).session(session);
          if (!remainingExecutionTask) {
            const completedProject = await ProjectModel.findOneAndUpdate(
              {
                _id: task.projectId,
                status: { $ne: "completed" },
                updatedAt: completionFenceAt
              },
              {
                $set: {
                  status: "completed",
                  actualEndAt: occurredAt,
                  updatedAt: completionFenceAt
                }
              },
              {
                returnDocument: "after",
                session,
                timestamps: false
              }
            ).lean();
            if (!completedProject) projectCompletionStale();
            project = completedProject;
            projectCompleted = true;
          }
        }

        await input.audit.appendInMongoTransaction({
          actorId: actor.id,
          action: "project_workflow_task_progress_changed",
          entityType: "project_workflow_task",
          entityId: taskId,
          occurredAt: occurredAt.toISOString(),
          oldValues: {
            progress: Number(task.progress ?? 0),
            status: String(task.status),
            ...(projectCompleted
              ? {
                  projectStatus: projectStatusBefore,
                  projectActualEndAt: projectActualEndAtBefore
                }
              : {})
          },
          newValues: {
            progress,
            status,
            ...(projectCompleted
              ? {
                  projectStatus: "completed",
                  projectActualEndAt: occurredAt.toISOString()
                }
              : {})
          }
        }, session);
        const assignee = updated.assigneeUserId == null
          ? null
          : await UserModel.findById(updated.assigneeUserId)
              .select({ _id: 1, name: 1, email: 1, role: 1, active: 1 })
              .session(session)
              .lean();
        return operationalTaskDto(updated, String(project.name), assignee);
      });
    }
  };

  return service;
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
      role: { $in: ["admin", "super_admin"] },
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
    {
      $set: {
        status: "open",
        progress: 0,
        completedAt: null,
        openedAt: occurredAt
      },
      $inc: { version: 1 }
    },
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
  finance?: {
    open(
      input: OpenFinanceBucketInput,
      session: mongoose.ClientSession
    ): Promise<unknown>;
  };
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
  if (input.finance) {
    await input.finance.open({
      projectId: String(input.estimate.projectId),
      designPlanVersion: Number(input.round.designPlanVersion),
      openedById: input.actorId,
      occurredAt: input.occurredAt,
      fallbackBaseline: {
        estimateId: String(input.estimate._id),
        estimateVersion: Number(input.estimate.version),
        estimateReviewRoundId: null,
        approvedSubtotalRupees: Number(input.estimate.subtotal),
        approvedGstRupees: Number(input.estimate.gst),
        approvedContractTotalRupees: Number(input.estimate.total)
      }
    }, input.session);
  }
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
    const { dueInDays: _dueInDays, plannedEffort, ...fields } = blueprint;
    await ProjectWorkflowTaskModel.updateOne(
      { dedupeKey: blueprint.dedupeKey },
      {
        $setOnInsert: {
          _id: `workflow-task-${randomUUID()}`,
          ...fields,
          projectId: String(estimate.projectId),
          estimateId: String(estimate._id),
          designPlanVersion,
          assigneeUserId: null,
          status: "open",
          progress: 0,
          version: 1,
          openedAt,
          dueAt: workflowTaskDueAt(blueprint.kind, openedAt),
          plannedEffort,
          completedAt: null
        }
      },
      { upsert: true, session, runValidators: true }
    );
  }
}

function operationalTaskDto(
  task: Row,
  projectName: string,
  assignee?: Row | null
): ProjectWorkflowTaskDto {
  const assigneeId = task.kind !== "trade_execution" ||
      !isWorkerRole(task.assigneeRole) ||
      task.assigneeUserId == null
    ? null
    : String(task.assigneeUserId);
  return {
    id: String(task._id),
    projectId: String(task.projectId),
    projectName,
    estimateId: String(task.estimateId),
    kind: String(task.kind),
    title: String(task.title),
    description: String(task.description ?? ""),
    assigneeRole: String(task.assigneeRole),
    assignedWorker: assigneeId === null
      ? null
      : {
          id: assigneeId,
          name: assignee ? String(assignee.name) : "Unavailable worker",
          email: assignee ? String(assignee.email) : "",
          role: String(assignee?.role ?? task.assigneeRole) as WorkerRole,
          active: assignee ? Boolean(assignee.active) : false
        },
    sourceSectionId: task.sourceSectionId == null
      ? null
      : String(task.sourceSectionId),
    roomName: task.roomName == null ? null : String(task.roomName),
    status: String(task.status),
    progress: Number(task.progress ?? 0),
    version: Number(task.version ?? 1),
    openedAt: new Date(task.openedAt).toISOString(),
    updatedAt: new Date(task.updatedAt ?? task.openedAt).toISOString()
  };
}

async function hydrateOperationalTaskDtos(
  tasks: Row[],
  projectNames: ReadonlyMap<string, string>
): Promise<ProjectWorkflowTaskDto[]> {
  const assigneeIds = [...new Set(
    tasks.flatMap((task) => task.kind !== "trade_execution" ||
      !isWorkerRole(task.assigneeRole) ||
      task.assigneeUserId == null
      ? []
      : [String(task.assigneeUserId)])
  )];
  const assignees = assigneeIds.length === 0
    ? []
    : await UserModel.find({ _id: { $in: assigneeIds } })
        .select({ _id: 1, name: 1, email: 1, role: 1, active: 1 })
        .lean();
  const assigneeById = new Map(
    assignees.map((assignee) => [String(assignee._id), assignee])
  );
  return tasks.map((task) => operationalTaskDto(
    task,
    projectNames.get(String(task.projectId)) ?? "Project",
    task.assigneeUserId == null
      ? null
      : assigneeById.get(String(task.assigneeUserId))
  ));
}

function workflowTaskStale(): never {
  throw new ApiError(
    409,
    "WORKFLOW_TASK_STALE",
    "This task changed before your update was saved."
  );
}

function projectCompletionStale(): never {
  throw new ApiError(
    409,
    "WORKFLOW_PROJECT_STALE",
    "The project changed before its completion state could be saved."
  );
}

function nextProjectCompletionFence(value: unknown, occurredAt: Date): Date {
  const current = new Date(value as string | number | Date);
  if (Number.isNaN(current.getTime())) {
    throw new ApiError(
      409,
      "WORKFLOW_PROJECT_STATE_INVALID",
      "The project completion state is invalid."
    );
  }
  return new Date(Math.max(occurredAt.getTime(), current.getTime() + 1));
}

function nullableDateIso(value: unknown): string | null {
  if (value == null) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isOperationalTaskRole(role: PublicUser["role"]): boolean {
  return role === "procurement" ||
    role === "finance_head" ||
    role === "site_manager" ||
    isWorkerRole(role);
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

function legacyZeroVersionFilter(version: number) {
  return version === 0 ? { $in: [null, 0] } : version;
}

function boundedFailureCode(value: string) {
  return /^[A-Z0-9_]{1,64}$/u.test(value) ? value : "DESIGN_PLAN_MAILER_FAILED";
}

function designPlanAttachmentConflict() {
  return new ApiError(
    409,
    "DESIGN_PLAN_ATTACHMENT_CONFLICT",
    "The submitted Design plan attachment no longer matches its review snapshot."
  );
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
