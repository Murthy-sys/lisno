import { randomUUID } from "node:crypto";
import { isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import { executionLocalDate } from "../domain/vendor-execution.js";
import { ApiError } from "../middleware/errors.js";
import { ExecutionNotificationModel } from "../models/ExecutionNotification.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import type { PublicUser } from "./auth.service.js";
import type { ExecutionDigestMail, ExecutionDigestMailer } from "./execution-digest-mailer.js";
import { executionRecipientScope } from "./execution-notifications.js";
import { readExecutionDaily, reportingContext, type ReportingRow } from "./execution-obligations.js";
import { executionEscalationReasons, type SchedulerDependencies } from "./execution-reminder-scheduler.js";

export function createExecutionDigestDispatcher(options: SchedulerDependencies & { mailer: ExecutionDigestMailer; allowDemoAccountExternalEmail?: boolean }) {
  return {
    async runBatch() {
      // A crash during the final delivery attempt must not leave a permanent
      // sending lease that neither the dispatcher nor operations can resolve.
      await ExecutionNotificationModel.updateMany({ deliveryStatus: "sending", attempts: { $gte: 4 }, leaseExpiresAt: { $lte: options.now() } }, { $set: { deliveryStatus: "failed", failureCode: "DELIVERY_LEASE_EXPIRED", leaseToken: null, leaseExpiresAt: null, updatedAt: options.now() } });
      for (let count = 0; count < 25; count++) {
        const at = options.now(), token = randomUUID();
        const row = await ExecutionNotificationModel.findOneAndUpdate({ $or: [{ deliveryStatus: { $in: ["pending", "unavailable"] }, nextAttemptAt: { $lte: at } }, { deliveryStatus: "sending", leaseExpiresAt: { $lte: at } }], attempts: { $lt: 4 } }, { $set: { deliveryStatus: "sending", leaseToken: token, leaseExpiresAt: new Date(at.getTime() + 900000), updatedAt: at }, $inc: { attempts: 1 } }, { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" }).lean() as ReportingRow | null;
        if (!row) return;
        const finish = async (status: string, failureCode: string | null = null) => {
          await ExecutionNotificationModel.updateOne({ _id: row._id, leaseToken: token }, { $set: { deliveryStatus: status, failureCode, leaseToken: null, leaseExpiresAt: null, updatedAt: options.now(), sentAt: status === "sent" ? options.now() : null, nextAttemptAt: new Date(options.now().getTime() + (status === "unavailable" ? 300000 : 30000 * 2 ** (row.attempts - 1))) }, ...(status === "unavailable" ? { $inc: { attempts: -1 } } : {}) });
        };
        if (executionLocalDate(at, row.timezone) !== row.localDate) { await finish("suppressed", "STALE_REPORTING_DAY"); continue; }
        if (options.mailer.deliveryKind === "disabled") { await finish("unavailable", "EMAIL_DISABLED"); continue; }
        const account = await UserModel.findOne({ _id: row.recipientId, active: true }).lean() as ReportingRow | null;
        if (!account) { await finish("suppressed", "RECIPIENT_UNAVAILABLE"); continue; }
        if (options.mailer.deliveryKind === "external" && !options.allowDemoAccountExternalEmail && isReservedDevelopmentDemoIdentity({ id: String(account._id), emailNormalized: account.emailNormalized, accountKind: account.accountKind })) { await finish("suppressed", "DEMO_EXTERNAL_DELIVERY_BLOCKED"); continue; }
        const actor = { id: String(account._id), name: account.name, email: account.email, role: account.role, vendorId: account.vendorId } as PublicUser;
        try {
          const scope = await executionRecipientScope(actor);
          if (!await ExecutionNotificationModel.exists({ _id: row._id, ...scope, leaseToken: token, leaseExpiresAt: { $gt: options.now() } })) { await finish("suppressed", "RECIPIENT_UNAVAILABLE"); continue; }
        } catch (error) {
          if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status)) throw error;
          await finish("suppressed", "RECIPIENT_UNAVAILABLE"); continue;
        }
        const items: ExecutionDigestMail["items"] = [];
        let projectName = row.projectId;
        for (const saved of row.items) {
          const assignment = await VendorWorkAssignmentModel.findOne({ _id: saved.assignmentId, projectId: row.projectId, ...(actor.role === "vendor" ? { vendorId: actor.vendorId } : {}) }).lean() as ReportingRow | null;
          const state = assignment ? await VendorExecutionStateModel.findById(assignment._id).lean() as ReportingRow | null : null;
          if (!assignment || !state) continue;
          const context = await reportingContext(assignment, state);
          if (!context.current || !context.project || context.project.status !== "active") continue;
          const policy = await options.policyForProject(row.projectId, undefined, options.now());
          const daily = await readExecutionDaily(assignment, state, policy, options.now());
          let reasons: string[];
          if (row.kind === "daily_reminder") {
            if (!context.eligible || context.account?._id !== actor.id || daily.state !== "due") continue;
            reasons = ["Daily work update due"];
          } else {
            reasons = await executionEscalationReasons(assignment, state, policy, options.now());
            if (!reasons.length) continue;
          }
          projectName = context.project.name;
          const order = await ProjectPurchaseOrderModel.findById(assignment.orderId).select({ orderNumber: 1 }).lean();
          items.push({ assignmentId: String(assignment._id), itemName: assignment.itemName, orderNumber: order?.orderNumber ?? assignment.orderId, status: state.status, progress: state.progress, dueAt: daily.dueAt, reasons });
        }
        if (!items.length) { await finish("suppressed", "NO_CURRENT_ACTION"); continue; }
        // Recheck authority and the exact destination after building the digest;
        // unrelated work must not extend a lease or deliver to a stale address.
        const recipient = await UserModel.exists({ _id: actor.id, active: true, role: actor.role, email: account.email, ...(actor.role === "vendor" ? { vendorId: actor.vendorId } : {}) });
        let currentScope: Record<string, any>;
        try { currentScope = await executionRecipientScope(actor); }
        catch (error) {
          if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status)) throw error;
          await finish("suppressed", "RECIPIENT_UNAVAILABLE"); continue;
        }
        if (!recipient || !await ExecutionNotificationModel.exists({ _id: row._id, ...currentScope })) { await finish("suppressed", "RECIPIENT_UNAVAILABLE"); continue; }
        if (!await ExecutionNotificationModel.exists({ _id: row._id, leaseToken: token, leaseExpiresAt: { $gt: options.now() } })) continue;
        const input: ExecutionDigestMail = { notificationId: String(row._id), recipient: { name: account.name, email: account.email }, projectId: row.projectId, projectName, kind: row.kind, localDate: row.localDate, timezone: row.timezone, vendor: actor.role === "vendor", items, overflowCount: row.overflowCount ?? 0 };
        let failed = false;
        try { await options.mailer.sendDigest(input); } catch { failed = true; }
        // A failed persistence after provider acceptance retains the lease for recovery.
        await finish(failed ? row.attempts >= 4 ? "failed" : "pending" : "sent", failed ? "EXECUTION_EMAIL_FAILED" : null);
      }
    }
  };
}
