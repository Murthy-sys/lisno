import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { UserModel } from "../models/User.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import type { PublicUser } from "./auth.service.js";
import { vendorActivation } from "./vendor-readiness.service.js";

export function executionNotFound(): never {
  throw new ApiError(404, "EXECUTION_NOT_FOUND", "The requested project work is not available.");
}

export async function requireExecutionActor(actor: PublicUser, session?: ClientSession, mutation = false): Promise<void> {
  if (mutation && session) await AuthorizationCoordinationModel.updateOne({ _id: "authorization" },
    { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
  const user = await UserModel.findOne({ _id: actor.id, active: true, role: actor.role }).session(session ?? null).lean();
  if (!user || actor.role === "vendor" && (!actor.vendorId || user.vendorId !== actor.vendorId)) executionNotFound();
  if (!["vendor", "site_manager", "program_manager", "procurement", "super_admin"].includes(actor.role)) executionNotFound();
  if (actor.role === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }).session(session ?? null) !== 1) executionNotFound();
  if (actor.role === "vendor") {
    const bindings = await UserModel.find({ vendorId: actor.vendorId }).select({ _id: 1 }).limit(2).session(session ?? null).lean();
    if (bindings.length !== 1 || String(bindings[0]?._id) !== actor.id) executionNotFound();
    const vendor = await AiEstimatorKnowledgeVendorModel.findById(actor.vendorId).session(session ?? null).lean();
    if (!vendor || (await vendorActivation(vendor, session)).effectiveStatus !== "active") executionNotFound();
  }
}

export async function executionProjectIds(actor: PublicUser, session?: ClientSession): Promise<string[] | null> {
  await requireExecutionActor(actor, session);
  if (actor.role === "super_admin") return null;
  if (actor.role === "program_manager") {
    const rows = await ProjectModel.find({ programManagerId: actor.id }).select({ _id: 1 }).session(session ?? null).lean();
    return rows.map(row => String(row._id));
  }
  if (actor.role === "vendor") return [];
  const rows = await ProjectWorkflowTaskModel.find({ assigneeUserId: actor.id, assigneeRole: actor.role,
    kind: actor.role === "site_manager" ? "site_execution" : "procurement" }).select({ projectId: 1 }).session(session ?? null).lean();
  const projectIds = [...new Set(rows.map(row => String(row.projectId)))];
  if (actor.role !== "site_manager" || !projectIds.length) return projectIds;
  // Lists, live changes and notifications must use the same unique assignment as detail reads.
  const assignments = await ProjectWorkflowTaskModel.find({ projectId: { $in: projectIds }, assigneeRole: "site_manager", kind: "site_execution" })
    .select({ projectId: 1, assigneeUserId: 1 }).session(session ?? null).lean();
  const byProject = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const id = String(assignment.projectId);
    const matches = byProject.get(id) ?? [];
    matches.push(assignment); byProject.set(id, matches);
  }
  return projectIds.filter(id => {
    const matches = byProject.get(id);
    return matches?.length === 1 && matches[0]?.assigneeUserId === actor.id;
  });
}

export async function requireExecutionProject(actor: PublicUser, projectId: string, session?: ClientSession, mutation = false): Promise<Record<string, any>> {
  await requireExecutionActor(actor, session, mutation);
  if (actor.role === "vendor") executionNotFound();
  const project = await ProjectModel.findById(projectId).session(session ?? null).lean();
  if (!project) executionNotFound();
  if (actor.role === "super_admin") return project;
  if (actor.role === "program_manager") {
    if (project.programManagerId !== actor.id) executionNotFound();
    return project;
  }
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, assigneeRole: actor.role,
    kind: actor.role === "site_manager" ? "site_execution" : "procurement" }).select({ assigneeUserId: 1 }).limit(2).session(session ?? null).lean();
  if (tasks.length !== 1 || tasks[0]?.assigneeUserId !== actor.id) executionNotFound();
  return project;
}
