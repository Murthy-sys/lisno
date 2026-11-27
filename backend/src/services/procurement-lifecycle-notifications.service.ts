import type { ClientSession } from "mongoose";
import type { LifecycleBlocker, LifecycleTab } from "../contracts/procurement-lifecycle.js";
import type { ProcurementNotification, ProcurementNotificationFacts, ProcurementNotificationKind, ProcurementNotificationPage, ProcurementSchedulerHealth } from "../contracts/procurement-notifications.js";
import { lcLocalDate, lcMissing, lcParse } from "../domain/procurement-lifecycle.js";
import { procurementNotificationLink, procurementNotificationsQuery, procurementReminderWindow } from "../domain/procurement-lifecycle-notifications.js";
import { ProcurementLifecycleNotificationModel } from "../models/ProcurementLifecycleNotification.js";
import { ProcurementLifecycleSchedulerLeaseModel } from "../models/ProcurementLifecycleSchedulerLease.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import { ProcurementReviewRoundModel } from "../models/ProcurementReviewRound.js";
import { ProcurementProgressCheckModel } from "../models/ProcurementProgressCheck.js";
import { ProcurementInspectionPlanModel } from "../models/ProcurementInspectionPlan.js";
import { ProcurementInspectionVisitModel } from "../models/ProcurementInspectionVisit.js";
import { ProcurementFindingModel } from "../models/ProcurementFinding.js";
import { ProjectSnagModel } from "../models/ProjectSnag.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";
import { listPaymentAlertSources } from "./procurement-payments.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./procurement-lifecycle/access.js";
import { lcTransaction } from "./procurement-lifecycle/transaction.js";
import { readLifecycleSource } from "./procurement-lifecycle/source.js";

export const PROCUREMENT_SCHEDULER_ID = "procurement-lifecycle";
export interface LifecycleAlertCondition {
  key: string; kind: ProcurementNotificationKind; entityId: string; tab: LifecycleTab;
  title: string; message: string; localDate: string; timezone: string; facts: ProcurementNotificationFacts;
}
const iso = (value: unknown): string | null => value ? new Date(value as string | Date).toISOString() : null;
const facts = (dueDate: string | null = null, remainingPaise: number | null = null, daysOverdue = 0, blockers: LifecycleBlocker[] = []): ProcurementNotificationFacts => ({ dueDate, remainingPaise, daysOverdue, blockers });

export async function lifecycleAlertRecipients(projectId: string, session: ClientSession): Promise<{ recipients: LifecycleRow[]; procurement: LifecycleRow | null }> {
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "procurement", assigneeRole: "procurement", supersededAt: null }).session(session).lean();
  const procurement = tasks.length === 1 ? await UserModel.findOne({ _id: tasks[0]!.assigneeUserId, role: "procurement", active: true }).session(session).lean() : null;
  const admins = await UserModel.find({ role: "super_admin", active: true }).limit(2).session(session).lean();
  return { recipients: [...(procurement ? [procurement] : []), ...(admins.length === 1 ? admins : [])], procurement };
}

