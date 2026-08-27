import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import type {
  EstimateClientDecision,
  EstimateClientReviewSummary,
  StoredEstimateClientResponseProof
} from "../domain/estimate-client-review.js";
import { ESTIMATE_CLIENT_DECISION_NOTE_MAX } from "../domain/estimate-client-review.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientResponseProofModel } from "../models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { EstimateClientReviewService } from "./estimate-client-review.service.js";
import type { EstimateDesignService } from "./estimate-design.service.js";
import type { EnsurePendingFinanceBucketInput } from "./project-finance.service.js";
import { resolveApprovalProject } from "./estimate-project-handoff.js";

export type EstimateDecisionRoundTarget =
  | { id: string; expectedVersion: number }
  | null;

export type EstimateDecisionContext =
  | { source: "client_portal"; actor: PublicUser; proof: null }
  | {
      source: "admin_proof";
      actor: PublicUser;
      proof: StoredEstimateClientResponseProof;
    };

export interface EstimateDecisionResult {
  estimate: Record<string, unknown>;
  clientReview: EstimateClientReviewSummary | null;
}

export class EstimateDecisionProofRetentionError extends ApiError {
  constructor() {
    super(
      500,
      "ESTIMATE_DECISION_RECOVERY_FAILED",
      "Estimate decision state could not be confirmed safely."
    );
    this.name = "EstimateDecisionProofRetentionError";
  }
}

export function isEstimateDecisionProofRetentionError(
  error: unknown
): error is EstimateDecisionProofRetentionError {
  return error instanceof EstimateDecisionProofRetentionError;
}

export interface EstimateDecisionService {
  decide(input: {
    estimateId: string;
    round: EstimateDecisionRoundTarget;
    decision: EstimateClientDecision;
    note: string;
    context: EstimateDecisionContext;
  }): Promise<EstimateDecisionResult>;
}

interface CompletedAdminDecision {
  result: EstimateDecisionResult;
  roundIdentity: Record<string, unknown>;
  proofIdentity: Record<string, unknown>;
}

