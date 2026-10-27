import { resolveProjectManagerAssignment } from "../project-manager-assignment.service.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { ApiError } from "../../middleware/errors.js";
import { ProjectModel } from "../../models/Project.js";
import { UserModel } from "../../models/User.js";
import { ProjectWorkflowTaskModel } from "../../models/ProjectWorkflowTask.js";
import { AuthorizationCoordinationModel } from "../../models/AuthorizationCoordination.js";
import { ProjectManagerEventModel } from "../../models/ProjectManagerEvent.js";
import type { PublicUser } from "../auth.service.js";
import type { AuditService } from "../audit.service.js";
import { appendExecutionChange } from "../execution-change-events.js";
import type { PMPanel, PMTab, PMHistory } from "../../contracts/project-manager.js";

export type PMRow = Record<string, any>;
export interface PMDependencies { audit: AuditService; now?: () => Date; }
export const pmCommandBase = { expectedVersion: z.number().int().min(0), idempotencyKey: z.string().trim().min(8).max(128) };
export const pmReason = z.string().trim().min(3).max(2000);
export const pmId = z.string().trim().min(1).max(160);
export const pmEvidenceIds = z.array(pmId).max(12).default([]);
export const pmDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const pmNewId = (family: string): string => `pm-${family}-${randomUUID()}`;
export function pmMissing(): never { throw new ApiError(404, "PM_NOT_FOUND", "The requested project record is not available."); }
export function pmConflict(message = "This record changed. Refresh and try again."): never { throw new ApiError(409, "PM_CONFLICT", message); }
export function pmTransaction<T>(run: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(run, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
}
/** Every read rechecks current assignment. Commands fence assignment/user changes in their transaction. */
export async function requirePMProject(actor: PublicUser, projectId: string, session?: ClientSession, mutation = false, roles: readonly string[] = ["site_manager"]): Promise<PMRow> {
  if (mutation && !session?.inTransaction()) throw new Error("PM mutations require a transaction.");
  if (mutation) await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
  const user = await UserModel.findOne({ _id: actor.id, active: true, role: actor.role }).session(session ?? null).lean();
  if (!user || !roles.includes(actor.role)) pmMissing();
  const project = mutation
    ? await ProjectModel.findOneAndUpdate({ _id: projectId }, { $inc: { siteCompletionFenceEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean()
    : await ProjectModel.findById(projectId).session(session ?? null).lean();
  if (!project) pmMissing();
  const ownership = await resolveProjectManagerAssignment(projectId, session);
  if (actor.role === "super_admin") { if (await UserModel.countDocuments({ role: "super_admin", active: true }).session(session ?? null) !== 1) pmMissing(); }
  else if (actor.role === "site_manager") {
    if (ownership.state !== "assigned" || ownership.ownerId !== actor.id) pmMissing();
  }
  else if (actor.role === "designer") { if (!(project.assignedDesignerIds ?? []).includes(actor.id)) pmMissing(); }
  else if (actor.role === "client") { if (project.clientId !== actor.id) pmMissing(); }
  else if (actor.role === "design_manager" || actor.role === "design_head") { if (project.managerId !== actor.id) pmMissing(); }
  else if (actor.role === "vendor") { if (!actor.vendorId || user.vendorId !== actor.vendorId) pmMissing(); }
  else {
    const kind = actor.role === "procurement" ? "procurement" : "finance";
    const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind, assigneeRole: actor.role, supersededAt: null }).session(session ?? null).lean();
    if (tasks.length !== 1 || tasks[0]?.assigneeUserId !== actor.id) pmMissing();
    if (mutation) await ProjectWorkflowTaskModel.updateOne({ _id: tasks[0]!._id }, { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false });
  }
  return { ...project, currentProjectManagerId: ownership.state === "assigned" ? ownership.ownerId : null };
}
export async function pmReplay(projectId: string, actor: PublicUser, key: string, payload: unknown, session: ClientSession): Promise<unknown | undefined> {
  const old = await ProjectManagerEventModel.findOne({ projectId, actorId: actor.id, idempotencyKey: key }).session(session).lean();
  if (!old) return undefined;
  if (old.digest !== pmDigest(payload)) pmConflict("This command key was already used for a different action.");
  return old.result;
}
export async function pmRecord(deps: PMDependencies, input: { projectId: string; entityId: string; family: string; actor: PublicUser; key: string; payload: unknown; action: string; version: number; reason?: string | null; result: unknown; recipientIds?: string[] }, session: ClientSession): Promise<void> {
  const at = (deps.now ?? (() => new Date()))();
  await ProjectManagerEventModel.create([{ _id: pmNewId("event"), projectId: input.projectId, entityId: input.entityId, family: input.family, actorId: input.actor.id, actorName: input.actor.name,
    idempotencyKey: input.key, digest: pmDigest(input.payload), action: input.action, reason: input.reason ?? null, version: input.version, occurredAt: at, result: input.result,
    recipientIds: [...new Set(input.recipientIds ?? [])].filter(id => id !== input.actor.id) }], { session });
  await deps.audit.appendInMongoTransaction({ actorId: input.actor.id, action: "project_manager_action_recorded", entityType: input.family, entityId: input.entityId,
    occurredAt: at.toISOString(), newValues: { projectId: input.projectId, action: input.action, version: input.version }, reason: input.reason ?? null }, session);
  await appendExecutionChange({ projectId: input.projectId, version: input.version, kind: `pm.${input.family}.${input.action}`, occurredAt: at }, session);
}
export async function pmHistory(projectId: string, entityId: string, session?: ClientSession): Promise<PMHistory[]> {
  const rows = await ProjectManagerEventModel.find({ projectId, entityId }).sort({ occurredAt: -1, version: -1, _id: 1 }).limit(30).session(session ?? null).lean();
  return rows.map(row => ({ id: String(row._id), action: row.action, actorName: row.actorName, at: new Date(row.occurredAt).toISOString(), reason: row.reason ?? null }));
}
export const pmPanel = (tab: PMTab, at = new Date()): PMPanel => ({ tab, availability: "no_data", calculatedAt: at.toISOString(), items: [], total: 0, issues: [], sources: [], people: [], actions: [] });
