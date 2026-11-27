import { randomUUID } from "node:crypto";
import { lcDigest, lcLocalDate } from "../domain/procurement-lifecycle.js";
import { ProcurementLifecycleNotificationModel } from "../models/ProcurementLifecycleNotification.js";
import { ProcurementLifecycleSchedulerLeaseModel } from "../models/ProcurementLifecycleSchedulerLease.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import type { ProcurementSchedulerHealth } from "../contracts/procurement-notifications.js";
import { lcTransaction, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";
import type { LifecycleRow } from "./procurement-lifecycle/access.js";
import { ensureReviewRoundInSession } from "./procurement-progress.service.js";
import { lifecycleAlertRecipients, PROCUREMENT_SCHEDULER_ID, readLifecycleAlertConditions, readProcurementSchedulerHealth } from "./procurement-lifecycle-notifications.service.js";

export interface ProcurementSchedulerDependencies extends LifecycleDependencies {
  cleanupEvidence?: () => Promise<void>;
  batchSize?: number; leaseMs?: number; intervalMs?: number; token?: () => string;
  /** Integration-test fault boundary; production does not supply it. */
  beforeProject?: (projectId: string) => Promise<void>;
}
export interface ProcurementSchedulerBatch { acquired: boolean; processed: number; wrapped: boolean; }
class LeaseLost extends Error {}
const eligibleProjects = { status: { $in: ["active", "on_hold", "completed"] } };

export function createProcurementLifecycleScheduler(deps: ProcurementSchedulerDependencies) {
  const now = deps.now ?? (() => new Date()); const token = deps.token ?? randomUUID;
  const batchSize = Math.max(1, Math.min(100, Math.trunc(deps.batchSize ?? 25)));
  const leaseMs = Math.max(1000, Math.min(300000, deps.leaseMs ?? 120000));
  const intervalMs = Math.max(1000, Math.min(300000, deps.intervalMs ?? 60000));
  let timer: ReturnType<typeof setTimeout> | null = null; let started = false; let inFlight: Promise<ProcurementSchedulerBatch> | null = null; let starting: Promise<void> | null = null;

  async function initialize(): Promise<void> {
    try {
      await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID }, { $setOnInsert: { expiresAt: new Date(0), cadenceSeconds: intervalMs / 1000 } }, { upsert: true });
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  }
  async function processProject(projectId: string, leaseToken: string): Promise<void> {
    await deps.beforeProject?.(projectId);
    await lcTransaction(async session => {
      const at = now();
      const lease = await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID, token: leaseToken, expiresAt: { $gt: at } }, { $set: { expiresAt: new Date(at.getTime() + leaseMs) } }, { session });
      if (!lease.matchedCount) throw new LeaseLost();
      // Coordinate with payment/closeout and identity mutations before deriving any alert.
      await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 }, $set: { updatedAt: at } }, { session, upsert: true });
      const project = await ProjectModel.findOneAndUpdate({ _id: projectId, ...eligibleProjects }, { $inc: { siteCompletionFenceEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean() as LifecycleRow | null;
      if (project) {
        await ProjectWorkflowTaskModel.updateMany({ projectId, kind: "procurement", supersededAt: null }, { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false });
        if (project.status !== "completed") await ensureReviewRoundInSession(projectId, session, at);
        const conditions = await readLifecycleAlertConditions(project, session, at);
        const people = await lifecycleAlertRecipients(projectId, session);
        if (!people.procurement && conditions.length) {
          const state = await ProcurementLifecycleStateModel.findOne({ projectId }).session(session).lean(); const timezone = state?.policy.timezone ?? "Asia/Kolkata";
          conditions.push({ key: `assignment:${projectId}`, kind: "procurement_assignment", entityId: projectId, tab: "vendors", title: "Procurement assignment needs attention", message: "Assign exactly one active Procurement person. Existing signed history remains attributed to its original actor.", localDate: lcLocalDate(at, timezone), timezone,
            facts: { dueDate: null, remainingPaise: null, daysOverdue: 0, blockers: [] } });
        }
        await ProcurementLifecycleNotificationModel.updateMany({ projectId, resolvedAt: null,
          ...(conditions.length ? { $nor: conditions.map(condition => ({ conditionKey: condition.key, kind: condition.kind })) } : {}) },
          { $set: { resolvedAt: at, lastEvaluatedAt: at } }, { session });
        for (const condition of conditions) for (const recipient of people.recipients) {
          const id = `proc-notification-${lcDigest([String(recipient._id), projectId, condition.key, condition.kind, condition.localDate])}`;
          const existing = await ProcurementLifecycleNotificationModel.findById(id).session(session).lean();
          if (existing) {
            await ProcurementLifecycleNotificationModel.updateOne({ _id: id }, { $set: { resolvedAt: null, lastEvaluatedAt: at } }, { session });
            continue;
          }
          await ProcurementLifecycleNotificationModel.create([{ _id: id, recipientId: String(recipient._id), recipientRole: recipient.role, projectId, entityId: condition.entityId, conditionKey: condition.key,
            kind: condition.kind, tab: condition.tab, localDate: condition.localDate, timezone: condition.timezone, title: condition.title, message: condition.message,
            snapshot: condition.facts, createdAt: at, createdById: "system:procurement-lifecycle-scheduler", lastEvaluatedAt: at }], { session });
          await deps.audit.appendInMongoTransaction({ actorId: "system:procurement-lifecycle-scheduler", action: "procurement_lifecycle_action_recorded", entityType: "procurement_lifecycle_notification", entityId: id, occurredAt: at.toISOString(), newValues: { projectId, kind: condition.kind, recipientId: String(recipient._id), localDate: condition.localDate } }, session);
        }
      }
      const saved = await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID, token: leaseToken, expiresAt: { $gt: now() } }, { $set: { projectCursor: projectId, lastSuccessAt: now(), failureCode: null }, $inc: { processedCount: 1 } }, { session });
      if (!saved.matchedCount) throw new LeaseLost();
    });
  }
  async function runBatch(): Promise<ProcurementSchedulerBatch> {
    await initialize(); const at = now(), leaseToken = token();
    const lease = await ProcurementLifecycleSchedulerLeaseModel.findOneAndUpdate({ _id: PROCUREMENT_SCHEDULER_ID, expiresAt: { $lte: at } }, { $set: { token: leaseToken, expiresAt: new Date(at.getTime() + leaseMs), lastAttemptAt: at, stoppedAt: null, cadenceSeconds: intervalMs / 1000 } }, { returnDocument: "after" }).lean();
    if (!lease) return { acquired: false, processed: 0, wrapped: false };
    let processed = 0;
    try {
      const rows = await ProjectModel.find({ ...eligibleProjects, ...(lease.projectCursor ? { _id: { $gt: lease.projectCursor } } : {}) }).select({ _id: 1 }).sort({ _id: 1 }).limit(batchSize + 1).lean();
      const batch = rows.slice(0, batchSize);
      for (const project of batch) { await processProject(String(project._id), leaseToken); processed++; }
      const wrapped = rows.length <= batchSize; const finished = now();
      const released = await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID, token: leaseToken, expiresAt: { $gt: finished } }, { $set: { token: null, expiresAt: finished, lastSuccessAt: finished, failureCode: null,
        ...(wrapped ? { projectCursor: null, lastSweepAt: finished } : {}) } });
      if (!released.matchedCount) throw new LeaseLost();
      return { acquired: true, processed, wrapped };
    } catch (error) {
      await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID, token: leaseToken }, { $set: { token: null, expiresAt: now(), lastFailureAt: now(), failureCode: error instanceof LeaseLost ? "LEASE_EXPIRED" : "SCHEDULER_BATCH_FAILED" } });
      if (error instanceof LeaseLost) return { acquired: false, processed, wrapped: false };
      throw error;
    } finally {
      // Storage recovery is bounded and cannot suppress successful reminder delivery.
      try { await deps.cleanupEvidence?.(); } catch { /* Durable cleanup rows remain for the next sweep. */ }
    }
  }
  function runOnce(): Promise<ProcurementSchedulerBatch> {
    if (!inFlight) inFlight = runBatch().finally(() => { inFlight = null; });
    return inFlight;
  }
  function schedule(delay: number): void {
    if (!started) return; if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runOnce().then(result => schedule(result.acquired && !result.wrapped ? 0 : intervalMs), () => schedule(intervalMs));
    }, delay); timer.unref?.();
  }
  return {
    runOnce,
    health: (): Promise<ProcurementSchedulerHealth> => readProcurementSchedulerHealth(now()),
    start(): void {
      if (started) return; started = true;
      starting = initialize().then(async () => { await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID }, { $set: { startedAt: now(), stoppedAt: null } }); }).then(() => schedule(0), () => schedule(intervalMs));
    },
    wake(): void { if (started) schedule(0); },
    async stop(): Promise<void> {
      if (!started && !timer && !inFlight && !starting) return;
      started = false; if (timer) clearTimeout(timer); timer = null;
      await starting;
      starting = null;
      try { await inFlight; } catch { /* Failure health is already durable. */ }
      await ProcurementLifecycleSchedulerLeaseModel.updateOne({ _id: PROCUREMENT_SCHEDULER_ID }, { $set: { stoppedAt: now() } });
    }
  };
}
