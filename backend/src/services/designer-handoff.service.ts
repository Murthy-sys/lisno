import { createHash } from "node:crypto";
import type { DesignerAssignmentEvidence, DesignerHandoffView, KeyCollectionAppointmentView, KeyCollectionTiming } from "../contracts/designer-assignment.js";
import { keyCollectionAppointmentView, workflowClientKickoffCompleted, type DesignWorkflowState, type KeyCollectionAppointment } from "../domain/design-workflow-state.js";
import { keyCollectionTiming } from "../domain/key-collection-timing.js";
import { RepositoryConflictError, type AppRepository, type ProjectRecord } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import { quotationSnapshotDigest } from "./quotation-digest.js";

type InitialApproval = { estimateId: string; estimateVersion: number; reviewRoundId: string | null; approvedAt: string | null };
export interface DesignerHandoffSource {
  approval: InitialApproval | null;
  designer: { id: string; name: string } | null;
  assignmentRevision: string | null;
  evidence: DesignerAssignmentEvidence;
  executionAvailable: boolean;
  issue: string | null;
}
const SOURCE_ISSUE = "The approved estimate or Designer assignment needs review before key collection can be scheduled.";
const validTime = (value: string | null | undefined) => Boolean(value && Number.isFinite(Date.parse(value)));

