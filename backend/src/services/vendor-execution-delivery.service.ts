import { ExecutionDailyObligationModel, ExecutionReportingCursorModel } from "../models/ExecutionDailyObligation.js";
import { ExecutionNotificationAssignmentModel, ExecutionNotificationModel, ExecutionSchedulerLeaseModel } from "../models/ExecutionNotification.js";
import { ExecutionReportingPolicyHeadModel, ExecutionReportingPolicyModel } from "../models/ExecutionReportingPolicy.js";
import type { AuditService } from "./audit.service.js";
import type { AuthService } from "./auth.service.js";
import type { ExecutionDigestMailer } from "./execution-digest-mailer.js";
import { createExecutionDigestDispatcher } from "./execution-digest-dispatcher.js";
import { createExecutionNotifications } from "./execution-notifications.js";
import { readExecutionDaily } from "./execution-obligations.js";
import { createExecutionReportingPolicy } from "./execution-reporting-policy.js";
import { createExecutionReminderScheduler } from "./execution-reminder-scheduler.js";
import { createExecutionStream } from "./execution-stream.js";

export const executionDeliveryModels = [ExecutionDailyObligationModel, ExecutionReportingCursorModel, ExecutionNotificationModel, ExecutionNotificationAssignmentModel, ExecutionSchedulerLeaseModel, ExecutionReportingPolicyHeadModel, ExecutionReportingPolicyModel];
export function createVendorExecutionDeliveryService(options: { audit: AuditService; auth: AuthService; mailer?: ExecutionDigestMailer; now?: () => Date; enabled?: boolean; pollIntervalMs?: number; allowDemoAccountExternalEmail?: boolean }) {
  const now = options.now ?? (() => new Date());
  const policy = createExecutionReportingPolicy({ audit: options.audit, now });
  const dependencies = { audit: options.audit, now, policyForProject: policy.policyForProject };
  const scheduler = createExecutionReminderScheduler(dependencies);
  const dispatcher = createExecutionDigestDispatcher({ ...dependencies, mailer: options.mailer ?? { deliveryKind: "disabled" }, allowDemoAccountExternalEmail: options.allowDemoAccountExternalEmail });
  const stream = createExecutionStream({ auth: options.auth });
  let running: Promise<void> | undefined, timer: ReturnType<typeof setInterval> | undefined, stopped = false;
  const runOnce = () => {
    if (stopped || !options.enabled) return Promise.resolve();
    if (running) return running;
    running = (async () => { if (await scheduler.runBatch()) await dispatcher.runBatch(); })().finally(() => { running = undefined; });
    return running;
  };
  return {
    ...policy, ...createExecutionNotifications(now), dailyForAssignment: readExecutionDaily, openStream: stream.openStream, runOnce,
    start() { if (stopped || timer || !options.enabled) return; timer = setInterval(() => { void runOnce().catch(() => {}); }, options.pollIntervalMs ?? 30000); timer.unref(); void runOnce().catch(() => {}); },
    async stop() { stopped = true; if (timer) clearInterval(timer); await stream.stop(); await running?.catch(() => {}); },
    async health() {
      const row = await ExecutionSchedulerLeaseModel.findById("reporting").lean();
      const pending = await ExecutionNotificationModel.countDocuments({ deliveryStatus: { $in: ["pending", "sending", "unavailable"] } });
      const failed = await ExecutionNotificationModel.countDocuments({ deliveryStatus: "failed" });
      const oldest = await ExecutionNotificationModel.findOne({ deliveryStatus: { $in: ["pending", "sending"] } }).sort({ createdAt: 1 }).select({ createdAt: 1 }).lean();
      return { enabled: Boolean(options.enabled), running: Boolean(running), lastSuccessAt: row?.lastSuccessAt ? new Date(row.lastSuccessAt).toISOString() : null, lastAttemptAt: row?.lastAttemptAt ? new Date(row.lastAttemptAt).toISOString() : null, failureCode: row?.failureCode ?? null, pending, failed, oldestPendingAt: oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : null, ...stream.health() };
    }
  };
}
