import type { ClientSession } from "mongoose";
import type { AssistantCatalogueCandidate, AssistantFact, AssistantFactBundle, AssistantReadScope, AssistantReadSources, AssistantSourceVersion } from "../contracts/project-chat-assistant.js";
import type { ProjectStatusSummary } from "../contracts/project-status.js";
import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import { VendorExecutionReviewModel } from "../models/VendorExecutionReview.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorWorkReviewModel } from "../models/VendorWorkReview.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { SiteCompletionReviewModel } from "../models/SiteCompletionReview.js";
import type { ChatTransaction, ProjectChatRepository } from "../repositories/project-chat.js";
import { toPublicUser } from "./auth.service.js";
import { presentClientEstimate } from "./estimate-client-presentation.js";
import { financeApprovalLineage } from "./project-finance.service.js";
import { readAssistantContext, scopeWitness, sourceWitness, type AssistantContext } from "./project-assistant-context.js";
import { boundedAssistantIds, readAssistantLines, readAssistantRecommendations, searchAssistantCatalogue, type AssistantLineRead } from "./project-assistant-catalogue.js";
import { calculateAssistantAddition, type AssistantApprovedScope } from "./project-assistant-pricing.js";
import { createProjectStatusService } from "./project-status.service.js";
import type { Clock } from "./workflow.js";

type Row = Record<string, any>;
interface ApprovedRead { scope: AssistantApprovedScope; freshness: AssistantSourceVersion[]; estimateId: string | null; estimateVersion: number | null; roundId: string | null; sourceKeys: string[] }
export interface AssistantSourceReaders {
  status(context: AssistantContext, transaction?: ChatTransaction): Promise<ProjectStatusSummary>;
  execution(context: AssistantContext, transaction?: ChatTransaction): Promise<AssistantFactBundle>;
  approved(context: AssistantContext, transaction?: ChatTransaction): Promise<{ scope: AssistantApprovedScope; freshness: AssistantSourceVersion[] }>;
  lines(ids: string[], session?: ClientSession): Promise<AssistantLineRead>;
  search(input: { query: string; limit: number }, session?: ClientSession): Promise<AssistantCatalogueCandidate[]>;
  recommendations: typeof readAssistantRecommendations;
}
const reference = (projectId: string, label: string) => ({ id: projectId, label, href: null });
const fact = (projectId: string, id: string, label: string, value: string): AssistantFact => ({ id, label, value, source: reference(projectId, label) });
const validDate = (value: unknown): string | null => typeof value === "string" || value instanceof Date
  ? Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null : null;
const short = (value: unknown, fallback = "Unavailable") => typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : fallback;
const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