export function createEstimateDecisionService(input: {
  audit: AuditService;
  estimateDesigns: Pick<EstimateDesignService, "approvalReadinessForDecision">;
  reviews: Pick<EstimateClientReviewService, "requireDecisionScope">;
  finance?: {
    ensurePending(
      input: EnsurePendingFinanceBucketInput,
      session: mongoose.ClientSession
    ): Promise<unknown>;
  };
  now?: () => Date;
}): EstimateDecisionService {
  const now = input.now ?? (() => new Date());

  return {
    async decide(decisionInput) {
      validateDecisionInput(decisionInput);
      const recoveryState: { completed: CompletedAdminDecision | null } = {
        completed: null
      };
      try {
        return await withMongoTransaction(async (session) => {
          recoveryState.completed = null;
          const { estimateId, round, decision, context } = decisionInput;
          const note = decisionInput.note.trim();

        if (context.source === "admin_proof") {
          await input.reviews.requireDecisionScope(context.actor, round!.id, session);
        }

        const estimate = asRecord(await EstimateModel.findOne({ _id: estimateId })
          .session(session)
          .lean());
        if (!estimate) {
          if (context.source === "client_portal") estimateNotFound();
          estimateNotReviewable();
        }
        const lead = asRecord(await LeadModel.findById(estimate.leadId)
          .session(session)
          .lean());
        if (!lead) {
          if (context.source === "client_portal") estimateNotFound();
          estimateNotReviewable();
        }
        if (
          context.source === "client_portal" &&
          normalizeEmail(String(lead.clientEmail)) !==
            normalizeEmail(context.actor.email)
        ) {
          estimateNotFound();
        }
        if (estimate.status !== "sent_to_client" || estimate.designFrozenAt != null) {
          estimateNotReviewable();
        }

        const reviewRound = round
          ? asRecord(await EstimateClientReviewRoundModel.findOne({
              _id: round.id,
              estimateId,
              estimateVersion: Number(estimate.version),
              status: "pending",
              version: round.expectedVersion
            }).session(session).lean())
          : null;
        if (round && !reviewRound) estimateNotReviewable();
        if (!round) {
          const existingRound = await EstimateClientReviewRoundModel.findOne({ estimateId })
            .sort({ sendGeneration: -1, _id: 1 })
            .session(session)
            .lean();
          if (existingRound) estimateNotReviewable();
        }

        const occurredAt = now();
        const estimateResult = decision === "request_changes"
          ? await requestChanges({
              estimate,
              note,
              actor: context.actor,
              occurredAt,
              session,
              audit: input.audit
            })
          : await approve({
              estimate,
              lead,
              context,
              note,
              occurredAt,
              session,
              audit: input.audit,
              finance: input.finance,
              reviewRound,
              assignedAdminId: reviewRound?.assignedAdminId == null
                ? context.source === "admin_proof" && context.actor.role === "admin"
                  ? context.actor.id
                  : null
                : String(reviewRound.assignedAdminId)
            });

        let clientReview: EstimateClientReviewSummary | null = null;
        if (round && reviewRound) {
          const terminalStatus = decision === "approve"
            ? "approved"
            : "changes_requested";
          const roundUpdated = await EstimateClientReviewRoundModel.updateOne(
            {
              _id: round.id,
              estimateId,
              estimateVersion: Number(estimate.version),
              status: "pending",
              version: round.expectedVersion
            },
            {
              $set: {
                status: terminalStatus,
                decision,
                decisionSource: context.source,
                decisionNote: note,
                decidedById: context.actor.id,
                decidedAt: occurredAt
              },
              $inc: { version: 1 }
            },
            { session, runValidators: true }
          );
          requireMatched(roundUpdated);
          clientReview = summary({
            ...reviewRound,
            status: terminalStatus,
            version: Number(reviewRound.version) + 1
          });
        }

        let proofId: string | null = null;
        if (context.source === "admin_proof") {
          proofId = `estimate-client-proof-${randomUUID()}`;
          await EstimateClientResponseProofModel.create([{
            _id: proofId,
            reviewRoundId: round!.id,
            estimateId,
            storageReference: context.proof.storageReference,
            originalFilename: context.proof.originalFilename,
            mimeType: context.proof.mimeType,
            byteSize: context.proof.byteSize,
            sha256: context.proof.sha256,
            uploadedById: context.actor.id,
            uploadedAt: occurredAt
          }], { session });
          await appendSourceAudit({
            audit: input.audit,
            actor: context.actor,
            estimateId,
            roundId: round!.id,
            decision,
            estimateStatus: String(estimateResult.status),
            noteLength: note.length,
            occurredAt,
            session,
            source: "admin_proof"
          });
          await input.audit.appendInMongoTransaction({
            actorId: context.actor.id,
            action: "estimate_client_proof_stored",
            entityType: "estimate_client_response_proof",
            entityId: proofId,
            occurredAt: occurredAt.toISOString(),
            oldValues: {},
            newValues: {
              reviewRoundId: round!.id,
              estimateId,
              mimeType: context.proof.mimeType,
              byteSize: context.proof.byteSize,
              sha256: context.proof.sha256
            }
          }, session);
        } else {
          await appendSourceAudit({
            audit: input.audit,
            actor: context.actor,
            estimateId,
            roundId: round?.id ?? null,
            decision,
            estimateStatus: String(estimateResult.status),
            noteLength: note.length,
            occurredAt,
            session,
            source: "client_portal"
          });
        }

        const result = {
          estimate: mapEstimate(estimateResult),
          clientReview
        };
        if (context.source === "admin_proof") {
          recoveryState.completed = {
            result,
            roundIdentity: {
              _id: round!.id,
              estimateId,
              leadId: String(reviewRound!.leadId),
              estimateVersion: Number(estimate.version),
              sendGeneration: Number(reviewRound!.sendGeneration),
              status: decision === "approve" ? "approved" : "changes_requested",
              decision,
              decisionSource: "admin_proof",
              decisionNote: note,
              decidedById: context.actor.id,
              decidedAt: occurredAt,
              version: round!.expectedVersion + 1
            },
            proofIdentity: {
              _id: proofId!,
              reviewRoundId: round!.id,
              estimateId,
              storageReference: context.proof.storageReference,
              originalFilename: context.proof.originalFilename,
              mimeType: context.proof.mimeType,
              byteSize: context.proof.byteSize,
              sha256: context.proof.sha256,
              uploadedById: context.actor.id,
              uploadedAt: occurredAt
            }
          };
        }
        return result;
        });
      } catch (error) {
        const completed = recoveryState.completed;
        if (completed) {
          let recovery: Awaited<ReturnType<typeof probeCompletedAdminDecision>>;
          try {
            recovery = await probeCompletedAdminDecision(completed);
          } catch {
            throw new EstimateDecisionProofRetentionError();
          }
          if (recovery === "committed") {
            return completed.result;
          }
          if (recovery === "not_committed") estimateNotReviewable();
          throw new EstimateDecisionProofRetentionError();
        }
        throw error;
      }
    }
  };
}

