import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import type { ExecutionPolicy } from "../contracts/vendor-execution.js";
import { defaultExecutionPolicy, executionCutoff, executionDigest, executionLocalDate, nextExecutionDate } from "../domain/vendor-execution.js";
import { ApiError } from "../middleware/errors.js";
import { ExecutionReportingPolicyHeadModel, ExecutionReportingPolicyModel } from "../models/ExecutionReportingPolicy.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { appendExecutionChange } from "./execution-change-events.js";
import { requireExecutionProject } from "./vendor-execution-access.js";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const executionPolicySchema = z.object({
  expectedVersion: z.number().int().min(0), idempotencyKey: z.string().trim().min(8).max(128), reason: z.string().trim().min(1).max(2000),
  timezone: z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use a valid IANA timezone."),
  reminderTime: time, deadlineTime: time, escalationTime: time, effectiveDate: date
}).strict().refine(v => v.reminderTime < v.deadlineTime && v.deadlineTime < v.escalationTime, { message: "Reminder, deadline and escalation must be in that order.", path: ["escalationTime"] });
function dto(row: Record<string, any>): ExecutionPolicy { return { projectId: row.projectId, version: row.version, timezone: row.timezone, reminderTime: row.reminderTime, deadlineTime: row.deadlineTime, escalationTime: row.escalationTime, effectiveDate: row.effectiveDate }; }
export function createExecutionReportingPolicy(options: { audit: AuditService; now: () => Date }) {
  const policyForProject = async (projectId: string, session?: ClientSession, at = options.now()): Promise<ExecutionPolicy> => {
    const row = await ExecutionReportingPolicyModel.findOne({ projectId, effectiveAt: { $lte: at } }).sort({ version: -1 }).session(session ?? null).lean();
    return row ? dto(row) : defaultExecutionPolicy(projectId, at);
  };
  return {
    policyForProject,
    async readPolicy(actor: PublicUser, projectId: string) {
      await requireExecutionProject(actor, projectId);
      // Return the latest saved revision for editing, including a pending future revision.
      const row = await ExecutionReportingPolicyModel.findOne({ projectId }).sort({ version: -1 }).lean();
      return row ? dto(row) : defaultExecutionPolicy(projectId, options.now());
    },
    async savePolicy(actor: PublicUser, projectId: string, raw: unknown) {
      const input = executionPolicySchema.parse(raw);
      return mongoose.connection.transaction(async session => {
        await requireExecutionProject(actor, projectId, session, true);
        if (!["site_manager", "program_manager", "super_admin"].includes(actor.role)) throw new ApiError(403, "EXECUTION_POLICY_FORBIDDEN", "This account cannot change reporting policy.");
        const digest = executionDigest(input);
        const receipt = await ExecutionReportingPolicyModel.findOne({ projectId, actorId: actor.id, idempotencyKey: input.idempotencyKey }).session(session).lean();
        if (receipt) {
          if (receipt.requestDigest !== digest) throw new ApiError(409, "EXECUTION_POLICY_CONFLICT", "This request key was already used for another change.");
          return dto(receipt);
        }
        const at = options.now();
        const current = await policyForProject(projectId, session, at);
        const earliestDate = [nextExecutionDate(executionLocalDate(at, current.timezone)), nextExecutionDate(executionLocalDate(at, input.timezone))].sort().at(-1)!;
        if (input.effectiveDate < earliestDate) throw new ApiError(400, "EXECUTION_POLICY_PROSPECTIVE", "Policy changes start on a future full reporting day.");
        const latest = await ExecutionReportingPolicyModel.findOne({ projectId }).sort({ version: -1 }).session(session).lean();
        if ((latest?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, "EXECUTION_POLICY_CONFLICT", "Reporting policy changed. Refresh and retry.");
        if (latest && input.effectiveDate < latest.effectiveDate) throw new ApiError(400, "EXECUTION_POLICY_PROSPECTIVE", "A revision cannot precede the last scheduled policy revision.");
        const version = input.expectedVersion + 1;
        if (input.expectedVersion === 0) await ExecutionReportingPolicyHeadModel.create([{ _id: projectId, version, updatedAt: at }], { session });
        else {
          const update = await ExecutionReportingPolicyHeadModel.updateOne({ _id: projectId, version: input.expectedVersion }, { $set: { version, updatedAt: at } }, { session });
          if (!update.matchedCount) throw new ApiError(409, "EXECUTION_POLICY_CONFLICT", "Reporting policy changed. Refresh and retry.");
        }
        const [row] = await ExecutionReportingPolicyModel.create([{ _id: `${projectId}:${version}`, projectId, version, timezone: input.timezone, reminderTime: input.reminderTime, deadlineTime: input.deadlineTime, escalationTime: input.escalationTime, effectiveDate: input.effectiveDate, effectiveAt: executionCutoff(input.effectiveDate, "00:00", input.timezone), actorId: actor.id, idempotencyKey: input.idempotencyKey, requestDigest: digest, reason: input.reason, createdAt: at }], { session });
        await options.audit.appendInMongoTransaction({ actorId: actor.id, action: "vendor_execution_policy_updated", entityType: "project", entityId: projectId, occurredAt: at.toISOString(), oldValues: { version: input.expectedVersion }, newValues: { version, timezone: input.timezone, effectiveDate: input.effectiveDate, reminderTime: input.reminderTime, deadlineTime: input.deadlineTime, escalationTime: input.escalationTime }, reason: input.reason }, session);
        await appendExecutionChange({ projectId, assignmentId: null, vendorId: null, version, kind: "reporting_policy", occurredAt: at }, session);
        return dto(row!.toObject());
      });
    }
  };
}