async function readApproved(context: AssistantContext, tx?: ChatTransaction): Promise<ApprovedRead> {
  const projectId = context.sources.project.id;
  const unavailable: AssistantApprovedScope = { state: "unavailable", totalPaise: null, rooms: [], lines: [] };
  const empty: AssistantApprovedScope = { ...unavailable, state: "none" };
  const finish = (scope: AssistantApprovedScope, source: unknown, extra: Partial<ApprovedRead> = {}): ApprovedRead => ({ scope,
    freshness: [sourceWitness("assistant-approved", projectId, source)], estimateId: null, estimateVersion: null, roundId: null, sourceKeys: [], ...extra });
  if (!tx?.session) return finish(empty, empty);
  const sources = context.sources.estimates.filter(estimate => estimate.projectId === projectId || context.sources.leads.some(lead => lead.id === estimate.leadId && lead.projectId === projectId));
  const approved = sources.filter(estimate => estimate.status === "client_approved");
  if (approved.length > 1 || sources.some(estimate => estimate.projectId && estimate.projectId !== projectId)) return finish(unavailable, sources);
  const selected = approved[0] ?? (sources.length === 1 ? sources[0] : null);
  if (!selected) return finish(sources.length ? unavailable : empty, sources);
  const estimate = await EstimateModel.findById(selected.id).session(tx.session).lean().exec() as Row | null;
  const lead = context.sources.leads.find(lead => lead.id === selected.leadId);
  if (!estimate || !lead || lead.projectId && lead.projectId !== projectId || estimate.projectId && estimate.projectId !== projectId || estimate.leadId !== lead.id) return finish(unavailable, { estimate, lead });
  const rooms = Array.isArray(estimate.rooms) ? estimate.rooms.flatMap((room: Row) => typeof room?.id === "string" && typeof (room.name ?? room.label) === "string" ? [{ id: room.id, name: room.name ?? room.label }] : []) : [];
  if (!approved.length) return finish({ ...empty, rooms }, { estimate, lead });
  const rounds = await EstimateClientReviewRoundModel.find({ estimateId: selected.id, status: "approved", decision: "approve" }).session(tx.session).lean().exec() as Row[];
  const evidence = await tx.app.findProjectStatusEstimateEvidence(projectId);
  const witness = { estimate, lead, rounds, evidence };
  if (rounds.length !== 1) return finish(unavailable, witness);
  const round = rounds[0]!;
  const evidenceRound = evidence.rounds.find(row => row.id === String(round._id));
  if (evidence.projectId !== projectId || !evidenceRound || evidenceRound.estimateId !== selected.id || evidenceRound.leadId !== selected.leadId ||
    evidenceRound.projectId && evidenceRound.projectId !== projectId || evidenceRound?.estimateVersion !== estimate.version - 1 ||
    evidenceRound?.decidedAt !== validDate(estimate.clientDecisionAt) ||
    evidence.rounds.some(row => row.estimateId === selected.id && row.sendGeneration > round.sendGeneration) ||
    evidence.financeSource && (evidence.financeSource.estimateId !== selected.id || evidence.financeSource.estimateVersion !== estimate.version - 1 || evidence.financeSource.reviewRoundId !== String(round._id)) ||
    round.decisionSource === "client_portal" && round.decidedById !== context.user.id ||
    round.decisionSource === "admin_proof" && !evidenceRound.proofValid) return finish(unavailable, witness);
  const presented = presentClientEstimate(toPublicUser(context.user), estimate, { ...lead, _id: lead.id }, round);
  if (!presented?.publishedReview || presented.reviewSourceIssue !== null || presented.projectId !== projectId) return finish(unavailable, witness);
  try {
    const approval = financeApprovalLineage(estimate, rounds);
    if (!approval.immutable || approval.estimateReviewRoundId !== String(round._id)) return finish(unavailable, witness);
    const lines = presented.publishedReview.snapshot.lineItems as Row[];
    const configured = lines.filter(line => line.source === "configuration");
    const allRooms = new Map(rooms.map((room: { id: string; name: string }) => [room.id, room]));
    for (const line of configured) allRooms.set(line.roomId, { id: line.roomId, name: line.roomName });
    return finish({ state: "approved", totalPaise: approval.baseline.approvedContractTotalPaise, rooms: [...allRooms.values()],
      lines: configured.map(line => ({ mainLineId: line.mainLineId, roomId: line.roomId, included: line.included,
        pricingMode: line.pricingMode ?? ((line.classification ?? "standard") === "standard" ? "sub_vendor" : null) })) }, witness,
      { estimateId: selected.id, estimateVersion: approval.estimateVersion, roundId: String(round._id), sourceKeys: lines.flatMap((line, index) => line.included
        ? [approvedEstimateLineItemKey({ id: line.id, index, estimateId: selected.id, estimateVersion: approval.estimateVersion })] : []) });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return finish(unavailable, witness);
  }
}

function sameIds(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) && value.every(id => typeof id === "string") && new Set(value).size === value.length &&
    value.length === new Set(expected).size && [...value].sort().every((id, index) => id === [...new Set(expected)].sort()[index]);
}