type Row = Record<string, any>;

function validateDecisionInput(
  input: Parameters<EstimateDecisionService["decide"]>[0]
): void {
  if (
    input.context.source === "client_portal" &&
    (input.context.actor.role !== "client" || input.context.proof !== null)
  ) {
    estimateNotFound();
  }
  if (input.context.source === "admin_proof") {
    if (!input.round) estimateNotReviewable();
    if (!input.context.proof) {
      throw new ApiError(
        400,
        "ESTIMATE_CLIENT_PROOF_REQUIRED",
        "Upload proof of the Client's decision."
      );
    }
    if (!(["admin", "super_admin"] as string[]).includes(input.context.actor.role)) {
      estimateNotReviewable();
    }
    if (
      input.decision === "request_changes" &&
      input.note.trim().length === 0
    ) {
      throw new ApiError(
        400,
        "ESTIMATE_CLIENT_NOTE_REQUIRED",
        "Explain the Client's requested changes."
      );
    }
  }
  if (input.note.trim().length > ESTIMATE_CLIENT_DECISION_NOTE_MAX) {
    throw new ApiError(
      400,
      "ESTIMATE_CLIENT_NOTE_TOO_LONG",
      "The decision note is too long."
    );
  }
}

async function requestChanges(input: {
  estimate: Row;
  note: string;
  actor: PublicUser;
  occurredAt: Date;
  session: mongoose.ClientSession;
  audit: AuditService;
}): Promise<Row> {
  const { estimate, note, actor, occurredAt, session, audit } = input;
  const review = {
    actorId: actor.id,
    action: "client_changes_requested",
    note,
    occurredAt
  };
  const updated = await EstimateModel.updateOne(
    estimateCasFilter(estimate),
    {
      $set: {
        status: "client_changes_requested",
        clientDecisionAt: occurredAt
      },
      $inc: { version: 1, designLifecycleVersion: 1 },
      $push: { reviews: review }
    },
    { session }
  );
  requireMatched(updated);
  await audit.appendInMongoTransaction({
    actorId: actor.id,
    action: "estimate_design_final_changes_requested",
    entityType: "estimate",
    entityId: String(estimate._id),
    occurredAt: occurredAt.toISOString(),
    oldValues: { status: "sent_to_client" },
    newValues: {
      status: "client_changes_requested",
      noteLength: note.length
    }
  }, session);
  return {
    ...estimate,
    status: "client_changes_requested",
    version: Number(estimate.version) + 1,
    designLifecycleVersion: Number(estimate.designLifecycleVersion ?? 0) + 1,
    clientDecisionAt: occurredAt,
    reviews: [...(estimate.reviews ?? []), review]
  };
}