/** Canonical read projection shared by publication and feed revalidation. Never writes. */
export async function readLifecycleAlertConditions(project: LifecycleRow, session: ClientSession, at: Date): Promise<LifecycleAlertCondition[]> {
  const projectId = String(project._id); const result: LifecycleAlertCondition[] = [];
  const state = await ProcurementLifecycleStateModel.findOne({ projectId }).session(session).lean();
  if (project.status === "completed" && !state) return result;
  const timezone = state?.policy.timezone ?? "Asia/Kolkata"; const today = lcLocalDate(at, timezone);
  const add = (key: string, kind: ProcurementNotificationKind, entityId: string, tab: LifecycleTab, title: string, message: string, values = facts()) => result.push({ key, kind, entityId, tab, title, message, localDate: today, timezone, facts: values });
  const paymentSources = await listPaymentAlertSources(projectId, session, at);
  for (const source of paymentSources) {
    if (source.kind === "payment") {
      if (!source.dueDate || source.remainingPaise !== null && source.remainingPaise <= 0) continue;
      const window = procurementReminderWindow(source.dueDate, source.timezone, at); if (!window) continue;
      result.push({ key: source.id, kind: window.kind, entityId: source.orderId, tab: "payments", title: source.title,
        message: window.kind === "payment_overdue" ? "Vendor payment is overdue. Review the remaining balance and approval blockers." : window.kind === "payment_due" ? "Vendor payment is due today." : "Vendor payment is approaching its confirmed due date.",
        localDate: window.localDate, timezone: source.timezone, facts: facts(source.dueDate, source.remainingPaise, window.daysOverdue, source.blockers) });
      continue;
    }
    const correction = source.blockers.filter(blocker => blocker.code === "PAYMENT_CORRECTION_PENDING");
    const approvals = source.blockers.filter(blocker => /AUTHORIZATION|CERTIFICATION|ASSESSMENT/u.test(blocker.code));
    const setup = source.blockers.filter(blocker => !correction.includes(blocker) && !approvals.includes(blocker));
    for (const [kind, blockers, message] of [["payment_correction", correction, "Finance must review the payment correction request."], ["payment_approval", approvals, "Payment approval or certification needs action."], ["payment_setup", setup, "Confirm payment dates, issued scope, and historical amounts."]] as const) {
      if (blockers.length) result.push({ key: source.id, kind, entityId: source.orderId, tab: "payments", title: source.title, message,
        localDate: lcLocalDate(at, source.timezone), timezone: source.timezone, facts: facts(null, source.remainingPaise, 0, [...blockers]) });
    }
  }
  // Work checks stop at closeout. Payment corrections and retained balances above continue.
  if (project.status === "completed") return result;
  if (!state) {
    if (await ProjectPurchaseOrderModel.exists({ projectId, approvedRevisionId: { $type: "string" }, cancelledAt: null }).session(session)) add(`lifecycle:${projectId}`, "lifecycle_setup", projectId, "progress", "Procurement lifecycle setup required", "Set the review interval and project inspection policy.");
    return result;
  }
  const latest = await ProcurementReviewRoundModel.findOne({ projectId }).sort({ sequence: -1 }).session(session).lean() as LifecycleRow | null;
  if (latest && latest.status !== "submitted") {
    // A fresh submitted round resolves prior missed attention; the historical records remain.
    const missed = latest.status !== "paused" && at >= new Date(latest.effectiveDueAt) ? latest : await ProcurementReviewRoundModel.findOne({ projectId, status: "missed", sequence: { $lt: latest.sequence } }).sort({ sequence: -1 }).session(session).lean() as LifecycleRow | null;
    if (missed) add(`review:${missed._id}`, "review_missed", String(missed._id), "progress", "Procurement progress review missed", "Complete the current ordered review. Earlier missed rounds remain in history.", facts(lcLocalDate(new Date(missed.effectiveDueAt), timezone)));
    if (latest.status === "paused" && latest.lateBeforePause) add(`review:${latest._id}`, "review_missed", String(latest._id), "progress", "Review was overdue before the pause", "The pause does not remove the earlier missed deadline.", facts(lcLocalDate(new Date(latest.effectiveDueAt), timezone)));
  }
  if (latest) {
    const source = await readLifecycleSource(projectId, session);
    const currentItemIds = source.items.map(item => item.id);
    const observations = await ProcurementProgressCheckModel.aggregate([{ $match: { projectId, itemId: { $in: currentItemIds } } },
      { $sort: { submittedAt: -1, revision: -1 } }, { $group: { _id: "$itemId", observation: { $first: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$observation" } }]).session(session) as LifecycleRow[];
    const dueBefore = latest.status === "paused" && latest.pausedAt ? lcLocalDate(new Date(latest.pausedAt), timezone) : today;
    const seen = new Set<string>();
    for (const check of observations) {
      if (seen.has(check.itemId)) continue; seen.add(check.itemId);
      if (check.nextCheckDate < dueBefore && check.status !== "completed") add(`followup:${check.itemId}`, "review_followup", check.itemId, "progress", "Procurement follow-up overdue", check.nextAction, facts(check.nextCheckDate));
    }
  }
  const plan = await ProcurementInspectionPlanModel.findOne({ projectId }).session(session).lean();
  if (!plan) add(`inspection-plan:${projectId}`, "inspection_setup", projectId, "progress", "Inspection plan required", "Plan two or three physical inspections for this project.");
  else {
    const visits = await ProcurementInspectionVisitModel.find({ projectId, isOriginal: true }).select({ slotId: 1 }).session(session).lean();
    for (const slot of plan.slots) if (at > new Date(slot.originalPlannedAt) && !visits.some(visit => visit.slotId === slot.id)) add(`inspection:${slot.id}`, "inspection_missed", slot.id, "progress", "Planned physical inspection missed", "Record the visit and explain any delay. The original planned date remains in history.", facts(lcLocalDate(new Date(slot.originalPlannedAt), timezone)));
  }
  const findings = await ProcurementFindingModel.find({ projectId }).select({ snagId: 1 }).session(session).lean();
  const snags = await ProjectSnagModel.find({ projectId, _id: { $in: findings.map(finding => finding.snagId) }, status: { $ne: "verified" }, dueAt: { $lt: at } }).session(session).lean();
  for (const snag of snags) add(`finding:${snag._id}`, "finding_overdue", String(snag._id), "handover", snag.title, "The corrective action is overdue and still needs authorized verification.", facts(lcLocalDate(new Date(snag.dueAt!), timezone)));
  return result;
}

export async function readProcurementSchedulerHealth(at = new Date()): Promise<ProcurementSchedulerHealth> {
  const lease = await ProcurementLifecycleSchedulerLeaseModel.findById(PROCUREMENT_SCHEDULER_ID).lean();
  const eligible = { status: { $in: ["active", "on_hold", "completed"] } };
  const backlog = await ProjectModel.countDocuments({ ...eligible, ...(lease?.projectCursor ? { _id: { $gt: lease.projectCursor } } : {}) });
  const stopped = Boolean(lease?.stoppedAt && (!lease.startedAt || new Date(lease.stoppedAt) >= new Date(lease.startedAt)));
  const stale = !lease?.lastSweepAt || at.getTime() - new Date(lease.lastSweepAt).getTime() > 15 * 60000;
  return { status: stopped ? "stopped" : !lease?.lastAttemptAt ? "not_started" : stale || lease.failureCode ? "degraded" : "healthy", channel: "internal_feed", cadenceSeconds: lease?.cadenceSeconds ?? 60, targetDelaySeconds: 900,
    lastAttemptAt: iso(lease?.lastAttemptAt), lastSuccessAt: iso(lease?.lastSuccessAt), lastSweepAt: iso(lease?.lastSweepAt), backlog: lease?.projectCursor || !lease?.lastSweepAt ? backlog : 0, failureCode: lease?.failureCode ?? null };
}

async function requireFeedActor(actor: PublicUser, session: ClientSession): Promise<void> {
  if (!["procurement", "super_admin"].includes(actor.role)) lcMissing();
  if (!await UserModel.exists({ _id: actor.id, role: actor.role, active: true }).session(session)) lcMissing();
  if (actor.role === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }).session(session) !== 1) lcMissing();
}
async function feedScope(actor: PublicUser, session: ClientSession): Promise<Record<string, unknown>> {
  await requireFeedActor(actor, session);
  if (actor.role === "super_admin") return { recipientId: actor.id, recipientRole: actor.role };
  const assigned = await ProjectWorkflowTaskModel.aggregate([{ $match: { kind: "procurement", assigneeRole: "procurement", supersededAt: null } }, { $group: { _id: "$projectId", assignees: { $push: "$assigneeUserId" }, count: { $sum: 1 } } }, { $match: { count: 1, assignees: actor.id } }]).session(session);
  return { recipientId: actor.id, recipientRole: actor.role, projectId: { $in: assigned.map(row => row._id) } };
}

export function createProcurementLifecycleNotificationsService(deps: { now?: () => Date; readHealth?: () => Promise<ProcurementSchedulerHealth> } = {}) {
  const now = deps.now ?? (() => new Date()); const readHealth = deps.readHealth ?? (() => readProcurementSchedulerHealth(now()));
  return {
    async list(actor: PublicUser, query: unknown = {}): Promise<ProcurementNotificationPage> {
      const page = lcParse(procurementNotificationsQuery, query); const at = now();
      const result = await lcTransaction(async session => {
        const scope = await feedScope(actor, session);
        if (page.projectId) await requireLifecycleProject(actor, page.projectId, session, false, ["procurement", "super_admin"]);
        const filter = { ...scope, ...(page.projectId ? { projectId: page.projectId } : {}), ...(page.unreadOnly ? { readAt: null } : {}) };
        const rows = await ProcurementLifecycleNotificationModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(page.offset).limit(page.limit).session(session).lean() as LifecycleRow[];
        const total = await ProcurementLifecycleNotificationModel.countDocuments(filter).session(session);
        const unreadCount = await ProcurementLifecycleNotificationModel.countDocuments({ ...scope, ...(page.projectId ? { projectId: page.projectId } : {}), readAt: null }).session(session);
        const contexts = new Map<string, { project: LifecycleRow; conditions: LifecycleAlertCondition[] | null; responsibleName: string | null }>();
        for (const projectId of new Set(rows.map(row => row.projectId))) {
          const project = await requireLifecycleProject(actor, projectId, session, false, ["procurement", "super_admin"]);
          let conditions: LifecycleAlertCondition[] | null;
          try { conditions = await readLifecycleAlertConditions(project, session, at); } catch { conditions = null; }
          const recipients = await lifecycleAlertRecipients(projectId, session);
          if (conditions?.length && !recipients.procurement) conditions.push({ key: `assignment:${projectId}`, kind: "procurement_assignment", entityId: projectId, tab: "vendors", title: "Procurement assignment needs attention", message: "Assign one active Procurement person to this project.", localDate: lcLocalDate(at, "Asia/Kolkata"), timezone: "Asia/Kolkata", facts: facts() });
          contexts.set(projectId, { project, conditions, responsibleName: recipients.procurement?.name ?? null });
        }
        const items: ProcurementNotification[] = rows.map(row => {
          const context = contexts.get(row.projectId)!; const current = context.conditions?.find(condition => condition.key === row.conditionKey && condition.kind === row.kind);
          return { id: String(row._id), projectId: row.projectId, projectName: context.project.name, kind: row.kind, entityId: row.entityId, tab: row.tab,
            title: row.title, message: row.message, createdAt: iso(row.createdAt)!, readAt: iso(row.readAt), localDate: row.localDate,
            status: context.conditions === null ? "stale" : current ? "active" : "resolved", deepLink: procurementNotificationLink(actor.role, row.projectId, row.tab, row.entityId), responsibleName: context.responsibleName,
            snapshot: row.snapshot, current: current?.facts ?? null };
        });
        return { items, total, unreadCount, limit: page.limit, offset: page.offset, serverNow: at.toISOString() };
      });
      return { ...result, health: await readHealth() };
    },
    async read(actor: PublicUser, id: string): Promise<{ id: string; readAt: string }> {
      return lcTransaction(async session => {
        const scope = await feedScope(actor, session);
        const row = await ProcurementLifecycleNotificationModel.findOne({ ...scope, _id: id }).session(session).lean(); if (!row) lcMissing();
        await requireLifecycleProject(actor, row.projectId, session, true, ["procurement", "super_admin"], true);
        const at = row.readAt ?? now(); await ProcurementLifecycleNotificationModel.updateOne({ _id: id, recipientId: actor.id }, { $set: { readAt: at } }, { session });
        return { id, readAt: new Date(at).toISOString() };
      });
    },
    async health(actor: PublicUser): Promise<ProcurementSchedulerHealth> { await lcTransaction(session => requireFeedActor(actor, session)); return readHealth(); }
  };
}