/** A current aggregate review supersedes the old per-assignment Client decision path. */
function siteAcceptance(input: { context: AssistantContext; approved: ApprovedRead; state: Row | null; reviews: Row[];
  assignments: Row[]; orders: Row[]; revisions: Row[]; executionStates: Row[]; executionReviews: Row[] }): "none" | "pending" | "accepted" | "changes_requested" | "unavailable" {
  const { context, approved, state, assignments, orders, revisions, executionStates, executionReviews } = input;
  if (!state || state.currentRound === 0) return "none";
  if (context.sources.project.completionAuthority !== "vendor_client" || state.projectId !== context.sources.project.id ||
    !positive(state.version) || !positive(state.currentRound) || input.reviews.length !== 1) return "unavailable";
  const review = input.reviews[0]!;
  if (review.projectId !== context.sources.project.id || review.clientId !== context.user.id || review.round !== state.currentRound ||
    !positive(review.version) || !validDate(review.submittedAt) || review.estimateId !== approved.estimateId ||
    review.estimateVersion !== approved.estimateVersion || review.estimateReviewRoundId !== approved.roundId ||
    !sameIds(review.sourceLineItemKeys, approved.sourceKeys) || !Array.isArray(review.sections) ||
    !sameIds(review.sections.map((section: Row) => section.assignmentId), assignments.map(row => String(row._id)))) return "unavailable";
  const currentOrders = orders.filter(order => !order.cancelledAt && order.status !== "cancelled" && order.approvedRevisionId);
  if (!sameIds(review.approvedRevisionIds, currentOrders.map(row => String(row.approvedRevisionId)))) return "unavailable";
  const accepted = state.status === "client_approved" && state.progress === 100 && review.status === "approved" && review.decision?.decision === "approve";
  const changes = state.status === "changes_requested" && review.status === "changes_requested" && review.decision?.decision === "request_changes";
  const pending = state.status === "pending_client" && review.status === "pending" && !review.decision;
  if (!accepted && !changes && !pending || (accepted || changes) && (review.decision?.actorId !== context.user.id || !validDate(review.decision?.decidedAt))) return "unavailable";
  if ((accepted || pending) && !sameIds(state.verifiedAssignmentIds, assignments.map(row => String(row._id)))) return "unavailable";
  for (const assignment of assignments) {
    const id = String(assignment._id);
    const section = review.sections.find((section: Row) => section.assignmentId === id);
    const order = currentOrders.find(row => String(row._id) === assignment.orderId && row.vendorId === assignment.vendorId && row.approvedRevision === assignment.orderRevision);
    const revision = revisions.find(row => String(row._id) === order?.approvedRevisionId && row.projectId === assignment.projectId && row.vendorId === assignment.vendorId && row.orderId === assignment.orderId && row.revision === assignment.orderRevision);
    if (!section || section.sourceSectionId !== assignment.sourceSectionId || assignment.estimateId !== approved.estimateId ||
      assignment.estimateVersion !== approved.estimateVersion || assignment.estimateReviewRoundId !== approved.roundId ||
      !approved.sourceKeys.includes(assignment.sourceLineItemKey) || !revision?.lines?.some((line: Row) => line.id === assignment.lineId && line.procurementItemId === assignment.procurementItemId && line.sourceLineItemKey === assignment.sourceLineItemKey)) return "unavailable";
    const execution = executionStates.find(row => row.assignmentId === id && row.vendorId === assignment.vendorId);
    if (execution) {
      const verified = executionReviews.find(row => String(row._id) === section.executionVerificationId && row.assignmentId === id && row.vendorId === assignment.vendorId && row.executionRound === section.executionRound && row.submissionVersion === section.executionSubmissionVersion);
      if (!verified || verified.decision?.outcome !== "verified" || !validDate(verified.decision.decidedAt) ||
        !sameIds(section.imageIds, Array.isArray(verified.imageIds) ? verified.imageIds : [])) return "unavailable";
      // A changes-requested decision deliberately starts a fresh execution round.
      if (!changes && (execution.status !== "site_verified" || execution.verificationId !== String(verified._id) || execution.submissionId !== String(verified._id) || execution.executionRound !== section.executionRound)) return "unavailable";
    } else if (section.executionVerificationId != null || !["submitted_for_client", "client_approved"].includes(assignment.status)) return "unavailable";
  }
  return accepted ? "accepted" : changes ? "changes_requested" : "pending";
}