async function approve(input: {
  estimate: Row;
  lead: Row;
  context: EstimateDecisionContext;
  note: string;
  occurredAt: Date;
  session: mongoose.ClientSession;
  audit: AuditService;
  finance?: {
    ensurePending(
      input: EnsurePendingFinanceBucketInput,
      session: mongoose.ClientSession
    ): Promise<unknown>;
  };
  reviewRound: Row | null;
  assignedAdminId: string | null;
}): Promise<Row> {
  const {
    estimate,
    lead,
    context,
    note,
    occurredAt,
    session,
    audit,
    finance,
    reviewRound,
    assignedAdminId
  } = input;
  const clientId = context.source === "client_portal"
    ? context.actor.id
    : (await UserModel.findOne({
        emailNormalized: normalizeEmail(String(lead.clientEmail)),
        role: "client",
        active: true,
        accountKind: "standard"
      }).session(session).lean())?._id ?? null;
  const projectId = await resolveApprovalProject({
    estimate: {
      projectId: estimate.projectId == null ? null : String(estimate.projectId),
      ownerId: String(estimate.ownerId)
    },
    lead: {
      projectId: lead.projectId == null ? null : String(lead.projectId),
      ownerId: String(lead.ownerId),
      projectName: String(lead.projectName),
      clientName: String(lead.clientName),
      clientEmail: String(lead.clientEmail),
      clientMobile: String(lead.clientMobile),
      location: String(lead.location)
    },
    clientId: clientId == null ? null : String(clientId),
    occurredAt,
    session
  });
  if (assignedAdminId) {
    const admin = await UserModel.findOne({
      _id: assignedAdminId,
      role: "admin",
      active: true
    }).session(session).lean();
    if (admin) {
      const existingGrant = await ProjectAccessGrantModel.findOne({
        projectId,
        userId: assignedAdminId,
        module: "projects",
        active: true
      }).session(session).lean();
      if (!existingGrant) {
        await ProjectAccessGrantModel.create([{
          _id: `grant-${randomUUID()}`,
          projectId,
          userId: assignedAdminId,
          module: "projects",
          source: "admin_initiator",
          accessRequestId: null,
          grantedById: assignedAdminId,
          active: true,
          grantedAt: occurredAt,
          revokedAt: null,
          revokedById: null,
          revocationReason: null
        }], { session });
      }
    }
  }
  const review = {
    actorId: context.actor.id,
    action: "client_approved",
    note,
    occurredAt
  };
  const updated = await EstimateModel.updateOne(
    estimateCasFilter(estimate),
    {
      $set: {
        status: "client_approved",
        projectId,
        clientDecisionAt: occurredAt,
        designFrozenAt: null,
        designPlanStatus: "pending_assignment",
        designPlanVersion: 0,
        designPlanDesignerId: null,
        designPlanAssignedById: null,
        designPlanAssignedAt: null,
        designPlanSubmittedAt: null,
        designPlanApprovedAt: null,
        designPlanApprovedById: null,
        designPlanApprovalSource: null
      },
      $inc: { version: 1, designLifecycleVersion: 1 },
      $push: {
        reviews: review
      }
    },
    { session }
  );
  requireMatched(updated);
  if (finance) {
    const snapshot = reviewRound?.estimateSnapshot ?? estimate;
    await finance.ensurePending({
      projectId,
      estimateId: String(estimate._id),
      estimateVersion: reviewRound == null
        ? Number(estimate.version)
        : Number(reviewRound.estimateVersion),
      estimateReviewRoundId: reviewRound == null
        ? null
        : String(reviewRound._id),
      approvedSubtotalRupees: Number(snapshot.subtotal),
      approvedGstRupees: Number(snapshot.gst),
      approvedContractTotalRupees: Number(snapshot.total),
      createdById: context.actor.id,
      occurredAt
    }, session);
  }
  const leadUpdated = await LeadModel.updateOne(
    {
      _id: lead._id,
      clientEmail: lead.clientEmail,
      projectId: { $in: [null, projectId] }
    },
    {
      $set: {
        projectId,
        stage: "won",
        nextAction: "Assign Designer for design plan",
        nextActionAt: occurredAt
      }
    },
    { session }
  );
  if (leadUpdated.matchedCount !== 1) estimateNotFound();
  await audit.appendInMongoTransaction({
    actorId: context.actor.id,
    action: "estimate_design_final_approved",
    entityType: "estimate",
    entityId: String(estimate._id),
    occurredAt: occurredAt.toISOString(),
    oldValues: { status: "sent_to_client" },
    newValues: {
      status: "client_approved",
      projectId,
      designPlanStatus: "pending_assignment"
    }
  }, session);
  return {
    ...estimate,
    status: "client_approved",
    version: Number(estimate.version) + 1,
    designLifecycleVersion: Number(estimate.designLifecycleVersion ?? 0) + 1,
    designFrozenAt: null,
    designPlanStatus: "pending_assignment",
    designPlanVersion: 0,
    designPlanDesignerId: null,
    designPlanAssignedById: null,
    designPlanAssignedAt: null,
    designPlanSubmittedAt: null,
    designPlanApprovedAt: null,
    designPlanApprovedById: null,
    designPlanApprovalSource: null,
    projectId,
    clientDecisionAt: occurredAt,
    reviews: [...(estimate.reviews ?? []), review]
  };
}

