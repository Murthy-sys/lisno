import mongoose, { type ClientSession } from "mongoose";
import type { ExecutionNotificationPage } from "../contracts/vendor-execution.js";
import { ExecutionNotificationModel } from "../models/ExecutionNotification.js";
import { ProjectModel } from "../models/Project.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import type { PublicUser } from "./auth.service.js";
import { executionNotFound, executionProjectIds, requireExecutionActor } from "./vendor-execution-access.js";
import { appendExecutionChange } from "./execution-change-events.js";

export async function executionRecipientScope(actor: PublicUser, session?: ClientSession): Promise<Record<string, any>> {
  await requireExecutionActor(actor, session);
  if (actor.role === "vendor") {
    const projects = await VendorWorkAssignmentModel.distinct("projectId", { vendorId: actor.vendorId, status: { $ne: "superseded" } }).session(session ?? null);
    return { recipientId: actor.id, vendorId: actor.vendorId, projectId: { $in: projects } };
  }
  const ids = await executionProjectIds(actor, session);
  return { recipientId: actor.id, ...(ids === null ? {} : { projectId: { $in: ids } }) };
}
export function createExecutionNotifications(now: () => Date) {
  return {
    async notifications(actor: PublicUser, query: { limit?: number; offset?: number }): Promise<ExecutionNotificationPage> {
      return mongoose.connection.transaction(async session => {
        const scope = await executionRecipientScope(actor, session);
        const limit = Math.min(100, Math.max(1, query.limit ?? 50)), offset = Math.min(100000, Math.max(0, query.offset ?? 0));
        const rows = await ExecutionNotificationModel.find(scope).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).session(session).lean();
        const total = await ExecutionNotificationModel.countDocuments(scope).session(session);
        const unreadCount = await ExecutionNotificationModel.countDocuments({ ...scope, readAt: null }).session(session);
        const names = await ProjectModel.find({ _id: { $in: rows.map(row => row.projectId) } }).select({ name: 1 }).session(session).lean();
        return { items: rows.map(row => ({ id: String(row._id), projectId: row.projectId, projectName: names.find(p => p._id === row.projectId)?.name ?? row.projectId, kind: row.kind, title: row.kind === "daily_reminder" ? "Daily work update due" : "Project work needs attention", assignmentIds: row.items.map((item: { assignmentId: string }) => item.assignmentId), createdAt: new Date(row.createdAt).toISOString(), readAt: row.readAt ? new Date(row.readAt).toISOString() : null, deliveryStatus: row.deliveryStatus })), total, unreadCount, limit, offset };
      });
    },
    async readNotification(actor: PublicUser, id: string) {
      return mongoose.connection.transaction(async session => {
        await requireExecutionActor(actor, session, true);
        const scope = await executionRecipientScope(actor, session);
        const row = await ExecutionNotificationModel.findOne({ ...scope, _id: id }).session(session).lean();
        if (!row) executionNotFound();
        const at = row.readAt ? new Date(row.readAt) : now();
        await ExecutionNotificationModel.updateOne({ ...scope, _id: id }, { $set: { readAt: at, updatedAt: at } }, { session });
        await appendExecutionChange({ projectId: row.projectId, vendorId: row.vendorId, version: 0, kind: "notification_read", occurredAt: now() }, session);
        return { readAt: at.toISOString() };
      });
    }
  };
}