/** Client-facing projection of issued work. Free-form vendor/internal notes and commercial fields are excluded. */
async function readExecution(context: AssistantContext, tx?: ChatTransaction): Promise<AssistantFactBundle> {
  const projectId = context.sources.project.id;
  if (!tx?.session) {
    const facts = [fact(projectId, "execution-unavailable", "Execution", "Execution details are not available.")];
    return { facts, freshness: [sourceWitness("assistant-execution", projectId, facts)] };
  }
  const approved = await readApproved(context, tx);
  const assignments = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } }).sort({ _id: 1 }).limit(201).session(tx.session).lean().exec() as Row[];
  const assignmentIds = assignments.map(row => String(row._id));
  const orders = await ProjectPurchaseOrderModel.find({ projectId, _id: { $in: assignments.map(row => row.orderId) } })
    .select({ _id: 1, projectId: 1, vendorId: 1, approvedRevisionId: 1, approvedRevision: 1, status: 1, cancelledAt: 1 }).session(tx.session).lean().exec() as Row[];
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ projectId, _id: { $in: orders.map(row => row.approvedRevisionId).filter(Boolean) } })
    .select({ _id: 1, projectId: 1, vendorId: 1, orderId: 1, revision: 1, lines: 1 }).session(tx.session).lean().exec() as Row[];
  const states = await VendorExecutionStateModel.find({ projectId, assignmentId: { $in: assignmentIds } }).session(tx.session).lean().exec() as Row[];
  const reviews = await VendorExecutionReviewModel.find({ projectId, assignmentId: { $in: assignmentIds } }).session(tx.session).lean().exec() as Row[];
  const clientReviews = await VendorWorkReviewModel.find({ projectId, assignmentId: { $in: assignmentIds }, clientId: context.user.id }).session(tx.session).lean().exec() as Row[];
  const siteState = await SiteCompletionStateModel.findById(projectId).session(tx.session).lean().exec() as Row | null;
  const siteReviews = siteState && positive(siteState.currentRound) ? await SiteCompletionReviewModel.find({ projectId, round: siteState.currentRound }).limit(2).session(tx.session).lean().exec() as Row[] : [];
  const site = siteAcceptance({ context, approved, state: siteState, reviews: siteReviews, assignments, orders, revisions, executionStates: states, executionReviews: reviews });
  const facts: AssistantFact[] = [];
  if (assignments.length > 200 || assignments.length && approved.scope.state !== "approved") {
    facts.push(fact(projectId, "execution-conflict", "Execution", "Execution sources need review by the project team."));
  } else for (const assignment of assignments) {
    const id = String(assignment._id);
    const order = orders.find(row => String(row._id) === assignment.orderId && row.vendorId === assignment.vendorId);
    const revision = revisions.find(row => String(row._id) === order?.approvedRevisionId && row.orderId === assignment.orderId && row.vendorId === assignment.vendorId && row.revision === assignment.orderRevision);
    if (!order || order.cancelledAt || order.status === "cancelled" || order.approvedRevision !== assignment.orderRevision) continue;
    const issuedLine = revision?.lines?.find((row: Row) => row.id === assignment.lineId && row.procurementItemId === assignment.procurementItemId && row.sourceLineItemKey === assignment.sourceLineItemKey);
    if (!issuedLine || approved.estimateId !== assignment.estimateId || approved.estimateVersion !== assignment.estimateVersion || approved.roundId !== assignment.estimateReviewRoundId || !approved.sourceKeys.includes(assignment.sourceLineItemKey)) {
      facts.push(fact(projectId, `work-${id}`, "Work status", "Work source needs review by the project team.")); continue;
    }
    const state = states.find(row => row.assignmentId === id && row.vendorId === assignment.vendorId);
    const review = reviews.find(row => String(row._id) === state?.submissionId && row.assignmentId === id && row.vendorId === assignment.vendorId && row.executionRound === state?.executionRound);
    const verified = Boolean(state?.status === "site_verified" && state.verificationId === String(review?._id) && review?.decision?.outcome === "verified" && validDate(review.decision.decidedAt));
    const clientReview = clientReviews.find(row => row.assignmentId === id && row.round === assignment.currentRound && row.vendorId === assignment.vendorId);
    const accepted = site === "accepted" || site === "none" && Boolean(assignment.status === "client_approved" && clientReview?.status === "approved" && clientReview.decision?.decision === "approve" && clientReview.decision?.actorId === context.user.id && validDate(clientReview.decision.decidedAt) && (!state || verified));
    const label = `${short(assignment.itemName)} · ${short(assignment.roomName)}`;
    const progress = state?.progress ?? assignment.progress;
    facts.push(fact(projectId, `work-${id}`, label, accepted ? "Client accepted." : site === "changes_requested" ? "Client requested changes; work needs correction and Site Manager verification." : site === "unavailable" ? "Client completion review needs verification by the project team." : verified ? "Site verified; awaiting Client acceptance." : state?.status === "awaiting_verification" ? "Vendor submitted completion; Site Manager verification is pending." : state?.status === "blocked" ? "Vendor reported a blocker; team follow-up is required." : "Work has been issued; completion is not yet verified."));
    if (Number.isSafeInteger(progress) && progress >= 0 && progress <= 100) facts.push(fact(projectId, `reported-${id}`, `${label}: vendor reported progress`, `${progress}% reported; this is not a Client acceptance.`));
    const proposal = state?.proposedSchedule;
    if (proposal && validDate(proposal.startDate) && validDate(proposal.finishDate)) facts.push(fact(projectId, `proposed-${id}`, `${label}: proposed schedule`, `${proposal.startDate} to ${proposal.finishDate}; awaiting confirmation.`));
    const schedule = state?.schedule;
    if (schedule && positive(schedule.revision) && validDate(schedule.confirmedAt) && validDate(schedule.startDate) && validDate(schedule.finishDate)) facts.push(fact(projectId, `confirmed-${id}`, `${label}: confirmed schedule`, `${schedule.startDate} to ${schedule.finishDate}; confirmed work dates, not a project handover commitment.`));
  }
  if (!facts.length) facts.push(fact(projectId, "execution-empty", "Execution", "No current issued work details are available."));
  const boundedFacts = facts.length > 80 ? [...facts.slice(0, 79), fact(projectId, "execution-truncated", "Execution scope", "Additional issued work exists; ask the project team for the complete execution view.")] : facts;
  return { facts: boundedFacts, freshness: [...approved.freshness, sourceWitness("assistant-execution", projectId, { assignments, orders, revisions, states, reviews, clientReviews, siteState, siteReviews })] };
}