async function appendSourceAudit(input: {
  audit: AuditService;
  actor: PublicUser;
  estimateId: string;
  roundId: string | null;
  decision: EstimateClientDecision;
  estimateStatus: string;
  noteLength: number;
  occurredAt: Date;
  session: mongoose.ClientSession;
  source: "client_portal" | "admin_proof";
}): Promise<void> {
  const action = input.source === "client_portal"
    ? "estimate_client_response_recorded_through_portal"
    : input.decision === "approve"
      ? "estimate_client_approval_recorded_by_admin"
      : "estimate_client_changes_recorded_by_admin";
  const targetsReviewRound = input.roundId !== null;
  await input.audit.appendInMongoTransaction({
    actorId: input.actor.id,
    action,
    entityType: targetsReviewRound ? "estimate_client_review_round" : "estimate",
    entityId: input.roundId ?? input.estimateId,
    occurredAt: input.occurredAt.toISOString(),
    oldValues: targetsReviewRound ? { status: "pending" } : { status: "sent_to_client" },
    newValues: {
      status: targetsReviewRound
        ? input.decision === "approve"
          ? "approved"
          : "changes_requested"
        : input.estimateStatus,
      ...(targetsReviewRound ? { estimateStatus: input.estimateStatus } : {}),
      decision: input.decision,
      decisionSource: input.source,
      noteLength: input.noteLength,
      ...(input.source === "admin_proof"
        ? { recordedOnBehalfOf: "client" }
        : {})
    }
  }, input.session);
}

function estimateCasFilter(estimate: Row): Row {
  const lifecycleVersion = Number(estimate.designLifecycleVersion ?? 0);
  return {
    _id: estimate._id,
    status: "sent_to_client",
    version: estimate.version,
    designLifecycleVersion: lifecycleVersion === 0
      ? { $in: [0, null] }
      : lifecycleVersion,
    designFrozenAt: { $in: [null] }
  };
}

function summary(round: Row): EstimateClientReviewSummary {
  return {
    id: String(round._id),
    sendGeneration: Number(round.sendGeneration),
    estimateVersion: Number(round.estimateVersion),
    version: Number(round.version),
    deliveryStatus: round.deliveryStatus,
    deliveryAttemptCount: Number(round.deliveryAttemptCount),
    deliveredAt: round.deliveredAt == null
      ? null
      : new Date(round.deliveredAt).toISOString(),
    status: round.status
  };
}

function mapEstimate(value: Row): Record<string, unknown> {
  const { _id, ...estimate } = value;
  return { ...estimate, id: String(_id) };
}

function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" ? value as Row : null;
}

function requireMatched(result: { matchedCount: number }): void {
  if (result.matchedCount !== 1) estimateNotReviewable();
}

function estimateNotFound(): never {
  throw new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found.");
}

function estimateNotReviewable(): never {
  throw new ApiError(
    409,
    "ESTIMATE_NOT_REVIEWABLE",
    "This estimate is no longer awaiting your review."
  );
}

async function probeCompletedAdminDecision(
  completed: CompletedAdminDecision
): Promise<"committed" | "not_committed" | "indeterminate"> {
  const [round, proof] = await Promise.all([
    EstimateClientReviewRoundModel.findOne(completed.roundIdentity).lean(),
    EstimateClientResponseProofModel.findOne(completed.proofIdentity)
      .select("+storageReference")
      .lean()
  ]);
  if (
    hasExactIdentity(round, completed.roundIdentity) &&
    hasExactIdentity(proof, completed.proofIdentity)
  ) {
    return "committed";
  }
  if (proof) return "indeterminate";

  const [terminalRound, currentProof] = await Promise.all([
    EstimateClientReviewRoundModel.findOne({
      _id: completed.roundIdentity._id,
      estimateId: completed.roundIdentity.estimateId,
      status: { $in: ["approved", "changes_requested"] }
    }).lean(),
    EstimateClientResponseProofModel.findOne({
      reviewRoundId: completed.proofIdentity.reviewRoundId,
      estimateId: completed.proofIdentity.estimateId
    })
      .select("+storageReference")
      .lean()
  ]);
  if (!terminalRound) return "indeterminate";

  const roundMatches = hasExactIdentity(
    terminalRound,
    completed.roundIdentity
  );
  const proofMatches = hasExactIdentity(
    currentProof,
    completed.proofIdentity
  );
  if (proofMatches) return roundMatches ? "committed" : "indeterminate";
  return currentProof || !roundMatches ? "not_committed" : "indeterminate";
}

function hasExactIdentity(
  value: unknown,
  identity: Record<string, unknown>
): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return Object.entries(identity).every(([key, expected]) => {
    const actual = record[key];
    if (expected instanceof Date) {
      const actualDate = actual instanceof Date ? actual : new Date(actual);
      return !Number.isNaN(actualDate.getTime()) &&
        actualDate.getTime() === expected.getTime();
    }
    return actual === expected;
  });
}

async function withMongoTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    let completed = false;
    await session.withTransaction(async () => {
      result = await operation(session);
      completed = true;
    });
    if (!completed) throw new Error("Estimate decision transaction did not complete.");
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
