import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { ExecutionPolicy } from "../contracts/vendor-execution.js";
import { executionCutoff, executionDigest, executionLocalDate, nextExecutionDate } from "../domain/vendor-execution.js";
import { ExecutionDailyObligationModel, ExecutionReportingCursorModel } from "../models/ExecutionDailyObligation.js";
import { ExecutionNotificationAssignmentModel, ExecutionNotificationModel, ExecutionSchedulerLeaseModel } from "../models/ExecutionNotification.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import { VendorExecutionReviewModel } from "../models/VendorExecutionReview.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import type { AuditService } from "./audit.service.js";
import { appendExecutionChange } from "./execution-change-events.js";
import { executionAccessStarts, obligationDates, readExecutionDaily, reportingContext, reportingSuspendedAt, settleObligation, type ReportingRow } from "./execution-obligations.js";

export interface SchedulerDependencies { audit: AuditService; now: () => Date; policyForProject: (projectId: string, session?: ClientSession, at?: Date) => Promise<ExecutionPolicy> }
export async function executionEscalationReasons(assignment: ReportingRow, state: ReportingRow, policy: ExecutionPolicy, at: Date, session?: ClientSession) {
  const context = await reportingContext(assignment, state, session);
  const date = executionLocalDate(at, policy.timezone);
  if (!context.current || context.clientReview || state.status === "site_verified") return [];
  const reasons: string[] = [];
  if (!context.sourceAvailable) reasons.push("Issued work source unavailable");
  if (!context.account) reasons.push("Vendor access unavailable");
  if (context.project) reasons.push(...(await staffRecipients(context.project, session)).missing);
  if (state.hold || context.project?.status === "on_hold") {
    if (state.hold?.reviewDate <= date) reasons.push("Hold review due");
    return reasons;
  }
  const daily = await readExecutionDaily(assignment, state, policy, at, session);
  if (daily.state === "missing") reasons.push("Daily update missing");
  if (state.status === "blocked") reasons.push("Work blocked");
  if (state.schedule?.finishDate < date || assignment.targetDate && assignment.targetDate < date) reasons.push("Work deadline overdue");
  if (!state.acknowledgedAt && state.accessAvailableAt && at >= executionCutoff(nextExecutionDate(executionLocalDate(new Date(state.accessAvailableAt), policy.timezone)), policy.deadlineTime, policy.timezone)) reasons.push("Acknowledgement overdue");
  if (state.acknowledgedAt && !state.schedule) reasons.push("Schedule confirmation required");
  if (state.status === "awaiting_verification") {
    const review = await VendorExecutionReviewModel.findById(state.submissionId).session(session ?? null).lean();
    if (review && at >= executionCutoff(nextExecutionDate(executionLocalDate(new Date(review.submittedAt), policy.timezone)), policy.escalationTime, policy.timezone)) reasons.push("Site verification overdue");
  }
  return reasons;
}
async function staffRecipients(project: ReportingRow, session?: ClientSession) {
  const tasks = await ProjectWorkflowTaskModel.find({ projectId: project._id, kind: "site_execution", assigneeRole: "site_manager" }).limit(2).session(session ?? null).lean();
  const site = tasks.length === 1 ? await UserModel.findOne({ _id: tasks[0]!.assigneeUserId, role: "site_manager", active: true }).session(session ?? null).lean() : null;
  const manager = project.programManagerId ? await UserModel.findOne({ _id: project.programManagerId, role: "program_manager", active: true }).session(session ?? null).lean() : null;
  const admins = await UserModel.find({ role: "super_admin", active: true }).limit(2).session(session ?? null).lean();
  return { people: [site, manager, ...(admins.length === 1 ? admins : [])].filter(Boolean) as ReportingRow[], missing: [...(!site ? ["Site Manager assignment required"] : []), ...(!manager ? ["Program Manager assignment required"] : [])] };
}
async function queueNotification(input: { recipientId: string; projectId: string; vendorId: string | null; localDate: string; timezone: string; kind: string; assignmentId: string; reasons: string[]; at: Date }, session: ClientSession, audit: AuditService) {
  const id = `execution-notification:${executionDigest([input.recipientId, input.projectId, input.localDate, input.kind])}`;
  const member = `${id}:${input.assignmentId}`;
  if (await ExecutionNotificationAssignmentModel.exists({ _id: member }).session(session)) return;
  await ExecutionNotificationAssignmentModel.create([{ _id: member, notificationId: id, assignmentId: input.assignmentId, expiresAt: new Date(input.at.getTime() + 90 * 86400000) }], { session });
  const existing = await ExecutionNotificationModel.findById(id).session(session).lean() as ReportingRow | null;
  if (existing) {
    if (existing.items.some((item: ReportingRow) => item.assignmentId === input.assignmentId)) return;
    if (existing.items.length < 200) await ExecutionNotificationModel.updateOne({ _id: id }, { $push: { items: { assignmentId: input.assignmentId, reasons: input.reasons } }, $set: { updatedAt: input.at } }, { session });
    else await ExecutionNotificationModel.updateOne({ _id: id }, { $inc: { overflowCount: 1 }, $set: { updatedAt: input.at } }, { session });
    return;
  }
  await ExecutionNotificationModel.create([{ _id: id, recipientId: input.recipientId, projectId: input.projectId, vendorId: input.vendorId, localDate: input.localDate, timezone: input.timezone, kind: input.kind, items: [{ assignmentId: input.assignmentId, reasons: input.reasons }], createdAt: input.at, updatedAt: input.at, deliveryStatus: "pending", nextAttemptAt: input.at, expiresAt: new Date(input.at.getTime() + 90 * 86400000) }], { session });
  await audit.appendInMongoTransaction({ actorId: "system:execution-scheduler", action: "vendor_execution_reminder_recorded", entityType: "execution_notification", entityId: id, occurredAt: input.at.toISOString(), newValues: { projectId: input.projectId, kind: input.kind, localDate: input.localDate, recipientId: input.recipientId } }, session);
  await appendExecutionChange({ projectId: input.projectId, vendorId: input.vendorId, assignmentId: input.assignmentId, version: 0, kind: "execution_notification", occurredAt: input.at }, session);
}
export function createExecutionReminderScheduler(options: SchedulerDependencies) {
  async function processAssignment(assignmentId: string, at: Date) {
    await mongoose.connection.transaction(async session => {
      const assignment = await VendorWorkAssignmentModel.findById(assignmentId).session(session).lean() as ReportingRow | null;
      const state = await VendorExecutionStateModel.findById(assignmentId).session(session).lean() as ReportingRow | null;
      if (!assignment || !state) return;
      // Same project write fence used by vendor reports, holds and review commands.
      await ProjectModel.updateOne({ _id: assignment.projectId }, { $inc: { siteCompletionFenceEpoch: 1 } }, { session, timestamps: false });
      const policy = await options.policyForProject(assignment.projectId, session, at);
      const date = executionLocalDate(at, policy.timezone);
      const context = await reportingContext(assignment, state, session);
      if (context.available && context.sourceAvailable && !state.accessAvailableAt) {
        // Observe access prospectively: an issued order can predate password setup.
        const changed = await VendorExecutionStateModel.updateOne({ _id: assignmentId, version: state.version, accessAvailableAt: null },
          { $set: { accessAvailableAt: at }, $inc: { version: 1 } }, { session, timestamps: false });
        if (!changed.matchedCount) throw new Error("Execution access observation changed concurrently.");
        state.accessAvailableAt = at; state.version++;
        await appendExecutionChange({ projectId: assignment.projectId, vendorId: assignment.vendorId, assignmentId, version: state.version, kind: "access_available", occurredAt: at }, session);
      }
      const cursor = await ExecutionReportingCursorModel.findById(assignmentId).session(session).lean() as ReportingRow | null;
      const resumesOn = cursor && !cursor.eligible && context.eligible ? nextExecutionDate(date) : cursor?.resumesOn ?? null;
      const suspendedAt = context.eligible ? null : reportingSuspendedAt(state, cursor, at);
      let nextDate = cursor?.nextDate ?? state.reportingStartsOn ?? date;
      if (resumesOn && nextDate < resumesOn) nextDate = resumesOn;
      if (context.eligible) {
        // Account activation after a pause starts a full future day, even if setup predates it.
        const accessStarts = executionAccessStarts(context.account, state, policy);
        const starts = [state.reportingStartsOn, resumesOn, accessStarts].filter(Boolean).sort().at(-1)!;
        if (nextDate < starts) nextDate = starts;
        const dates = new Set<string>();
        for (let count = 0; nextDate <= date && count < 7; count++) { dates.add(nextDate); nextDate = nextExecutionDate(nextDate); }
        if (starts <= date) dates.add(date);
        for (const localDate of dates) {
          const dayPolicy = await options.policyForProject(assignment.projectId, session, executionCutoff(localDate, "12:00", policy.timezone));
          const cutoffs = obligationDates(localDate, dayPolicy);
          const id = `${assignmentId}:${localDate}`;
          await ExecutionDailyObligationModel.updateOne({ _id: id }, { $setOnInsert: { _id: id, assignmentId, projectId: assignment.projectId, vendorId: assignment.vendorId, localDate, timezone: dayPolicy.timezone, policyVersion: dayPolicy.version, executionRound: state.executionRound, ...cutoffs, outcome: "pending", createdAt: at } }, { upsert: true, session });
        }
      }
      await ExecutionReportingCursorModel.updateOne({ _id: assignmentId }, { $set: { eligible: context.eligible, nextDate, resumesOn, suspendedAt, lastObservedAt: at }, $inc: { revision: 1 } }, { upsert: true, session });
      const open = await ExecutionDailyObligationModel.find({ assignmentId, $or: [{ outcome: "pending" }, { dayStartsAt: { $lte: at }, dayEndsAt: { $gt: at } }] }).sort({ dueAt: 1 }).limit(32).session(session).lean();
      for (const obligation of open) {
        let exemption: string | null = null;
        if (!context.eligible) {
          if (suspendedAt && new Date(suspendedAt) <= new Date(obligation.dueAt)) exemption = "Reporting suspended";
        }
        const result = await settleObligation(obligation, at, session, exemption);
        if (result.outcome !== obligation.outcome) await appendExecutionChange({ projectId: assignment.projectId, vendorId: assignment.vendorId, assignmentId, version: state.version, kind: "reporting_cutoff", occurredAt: at }, session);
      }
      if (!context.current || !context.project) return;
      const daily = await readExecutionDaily(assignment, state, policy, at, session);
      const common = { projectId: assignment.projectId, localDate: date, timezone: policy.timezone, assignmentId, at };
      if (context.account && context.eligible && daily.state === "due" && at >= executionCutoff(date, policy.reminderTime, policy.timezone)) await queueNotification({ ...common, recipientId: String(context.account._id), vendorId: assignment.vendorId, kind: "daily_reminder", reasons: ["Daily work update due"] }, session, options.audit);
      if (at >= executionCutoff(date, policy.escalationTime, policy.timezone)) {
        const recipients = await staffRecipients(context.project, session);
        const reasons = await executionEscalationReasons(assignment, state, policy, at, session);
        if (reasons.length) for (const person of recipients.people) await queueNotification({ ...common, recipientId: String(person._id), vendorId: null, kind: "daily_escalation", reasons }, session, options.audit);
      }
    });
  }
  return {
    async runBatch(): Promise<boolean> {
      const at = options.now(), token = randomUUID();
      await ExecutionSchedulerLeaseModel.updateOne({ _id: "reporting" }, { $setOnInsert: { expiresAt: new Date(0) } }, { upsert: true });
      const lease = await ExecutionSchedulerLeaseModel.findOneAndUpdate({ _id: "reporting", expiresAt: { $lte: at } }, { $set: { token, expiresAt: new Date(at.getTime() + 120000), lastAttemptAt: at } }, { returnDocument: "after" }).lean();
      if (!lease) return false;
      try {
        const rows = await VendorExecutionStateModel.find(lease.assignmentCursor ? { _id: { $gt: lease.assignmentCursor } } : {}).select({ _id: 1 }).sort({ _id: 1 }).limit(100).lean();
        for (const row of rows) {
          const renewed = await ExecutionSchedulerLeaseModel.updateOne({ _id: "reporting", token, expiresAt: { $gt: options.now() } }, { $set: { expiresAt: new Date(options.now().getTime() + 120000) } });
          if (!renewed.matchedCount) return false;
          await processAssignment(String(row._id), options.now());
        }
        const wrapped = rows.length < 100;
        await ExecutionSchedulerLeaseModel.updateOne({ _id: "reporting", token }, { $set: { token: null, expiresAt: options.now(), lastSuccessAt: options.now(), failureCode: null, assignmentCursor: wrapped ? null : String(rows.at(-1)!._id) } });
        return wrapped;
      } catch (error) {
        await ExecutionSchedulerLeaseModel.updateOne({ _id: "reporting", token }, { $set: { token: null, expiresAt: options.now(), failureCode: "SCHEDULER_TICK_FAILED" } });
        throw error;
      }
    }
  };
}