function statusFacts(summary: ProjectStatusSummary): AssistantFact[] {
  const projectId = summary.projectId;
  const facts = [fact(projectId, "project-status", "Project status", summary.projectStatus), fact(projectId, "project-stage", "Current stage", summary.currentStage?.label ?? "Current stage unavailable.")];
  if (summary.issue) facts.push(fact(projectId, "project-issue", "Status limitation", summary.issue));
  for (const action of summary.pendingActions.slice(0, 20)) {
    facts.push(fact(projectId, `action-${action.id}`, action.stageLabel, `${action.action} Status: ${action.state}. Responsible: ${action.people.length ? action.people.map(person => `${person.name} (${person.role})`).join(", ") : "Not assigned"}.`));
    if (action.scheduledAt) facts.push(fact(projectId, `scheduled-${action.id}`, `${action.stageLabel}: scheduled`, action.scheduledAt));
    if (action.deadlineAt) facts.push(fact(projectId, `deadline-${action.id}`, `${action.stageLabel}: action deadline`, `${action.deadlineAt}; this is not a final project handover promise.`));
  }
  return facts;
}

export function createAssistantReadSources(options: {
  chatRepository: ProjectChatRepository; scope: AssistantReadScope; clock?: Clock;
  /** Publication can reuse its fenced transaction, with no nested snapshot. */
  transaction?: ChatTransaction;
  /** Typed read ports permit the memory repository to exercise identical policy. */
  readers?: Partial<AssistantSourceReaders>;
}): AssistantReadSources {
  const scope = Object.freeze({ ...options.scope });
  const readContext = () => readAssistantContext(options.chatRepository, scope, options.transaction);
  const snapshot = <T>(read: (tx: ChatTransaction) => Promise<T>) => options.transaction ? read(options.transaction) : options.chatRepository.snapshot(read);
  const readers: AssistantSourceReaders = {
    status: (context, tx) => createProjectStatusService({ repository: tx!.app, chatRepository: options.chatRepository, clock: options.clock }).getForClientScope(scope, tx),
    execution: readExecution, approved: readApproved, lines: readAssistantLines, search: searchAssistantCatalogue, recommendations: readAssistantRecommendations,
    ...options.readers
  };
  async function guarded<T>(read: (context: AssistantContext, tx: ChatTransaction) => Promise<T>): Promise<T> {
    await readContext();
    const result = await snapshot(async tx => read(await readAssistantContext(options.chatRepository, scope, tx), tx));
    await readContext();
    return result;
  }
  const statusRead = async (context: AssistantContext, tx: ChatTransaction) => {
    const summary = await readers.status(context, tx);
    const facts = statusFacts(summary);
    const approved = await readers.approved(context, tx);
    for (const room of approved.scope.rooms.slice(0, 40)) facts.push(fact(scope.projectId, `room:${room.id}`, "Project room", room.name));
    return { facts, freshness: [scopeWitness(context), sourceWitness("assistant-status", scope.projectId, { ...summary, serverNow: undefined }), ...approved.freshness] };
  };
  return {
    status: () => guarded(statusRead),
    execution: () => guarded(async (context, tx) => {
      const result = await readers.execution(context, tx); return { facts: result.facts, freshness: [scopeWitness(context), ...result.freshness] };
    }),
    searchCatalogue: input => guarded((_context, tx) => readers.search(input, tx.session)),
    recommendations: input => guarded(async (context, tx) => {
      const ids = boundedAssistantIds(input.mainLineIds, 8);
      const approved = await readers.approved(context, tx);
      if (input.roomId !== null && !approved.scope.rooms.some(room => room.id === input.roomId)) throw new ApiError(400, "ASSISTANT_INPUT_INVALID", "Choose a room from this project.");
      const result = await readers.recommendations(ids, tx.session);
      return { rules: result.rules, freshness: [scopeWitness(context), ...approved.freshness, ...result.freshness] };
    }),
    preview: input => guarded(async (context, tx) => {
      const approved = await readers.approved(context, tx);
      const freshness = [scopeWitness(context), ...approved.freshness];
      const restricted = await calculateAssistantAddition(input, approved.scope, {
        lines: async ids => { const result = await readers.lines(ids, tx.session); freshness.push(...result.freshness); return result.lines; },
        recommendations: async ids => { const result = await readers.recommendations(ids, tx.session); freshness.push(...result.freshness); return result.rules; }
      });
      const unique = [...new Map(freshness.map(item => [`${item.kind}:${item.id}`, item])).values()];
      return { public: { state: restricted.state, missingInputs: restricted.missingInputs }, restricted, freshness: unique };
    }),
    async revalidate(freshness) {
      try {
        if (!Array.isArray(freshness) || freshness.length > 128) return false;
        return await guarded(async (context, tx) => {
          for (const witness of freshness) {
            if (!witness || typeof witness.id !== "string" || witness.id.length > 7000 || !/^[a-f0-9]{64}$/u.test(witness.version)) return false;
            let current: AssistantSourceVersion | undefined;
            switch (witness.kind) {
              case "assistant-scope": current = scopeWitness(context); break;
              case "assistant-status": current = (await statusRead(context, tx)).freshness.find(row => row.kind === witness.kind); break;
              case "assistant-execution": current = (await readers.execution(context, tx)).freshness.find(row => row.kind === witness.kind); break;
              case "assistant-approved": current = (await readers.approved(context, tx)).freshness.find(row => row.kind === witness.kind); break;
              case "assistant-line": current = (await readers.lines(boundedAssistantIds([witness.id]), tx.session)).freshness.find(row => row.id === witness.id); break;
              case "assistant-candidate": {
                const candidate = (await readers.lines(boundedAssistantIds([witness.id]), tx.session)).lines.get(witness.id)?.candidate;
                if (candidate) current = sourceWitness(witness.kind, witness.id, candidate); break;
              }
              case "assistant-recommendations": {
                const ids = boundedAssistantIds(JSON.parse(witness.id) as string[]);
                current = (await readers.recommendations(ids, tx.session)).freshness[0]; break;
              }
              default: return false;
            }
            if (!current || current.kind !== witness.kind || current.id !== witness.id || current.version !== witness.version) return false;
          }
          return true;
        });
      } catch { return false; }
    }
  };
}
