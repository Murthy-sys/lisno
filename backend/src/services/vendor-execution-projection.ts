import type { ClientSession } from "mongoose";
import type { ExecutionAction, ExecutionCounts, ExecutionDailyStatus, ExecutionPolicy, ExecutionVendorReport, ExecutionWork } from "../contracts/vendor-execution.js";
import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import { executionCutoff, executionLocalDate, nextExecutionDate } from "../domain/vendor-execution.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { VendorWorkImageModel } from "../models/VendorWorkImage.js";
import { VendorExecutionEventModel } from "../models/VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "../models/VendorExecutionReview.js";
import { VendorWorkReviewModel } from "../models/VendorWorkReview.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { vendorActivation } from "./vendor-readiness.service.js";
import type { PublicUser } from "./auth.service.js";

export type ExecutionRow = Record<string, any>;
export type ExecutionProjectionCache = Map<string, Promise<any>>;
export function executionCached<T>(cache: ExecutionProjectionCache, key: string, read: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, read());
  return cache.get(key)!;
}
export type DailyReader = (assignment: ExecutionRow, state: ExecutionRow | null, policy: ExecutionPolicy, at: Date, session: ClientSession) => Promise<ExecutionDailyStatus>;
export function iso(value: unknown): string | null { return value ? new Date(value as string | Date).toISOString() : null; }
export const editableExecutionStates = ["assigned", "awaiting_schedule", "not_started", "in_progress", "blocked", "changes_requested"];

function reportCacheKey(assignment: ExecutionRow, state: ExecutionRow | null): string {
  return `vendor-report:${JSON.stringify([String(assignment._id), assignment.projectId, assignment.vendorId, state?.executionRound ?? null])}`;
}

/** Fetch at most one current-round report per assignment, without an extra history read per row. */
export async function cacheLatestVendorReports(assignments: ExecutionRow[], states: Map<string, ExecutionRow>, session: ClientSession, cache: ExecutionProjectionCache): Promise<void> {
  const pending = assignments.filter(assignment => !cache.has(reportCacheKey(assignment, states.get(String(assignment._id)) ?? null)));
  const identities = pending.flatMap(assignment => {
    const state = states.get(String(assignment._id));
    return state ? [{ assignmentId: String(assignment._id), projectId: assignment.projectId, vendorId: assignment.vendorId, executionRound: state.executionRound }] : [];
  });
  const reports = identities.length ? await VendorExecutionEventModel.aggregate<ExecutionRow>([
    { $match: { action: "report", $or: identities } },
    { $sort: { occurredAt: -1, version: -1, _id: -1 } },
    { $group: { _id: { assignmentId: "$assignmentId", projectId: "$projectId", vendorId: "$vendorId", executionRound: "$executionRound" }, report: { $first: "$$ROOT" } } }
  ]).session(session) : [];
  const reportByIdentity = new Map(reports.map(({ report }) => [
    JSON.stringify([report.assignmentId, report.projectId, report.vendorId, report.executionRound]), report as ExecutionRow
  ]));
  for (const assignment of pending) {
    const state = states.get(String(assignment._id)) ?? null;
    const event = reportByIdentity.get(JSON.stringify([String(assignment._id), assignment.projectId, assignment.vendorId, state?.executionRound ?? null]));
    const report: ExecutionVendorReport | null = event ? {
      eventId: String(event._id), executionRound: event.executionRound, reportedAt: iso(event.occurredAt)!,
      note: event.note, reason: event.reason ?? null, nextAction: event.nextAction ?? null, progress: event.progress, status: event.status
    } : null;
    cache.set(reportCacheKey(assignment, state), Promise.resolve(report));
  }
}

export async function currentExecutionImages(assignment: ExecutionRow, state: ExecutionRow, session: ClientSession): Promise<string[]> {
  const rows = await VendorWorkImageModel.find({ assignmentId: assignment._id, projectId: assignment.projectId, vendorId: assignment.vendorId,
    executionRound: state.executionRound, uploadedAt: { $gte: state.roundStartedAt } }).select({ _id: 1 }).sort({ uploadedAt: 1, _id: 1 }).session(session).lean();
  return rows.map(row => String(row._id));
}
export async function defaultExecutionDaily(assignment: ExecutionRow, state: ExecutionRow | null, policy: ExecutionPolicy, at: Date, session: ClientSession): Promise<ExecutionDailyStatus> {
  const localDate = executionLocalDate(at, policy.timezone);
  if (!state?.reportingStartsOn || state.reportingStartsOn > localDate || !editableExecutionStates.includes(state.status) || assignment.status === "superseded") return { localDate, dueAt: null, state: "not_due", reportedAt: null };
  if (state.hold) return { localDate, dueAt: null, state: "exempt", reportedAt: null };
  const due = executionCutoff(localDate, policy.deadlineTime, policy.timezone);
  const report = await VendorExecutionEventModel.findOne({ assignmentId: assignment._id, action: "report", localDate }).sort({ occurredAt: 1, _id: 1 }).session(session).lean() as ExecutionRow | null;
  return { localDate, dueAt: due.toISOString(), state: report ? new Date(report.occurredAt) <= due ? "on_time" : "late" : at >= due ? "missing" : "due", reportedAt: iso(report?.occurredAt) };
}