/** Uses immutable initial approval evidence, independent of a later quotation awaiting approval. */
export async function readDesignerHandoffSource(repository: AppRepository, project: ProjectRecord, lock = false): Promise<DesignerHandoffSource> {
  const result: DesignerHandoffSource = { approval: null, designer: null, assignmentRevision: null,
    evidence: { pendingRequests: [], acceptedRequest: null }, executionAvailable: false, issue: null };
  try {
    result.evidence = await repository.findDesignerAssignmentEvidence(project.id, lock);
    const evidence = await repository.findProjectStatusEstimateEvidence(project.id);
    if (evidence.projectId !== project.id || evidence.estimates.length > 1) throw new RepositoryConflictError(SOURCE_ISSUE);
    const estimate = evidence.estimates[0];
    if (!estimate) return result;
    if (estimate.projectId && estimate.projectId !== project.id) throw new RepositoryConflictError(SOURCE_ISSUE);
    const collaborative = project.estimationWorkflowVersion === 2 || project.estimationWorkflowVersion === 3;
    const context = collaborative ? await repository.findProjectEstimationContext(project.id) : null;
    if (collaborative && (!context || context.estimateId !== estimate.id)) throw new RepositoryConflictError(SOURCE_ISSUE);
    // Historical approved estimates may predate publication rounds. Reuse the
    // canonical approved-baseline resolver, including its version-one convention.
    const legacy = !collaborative && estimate.status === "client_approved" ? await repository.findDesignWorkflowRoomContext(project.id) : null;
    if (!collaborative && estimate.status === "client_approved" && (!legacy || legacy.estimateId !== estimate.id)) throw new RepositoryConflictError(SOURCE_ISSUE);
    const reference = collaborative ? context!.preApproval : estimate.status === "client_approved" ? {
      estimateVersion: legacy!.estimateVersion,
      reviewRoundId: evidence.rounds.filter(round => round.estimateId === estimate.id && round.estimateVersion === legacy!.estimateVersion && round.status === "approved").at(-1)?.id,
      approvedAt: estimate.clientDecisionAt
    } : null;
    if (!reference) return result;
    const legacyWithoutRound = !collaborative && evidence.rounds.length === 0;
    if (legacyWithoutRound && evidence.financeSource && (evidence.financeSource.estimateId !== estimate.id ||
      evidence.financeSource.estimateVersion !== reference.estimateVersion || evidence.financeSource.reviewRoundId)) throw new RepositoryConflictError(SOURCE_ISSUE);
    const rounds = evidence.rounds.filter(round => round.id === reference.reviewRoundId && round.estimateId === estimate.id &&
      round.leadId === estimate.leadId && (round.projectId === project.id || !collaborative && !round.projectId) &&
      round.estimateVersion === reference.estimateVersion && round.status === "approved" && round.decision === "approve" &&
      validTime(round.decidedAt) && round.decidedAt === reference.approvedAt &&
      (round.decisionSource === "client_portal" && round.decidedById === project.clientId || round.decisionSource === "admin_proof" && round.proofValid));
    if (estimate.status !== "client_approved" || !Number.isSafeInteger(reference.estimateVersion) || reference.estimateVersion < 1 ||
      (collaborative ? reference.estimateVersion >= estimate.version : reference.estimateVersion !== Math.max(1, estimate.version - 1)) ||
      !legacyWithoutRound && (rounds.length !== 1 || !collaborative && evidence.rounds.filter(round => round.status === "approved" && round.estimateVersion === reference.estimateVersion).length !== 1) || collaborative &&
      (project.estimationWorkflowVersion === 3 ? rounds[0]!.phase !== "pre" : rounds[0]!.phase && rounds[0]!.phase !== "pre")) throw new RepositoryConflictError(SOURCE_ISSUE);
    if (project.estimationWorkflowVersion === 3) {
      const round = rounds[0]!;
      const sales = round.salesApproval;
      if (round.workflowVersion !== 3 || !round.estimateSnapshot || !round.sourceDigest ||
        quotationSnapshotDigest(round.estimateSnapshot) !== round.sourceDigest || !sales ||
        sales.actorId !== round.submittedById || sales.estimateVersion !== round.estimateVersion ||
        sales.pricedRevision !== round.pricedRevision || sales.sourceDigest !== round.sourceDigest || !validTime(sales.approvedAt))
        throw new RepositoryConflictError(SOURCE_ISSUE);
    }
    result.approval = { estimateId: estimate.id, estimateVersion: reference.estimateVersion,
      reviewRoundId: legacyWithoutRound ? null : rounds[0]!.id,
      approvedAt: legacyWithoutRound ? validTime(estimate.clientDecisionAt) ? estimate.clientDecisionAt : null : rounds[0]!.decidedAt! };
    result.executionAvailable = project.estimationWorkflowVersion === 3
      ? Boolean(context?.currentQuotationApproved && context.designApproval &&
        context.designApproval.estimateReviewRoundId === context.currentQuotationApproval?.reviewRoundId &&
        context.designApproval.designScopeRevision === context.designScopeRevision)
      : Boolean(context?.finalApproval || !collaborative && (await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion);
    const designerIds = project.primaryDesignerId ? [project.primaryDesignerId] : project.estimationWorkflowVersion === 3 ? [] : [...new Set(project.assignedDesignerIds)];
    if (designerIds.length > 1) throw new RepositoryConflictError(SOURCE_ISSUE);
    const designerId = designerIds[0];
    if (!designerId) return result;
    if (project.primaryDesignerId && !project.assignedDesignerIds.includes(project.primaryDesignerId)) throw new RepositoryConflictError(SOURCE_ISSUE);
    const designer = await repository.findUserById(designerId);
    if (!designer?.active || designer.deletedAt || designer.role !== "designer") throw new RepositoryConflictError(SOURCE_ISSUE);
    if (result.evidence.acceptedRequest && result.evidence.acceptedRequest.designerId !== designer.id) throw new RepositoryConflictError(SOURCE_ISSUE);
    result.designer = { id: designer.id, name: designer.name };
    result.assignmentRevision = createHash("sha256").update(JSON.stringify({ projectId: project.id, clientId: project.clientId,
      teamVersion: project.designTeamVersion ?? 0, designerId, approval: result.approval, acceptedRequest: result.evidence.acceptedRequest })).digest("hex");
    return result;
  } catch (error) {
    if (!(error instanceof RepositoryConflictError)) throw error;
    return { ...result, designer: null, assignmentRevision: null, executionAvailable: false, issue: SOURCE_ISSUE };
  }
}

function appointmentIsRecorded(state: DesignWorkflowState, appointment: KeyCollectionAppointment, project: ProjectRecord): boolean {
  const stageId = project.designWorkflowStages?.find(stage => stage.type === "key_collection")?.id;
  if (state.projectId !== project.id || !stageId || !validTime(appointment.confirmedAt) || !validTime(appointment.deadlineAt) ||
    appointment.confirmedById !== project.clientId || !["within_48_hours", "chosen_datetime"].includes(appointment.mode) ||
    appointment.originalDeadlineAt !== appointment.deadlineAt || Date.parse(appointment.deadlineAt) <= Date.parse(appointment.confirmedAt)) return false;
  const events = state.history.filter(event => event.action === "key_collection_schedule" && event.stageId === stageId);
  const fields: ReadonlyArray<keyof KeyCollectionAppointment> = ["mode", "confirmedById", "confirmedAt", "originalDeadlineAt", "deadlineAt",
    "assignmentRevision", "designerId", "assignmentRequestId", "estimateId", "estimateVersion", "approvalReviewRoundId"];
  return events.length === 1 && events[0]!.actorRole === "client" && !events[0]!.onBehalfOfClient &&
    events[0]!.actorId === appointment.confirmedById && events[0]!.at === appointment.confirmedAt &&
    fields.every(field => events[0]!.data?.[field] === appointment[field]);
}

function appointmentMatchesSource(appointment: KeyCollectionAppointment, source: DesignerHandoffSource): boolean {
  // A valid reassignment inherits the original Client appointment. Its saved
  // assignment identity remains immutable history, while source owns current responsibility.
  return Boolean(source.approval && source.designer && source.assignmentRevision &&
    appointment.estimateId === source.approval.estimateId && appointment.estimateVersion === source.approval.estimateVersion &&
    appointment.approvalReviewRoundId === source.approval.reviewRoundId);
}

export function projectDesignerHandoff(source: DesignerHandoffSource, project: ProjectRecord, state: DesignWorkflowState,
  actor: Pick<PublicUser, "id" | "role">, now: Date): DesignerHandoffView {
  const keys = state.stages.key_collection;
  const blockers: string[] = [];
  if (!state.stages.internal_kickoff?.completedAt) blockers.push("Complete Internal Kick off before collecting keys.");
  if (!workflowClientKickoffCompleted(state)) blockers.push("Complete Client Kick off before collecting keys.");
  if (project.estimationWorkflowVersion === 3 && !state.quotationLocked) blockers.push("Approve the current Designer-revised quotation before collecting keys.");
  const stageConfigured = project.designWorkflowStages?.some(stage => stage.type === "key_collection") === true;
  if (!stageConfigured) blockers.push("The Key Collection stage is not configured.");
  const finished = Boolean(keys?.completedAt || keys?.receivedAt);
  const issue = source.issue || keys?.appointment && (!appointmentIsRecorded(state, keys.appointment, project) ||
    !finished && (!appointmentMatchesSource(keys.appointment, source) || !keyCollectionTiming(project.id, keys.appointment, now))) ? SOURCE_ISSUE : null;
  const appointment = !issue ? keyCollectionAppointmentView(state, now) : null;
  const handoffState: DesignerHandoffView["state"] = issue ? "source_issue" : !source.approval ? "awaiting_approval" :
    keys?.completedAt ? "completed" : keys?.receivedAt ? "received" : !source.designer ? "awaiting_designer" : appointment ? "scheduled" : "awaiting_client_schedule";
  return { initialEstimateApproved: Boolean(source.approval) && !issue, executionAvailable: source.executionAvailable && !issue,
    state: handoffState, designer: issue ? null : source.designer, assignmentRevision: issue ? null : source.assignmentRevision,
    appointment, canSchedule: !issue && Boolean(source.approval && source.designer && source.assignmentRevision) && !keys?.appointment && !finished &&
      stageConfigured && actor.role === "client" && actor.id === project.clientId && project.status !== "completed",
    blockers: issue ? [issue] : blockers };
}

export interface PendingKeyCollectionAppointment {
  appointment: KeyCollectionAppointmentView & { timing: KeyCollectionTiming };
  designer: { id: string; name: string };
  stageId: string;
  blockers: string[];
}

/** Shared validated obligation for personal reminders and background notifications. */
export async function readPendingKeyCollectionAppointment(repository: AppRepository, project: ProjectRecord, now: Date,
  lock = false): Promise<PendingKeyCollectionAppointment | null> {
  if (project.status === "completed") return null;
  const state = await repository.findDesignWorkflowState(project.id);
  const keys = state?.stages.key_collection;
  if (!state || !keys?.appointment || keys.receivedAt || keys.completedAt) return null;
  const source = await readDesignerHandoffSource(repository, project, lock);
  if (!source.designer) return null;
  const handoff = projectDesignerHandoff(source, project, state, { id: source.designer.id, role: "designer" }, now);
  const appointment = handoff.appointment;
  const stage = project.designWorkflowStages?.find(item => item.type === "key_collection");
  if (handoff.state !== "scheduled" || !appointment?.timing || !stage) return null;
  return { appointment: { ...appointment, timing: appointment.timing }, designer: source.designer,
    stageId: stage.id, blockers: handoff.blockers };
}
