import type { ClientSession } from "mongoose";
import type { ExecutionDailyStatus, ExecutionPolicy } from "../contracts/vendor-execution.js";
import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import { executionCutoff, executionLocalDate, nextExecutionDate } from "../domain/vendor-execution.js";
import { ExecutionDailyObligationModel, ExecutionReportingCursorModel } from "../models/ExecutionDailyObligation.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { UserModel } from "../models/User.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { VendorExecutionEventModel } from "../models/VendorExecutionEvent.js";
import { vendorActivation } from "./vendor-readiness.service.js";

export type ReportingRow = Record<string, any>;
export async function reportingContext(assignment: ReportingRow, state: ReportingRow | null, session?: ClientSession) {
  const project = await ProjectModel.findById(assignment.projectId).session(session ?? null).lean() as ReportingRow | null;
  const order = await ProjectPurchaseOrderModel.findOne({ _id: assignment.orderId, projectId: assignment.projectId, vendorId: assignment.vendorId, approvedRevision: assignment.orderRevision, cancelledAt: null }).session(session ?? null).lean();
  const accounts = await UserModel.find({ vendorId: assignment.vendorId }).limit(2).session(session ?? null).lean() as ReportingRow[];
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(assignment.vendorId).session(session ?? null).lean();
  const account = accounts.length === 1 && accounts[0]!.role === "vendor" && accounts[0]!.active && vendor && (await vendorActivation(vendor, session)).effectiveStatus === "active" ? accounts[0]! : null;
  const site = await SiteCompletionStateModel.findById(assignment.projectId).session(session ?? null).lean();
  const revision = order?.approvedRevisionId ? await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId: assignment.orderId, projectId: assignment.projectId, vendorId: assignment.vendorId, revision: assignment.orderRevision }).session(session ?? null).lean() : null;
  const sourceLine = revision?.lines?.find((line: ReportingRow) => line.id === assignment.lineId && line.procurementItemId === assignment.procurementItemId && line.sourceLineItemKey === assignment.sourceLineItemKey);
  let estimateLines: ReportingRow[] = [];
  if (assignment.estimateReviewRoundId) {
    const round = await EstimateClientReviewRoundModel.findOne({ _id: assignment.estimateReviewRoundId, estimateId: assignment.estimateId, estimateVersion: assignment.estimateVersion, status: "approved", decision: "approve" }).session(session ?? null).lean();
    if (round && (!round.projectId || round.projectId === assignment.projectId)) estimateLines = round.estimateSnapshot?.lineItems ?? [];
  } else {
    const estimate = await EstimateModel.findOne({ _id: assignment.estimateId, version: assignment.estimateVersion }).session(session ?? null).lean();
    estimateLines = estimate?.lineItems ?? [];
  }
  const sourceAvailable = Boolean(sourceLine && estimateLines.some((line, index) => approvedEstimateLineItemKey({ id: line.id, index, estimateId: assignment.estimateId, estimateVersion: assignment.estimateVersion }) === assignment.sourceLineItemKey));
  const current = Boolean(project && order && assignment.status !== "superseded" && project.status !== "completed");
  const accepted = assignment.status === "client_approved" && (!state || state.status === "site_verified");
  const clientReview = assignment.status === "submitted_for_client" || accepted || ["pending_client", "client_approved"].includes(site?.status ?? "");
  const review = clientReview || ["awaiting_verification", "site_verified"].includes(state?.status ?? "");
  const available = Boolean(current && project?.status === "active" && account);
  return { project, account, current, sourceAvailable, clientReview, review, available, eligible: Boolean(available && sourceAvailable && state?.reportingStartsOn && state.schedule && !review && !state.hold) };
}
async function firstReport(assignmentId: string, start: Date, end: Date, session?: ClientSession) {
  return VendorExecutionEventModel.findOne({ assignmentId, action: "report", occurredAt: { $gte: start, $lt: end } }).sort({ occurredAt: 1, _id: 1 }).session(session ?? null).lean() as Promise<ReportingRow | null>;
}
export function obligationDates(date: string, policy: ExecutionPolicy) {
  return { dayStartsAt: executionCutoff(date, "00:00", policy.timezone), dayEndsAt: executionCutoff(nextExecutionDate(date), "00:00", policy.timezone), reminderAt: executionCutoff(date, policy.reminderTime, policy.timezone), dueAt: executionCutoff(date, policy.deadlineTime, policy.timezone), escalationAt: executionCutoff(date, policy.escalationTime, policy.timezone) };
}
export function executionAccessStarts(account: ReportingRow | null, state: ReportingRow | null, policy: ExecutionPolicy): string | null {
  // Profile edits are not access transitions. Initial access uses stable creation /
  // acknowledgement evidence; subsequent pauses are observed by the durable cursor.
  const instants = [account?.createdAt, state?.accessAvailableAt, state?.acknowledgedAt].filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  return instants.length ? nextExecutionDate(executionLocalDate(new Date(Math.max(...instants)), policy.timezone)) : null;
}
export function reportingSuspendedAt(state: ReportingRow | null, cursor: ReportingRow | null, at: Date): Date {
  return new Date(state?.hold?.startedAt ?? cursor?.suspendedAt ?? (cursor?.eligible === false ? cursor.lastObservedAt : at));
}
async function hasReportingHold(assignmentId: string, dates: ReportingRow, session?: ClientSession): Promise<boolean> {
  const event = await VendorExecutionEventModel.findOne({ assignmentId,
    action: { $in: ["hold", "resume"] }, occurredAt: { $lte: new Date(dates.dueAt) } })
    .sort({ occurredAt: -1, version: -1 }).session(session ?? null).lean();
  // A resume starts reporting on the next full day, including after downtime.
  return Boolean(event && (event.action === "hold" || new Date(event.occurredAt) >= new Date(dates.dayStartsAt)));
}
/** A read never creates obligations or retroactively starts reporting. */
export async function readExecutionDaily(assignment: ReportingRow, state: ReportingRow | null, policy: ExecutionPolicy, at: Date, session?: ClientSession): Promise<ExecutionDailyStatus> {
  const localDate = executionLocalDate(at, policy.timezone);
  const existing = await ExecutionDailyObligationModel.findOne({ assignmentId: assignment._id, dayStartsAt: { $lte: at }, dayEndsAt: { $gt: at } }).sort({ createdAt: 1 }).session(session ?? null).lean() as ReportingRow | null;
  const date = existing?.localDate ?? localDate;
  const dates = existing ?? obligationDates(date, policy);
  const context = await reportingContext(assignment, state, session);
  const cursor = await ExecutionReportingCursorModel.findById(assignment._id).session(session ?? null).lean();
  const accessStarts = executionAccessStarts(context.account, state, policy);
  const report = await firstReport(String(assignment._id), new Date(dates.dayStartsAt), new Date(dates.dayEndsAt), session);
  const reportedAt = report ? new Date(report.occurredAt).toISOString() : null;
  if (existing?.outcome === "exempt") return { localDate: date, state: "exempt", dueAt: null, reportedAt };
  // Frozen cutoff results survive a later hold, account suspension or review.
  const frozen = existing && ["missing", "on_time"].includes(existing.outcome);
  if (!frozen && (!report || new Date(report.occurredAt) > new Date(dates.dueAt)) && await hasReportingHold(String(assignment._id), dates, session)) {
    return { localDate: date, state: "exempt", dueAt: null, reportedAt };
  }
  if (!frozen && (!context.eligible || accessStarts && accessStarts > date || cursor?.resumesOn && cursor.resumesOn > date)) {
    if (!existing) return { localDate: date, state: state?.hold ? "exempt" : "not_due", dueAt: null, reportedAt: null };
    if (at < new Date(dates.dueAt) || reportingSuspendedAt(state, cursor, at) <= new Date(dates.dueAt)) return { localDate: date, state: "exempt", dueAt: null, reportedAt };
  }
  if (!existing && (!context.eligible || !state?.reportingStartsOn || state.reportingStartsOn > date || (cursor?.resumesOn && cursor.resumesOn > date))) return { localDate: date, state: state?.hold ? "exempt" : "not_due", dueAt: null, reportedAt: null };
  return { localDate: date, dueAt: new Date(dates.dueAt).toISOString(), state: report ? new Date(report.occurredAt) <= new Date(dates.dueAt) ? "on_time" : "late" : at >= new Date(dates.dueAt) ? "missing" : "due", reportedAt };
}
export async function settleObligation(row: ReportingRow, at: Date, session: ClientSession, exemption: string | null = null) {
  const report = await firstReport(row.assignmentId, new Date(row.dayStartsAt), new Date(row.dayEndsAt), session);
  if (row.outcome === "pending" && !exemption) {
    // Resume starts the next full reporting day. Reconstruct the approved hold
    // even when no scheduler tick observed the hold before staff resumed work.
    if (await hasReportingHold(row.assignmentId, row, session)) exemption = "Approved reporting hold";
  }
  const onTime = report && new Date(report.occurredAt) <= new Date(row.dueAt);
  // An exemption is prospective: it cannot erase a finalized missed cutoff.
  const outcome = row.outcome === "exempt" ? "exempt" : onTime ? "on_time" : row.outcome === "pending" && exemption ? "exempt" : at >= new Date(row.dueAt) ? "missing" : "pending";
  await ExecutionDailyObligationModel.updateOne({ _id: row._id }, { $set: { outcome, reportedAt: report?.occurredAt ?? null, finalizedAt: outcome === "pending" ? null : row.finalizedAt ?? at, exemption: outcome === "exempt" ? row.exemption ?? exemption : null } }, { session });
  return { ...row, outcome, reportedAt: report?.occurredAt ?? null };
}