export async function executionWorkDto(assignment: ExecutionRow, state: ExecutionRow | null, actor: PublicUser, policy: ExecutionPolicy, at: Date, session: ClientSession, readDaily: DailyReader, cache: ExecutionProjectionCache = new Map()): Promise<ExecutionWork> {
  await cacheLatestVendorReports([assignment], new Map(state ? [[String(assignment._id), state]] : []), session, cache);
  const latestVendorReport = await cache.get(reportCacheKey(assignment, state)) as ExecutionVendorReport | null;
  const project = await executionCached(cache, `project:${assignment.projectId}`, async () => ProjectModel.findById(assignment.projectId).session(session).lean()) as ExecutionRow | null;
  const vendor = await executionCached(cache, `vendor:${assignment.vendorId}`, async () => AiEstimatorKnowledgeVendorModel.findById(assignment.vendorId).session(session).lean()) as ExecutionRow | null;
  const order = await executionCached(cache, `order:${assignment.orderId}:${assignment.projectId}:${assignment.vendorId}`, async () => ProjectPurchaseOrderModel.findOne({ _id: assignment.orderId, projectId: assignment.projectId, vendorId: assignment.vendorId }).session(session).lean()) as ExecutionRow | null;
  const revision = await executionCached(cache, `revision:${assignment.orderId}:${assignment.orderRevision}:${assignment.projectId}:${assignment.vendorId}`, async () => ProjectPurchaseOrderRevisionModel.findOne({ orderId: assignment.orderId, revision: assignment.orderRevision, projectId: assignment.projectId, vendorId: assignment.vendorId }).session(session).lean()) as ExecutionRow | null;
  const issuedLine = revision?.lines?.find((line: ExecutionRow) => line.id === assignment.lineId && line.procurementItemId === assignment.procurementItemId && line.sourceLineItemKey === assignment.sourceLineItemKey);
  let estimateLines: ExecutionRow[] = [];
  if (assignment.estimateReviewRoundId) {
    const round = await executionCached(cache, `estimate-round:${assignment.estimateReviewRoundId}:${assignment.estimateId}:${assignment.estimateVersion}`, async () => EstimateClientReviewRoundModel.findOne({ _id: assignment.estimateReviewRoundId, estimateId: assignment.estimateId, estimateVersion: assignment.estimateVersion }).session(session).lean()) as ExecutionRow | null;
    if (round?.status === "approved" && round.decision === "approve" && (!round.projectId || round.projectId === assignment.projectId)) estimateLines = round.estimateSnapshot?.lineItems ?? [];
  } else {
    const estimate = await executionCached(cache, `estimate:${assignment.estimateId}:${assignment.estimateVersion}`, async () => EstimateModel.findOne({ _id: assignment.estimateId, version: assignment.estimateVersion }).session(session).lean()) as ExecutionRow | null;
    estimateLines = estimate?.lineItems ?? [];
  }
  const source = estimateLines.find((line, index) => approvedEstimateLineItemKey({ id: line.id, index, estimateId: assignment.estimateId, estimateVersion: assignment.estimateVersion }) === assignment.sourceLineItemKey);
  const sourceAvailable = Boolean(issuedLine && source && revision?._id === order?.approvedRevisionId);
  const review = state?.submissionId ? await VendorExecutionReviewModel.findById(state.submissionId).session(session).lean() as ExecutionRow | null : null;
  const legacyClientReview = !state && ["submitted_for_client", "client_approved"].includes(assignment.status)
    ? await VendorWorkReviewModel.findOne({ assignmentId: assignment._id, projectId: assignment.projectId, vendorId: assignment.vendorId, round: assignment.currentRound }).session(session).lean() as ExecutionRow | null : null;
  const site = await executionCached(cache, `site:${assignment.projectId}`, async () => SiteCompletionStateModel.findById(assignment.projectId).session(session).lean()) as ExecutionRow | null;
  const frozen = ["pending_client", "client_approved"].includes(site?.status);
  const currentOrder = order && !order.cancelledAt && order.approvedRevision === assignment.orderRevision && order.approvedRevisionId && order.status !== "cancelled" && assignment.status !== "superseded";
  const legacyReview = !state && ["submitted_for_client", "client_approved"].includes(assignment.status);
  const accepted = assignment.status === "client_approved" && (!state || state.status === "site_verified");
  const status: ExecutionWork["status"] = !currentOrder ? "superseded" : accepted ? "client_approved" : assignment.status === "submitted_for_client" ? "awaiting_client" : state?.status ?? "assigned";
  const accessActive = await executionCached(cache, `vendor-access:${assignment.vendorId}`, async () => {
    const accounts = await UserModel.find({ vendorId: assignment.vendorId }).select({ role: 1, active: 1 }).limit(2).session(session).lean();
    return Boolean(accounts.length === 1 && accounts[0]?.role === "vendor" && accounts[0].active && vendor && (await vendorActivation(vendor, session)).effectiveStatus === "active");
  });
  let daily = await readDaily(assignment, state, policy, at, session);
  if (!["missing", "late", "on_time"].includes(daily.state) && (!accessActive || project?.status !== "active" || frozen || assignment.status === "submitted_for_client" || !currentOrder || accepted)) daily = { ...daily, state: "not_due", dueAt: null };
  const localDate = executionLocalDate(at, policy.timezone);
  const flags: string[] = [];
  if (!sourceAvailable && currentOrder) flags.push("source_unavailable");
  if (!accessActive && currentOrder && !accepted) flags.push("access_blocked");
  if (!state && !legacyReview && currentOrder) flags.push("setup_required");
  if (state && !state.acknowledgedAt && accessActive) flags.push("acknowledgement_required");
  if (state && !state.acknowledgedAt && state.accessAvailableAt && localDate >= nextExecutionDate(executionLocalDate(new Date(state.accessAvailableAt), policy.timezone)) && at >= executionCutoff(nextExecutionDate(executionLocalDate(new Date(state.accessAvailableAt), policy.timezone)), policy.deadlineTime, policy.timezone)) flags.push("acknowledgement_overdue");
  if (state && !state.schedule && currentOrder) flags.push("schedule_required");
  if (daily.state === "missing") flags.push("missing_update");
  if (daily.state === "late") flags.push("late_update");
  if (state?.hold && state.hold.reviewDate <= localDate) flags.push("hold_review_due");
  if (status === "blocked") flags.push("blocked");
  if (currentOrder && !accepted && status !== "site_verified") {
    if (assignment.targetDate && assignment.targetDate < localDate) flags.push("original_deadline_overdue");
    if (state?.schedule?.finishDate && state.schedule.finishDate < localDate) flags.push("overdue");
  }
  if (status === "awaiting_verification" && review && at >= executionCutoff(nextExecutionDate(executionLocalDate(new Date(review.submittedAt), policy.timezone)), policy.escalationTime, policy.timezone)) flags.push("verification_overdue");
  const siteManager = await executionCached(cache, `site-manager:${assignment.projectId}`, async () => {
    const siteTasks = await ProjectWorkflowTaskModel.find({ projectId: assignment.projectId, kind: "site_execution", assigneeRole: "site_manager" }).select({ assigneeUserId: 1 }).limit(2).session(session).lean();
    return siteTasks.length === 1 && siteTasks[0]?.assigneeUserId ? UserModel.exists({ _id: siteTasks[0].assigneeUserId, role: "site_manager", active: true }).session(session) : null;
  });
  if (!siteManager && currentOrder && !accepted) flags.push("site_manager_required");
  const allowedActions: ExecutionAction[] = [];
  const editable = Boolean(currentOrder && sourceAvailable && project?.status === "active" && !frozen && !accepted && assignment.status !== "submitted_for_client");
  const manager = ["site_manager", "program_manager", "super_admin"].includes(actor.role);
  if (editable && !state && !legacyReview && manager) allowedActions.push("setup");
  if (editable && state) {
    if (actor.role === "vendor" && editableExecutionStates.includes(state.status) && !state.hold) {
      if (!state.acknowledgedAt) allowedActions.push("acknowledge");
      else { allowedActions.push("propose_schedule"); if (state.schedule) { allowedActions.push("report"); if (state.progress === 100 && state.latestReportAt && new Date(state.latestReportAt) >= new Date(state.roundStartedAt)) allowedActions.push("submit"); } }
    }
    if (manager && editableExecutionStates.includes(state.status)) {
      if (state.acknowledgedAt) allowedActions.push("confirm_schedule");
      allowedActions.push(state.hold ? "resume" : "hold");
      if (actor.role === "site_manager") allowedActions.push("exempt_evidence");
    }
    if (actor.role === "site_manager" && state.status === "awaiting_verification") allowedActions.push("verify", "request_changes");
  }
  let nextOwner: ExecutionWork["nextOwner"] = accepted || !currentOrder ? "none" : !accessActive ? "super_admin" : !state ? legacyReview ? "client" : "site_manager" : !state.acknowledgedAt ? "vendor" : !state.schedule || state.status === "awaiting_verification" || state.hold ? "site_manager" : status === "site_verified" ? "client" : "vendor";
  if (!siteManager && nextOwner === "site_manager") nextOwner = "super_admin";
  return {
    id: String(assignment._id), projectId: assignment.projectId, projectName: project?.name ?? assignment.projectId, vendorId: assignment.vendorId, vendorName: vendor?.name ?? order?.vendorName ?? assignment.vendorId,
    orderId: assignment.orderId, orderNumber: revision?.orderNumber ?? order?.orderNumber ?? assignment.orderId, orderRevision: assignment.orderRevision, lineId: assignment.lineId, sourceLineItemKey: assignment.sourceLineItemKey,
    itemName: assignment.itemName, roomName: assignment.roomName, description: assignment.description, scopeType: assignment.scopeType ?? null,
    mainBasketId: source?.mainBasketId ?? null, mainBasketName: source?.mainBasketName ?? null, subBasketId: source?.subBasketId ?? null, subBasketName: source?.subBasketName ?? null, mainLineId: source?.mainLineId ?? null,
    sourceAvailable, quantityMilliUnits: issuedLine?.quantityMilliUnits ?? null, uomCode: issuedLine?.uomCode ?? null, originalTargetDate: assignment.targetDate ?? null, timezone: policy.timezone,
    tracking: state ? "tracked" : legacyReview ? "legacy_review" : "setup_required", legacyStatus: assignment.status, version: state?.version ?? 0, executionRound: state?.executionRound ?? 0,
    status, progress: state?.progress ?? assignment.progress, latestNote: state?.latestNote ?? assignment.note ?? "", latestReportAt: iso(state?.latestReportAt), latestVendorReport, acknowledgedAt: iso(state?.acknowledgedAt),
    proposedSchedule: state?.proposedSchedule ? { startDate: state.proposedSchedule.startDate, finishDate: state.proposedSchedule.finishDate, reason: state.proposedSchedule.reason ?? null } : null,
    schedule: state?.schedule ? { ...state.schedule, confirmedAt: iso(state.schedule.confirmedAt)! } : null,
    reportingStartsOn: state?.reportingStartsOn ?? null, hold: state?.hold ? { reason: state.hold.reason, startedAt: iso(state.hold.startedAt)!, reviewDate: state.hold.reviewDate } : null,
    submission: review ? { id: String(review._id), submittedAt: iso(review.submittedAt)!, note: review.note, imageIds: review.imageIds, version: review.submissionVersion } : null,
    verification: state?.verificationId && review?.decision?.outcome === "verified" ? { id: state.verificationId, verifiedAt: iso(review.decision.decidedAt)!, verifiedById: review.decision.actorId, executionRound: review.executionRound } : null,
    evidenceExemption: state?.evidenceExemption ? { reason: state.evidenceExemption.reason, grantedById: state.evidenceExemption.grantedById } : null,
    imageIds: state ? await currentExecutionImages(assignment, state, session) : legacyClientReview?.imageIds ?? [], daily, flags, nextOwner, allowedActions,
    canSubmitToClient: Boolean(actor.role === "vendor" && editable && state?.status === "site_verified" && ["in_progress", "changes_requested"].includes(assignment.status) && Number(site?.currentRound ?? 0) === 0)
  };
}
export function executionCounts(items: ExecutionWork[]): ExecutionCounts { return { total: items.length, open: items.filter(item => !["client_approved", "superseded"].includes(item.status)).length, reported: items.filter(item => item.latestReportAt).length,
  verified: items.filter(item => item.verification).length, clientAccepted: items.filter(item => item.status === "client_approved").length, missing: items.filter(item => item.daily.state === "missing").length,
  blocked: items.filter(item => item.status === "blocked").length, overdue: items.filter(item => item.flags.includes("overdue")).length, awaitingVerification: items.filter(item => item.status === "awaiting_verification").length, setupRequired: items.filter(item => item.tracking === "setup_required").length }; }
