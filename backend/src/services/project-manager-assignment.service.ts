import type { ClientSession } from "mongoose";
import { classifyProjectManagerAssignment, type ProjectManagerAssignment, type ProjectManagerAssignmentFacts,
  type ProjectManagerSourceFact, type ProjectManagerTaskFact } from "../domain/project-manager-assignment.js";
import { ApiError } from "../middleware/errors.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { EstimateModel } from "../models/Estimate.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { SiteCompletionReviewModel } from "../models/SiteCompletionReview.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import { appendExecutionChange } from "./execution-change-events.js";

type Row = Record<string, any>;
export function projectManagerTaskFact(row: Row): ProjectManagerTaskFact {
  return { id: String(row._id ?? row.id), projectId: String(row.projectId), estimateId: String(row.estimateId),
    kind: String(row.kind), assigneeRole: String(row.assigneeRole), assigneeUserId: row.assigneeUserId == null ? null : String(row.assigneeUserId),
    version: Number(row.version ?? 1), designPlanVersion: Number(row.designPlanVersion), preparationOnly: row.preparationOnly === true,
    status: String(row.status), supersededAt: row.supersededAt ?? null };
}
export function projectManagerSourceFact(row: Row): ProjectManagerSourceFact {
  return { id: String(row._id ?? row.id), projectId: String(row.projectId), status: String(row.status),
    designPlanStatus: row.designPlanStatus ?? null, designPlanVersion: Number(row.designPlanVersion ?? 0), estimation: row.estimation ?? null };
}

/** Read-only batched adapter; does not create missing tasks or reconcile identities. */
export async function readProjectManagerAssignmentsFacts(projectIds: readonly string[], session?: ClientSession): Promise<Map<string, ProjectManagerAssignmentFacts>> {
  const ids = [...new Set(projectIds)];
  const facts = new Map<string, ProjectManagerAssignmentFacts>(ids.map(id => [id, { project: null, tasks: [], sources: [], users: [] }]));
  if (!ids.length) return facts;
  const projects = await ProjectModel.find({ _id: { $in: ids } }).select({ programManagerId: 1, procurementIdentityVersion: 1 }).session(session ?? null).lean() as Row[];
  const tasks = await ProjectWorkflowTaskModel.find({ projectId: { $in: ids }, kind: "site_execution" }).session(session ?? null).lean() as Row[];
  const current = tasks.filter(task => !task.supersededAt);
  const ownerIds = [...new Set([...projects.map(project => project.programManagerId), ...current.map(task => task.assigneeUserId)].filter(Boolean).map(String))];
  const users = ownerIds.length ? await UserModel.find({ _id: { $in: ownerIds } }).select({ role: 1, active: 1 }).session(session ?? null).lean() as Row[] : [];
  const sourceProjectIds = [...new Set(current.map(task => String(task.projectId)))];
  const sources = sourceProjectIds.length ? await EstimateModel.find({ projectId: { $in: sourceProjectIds } }).select({ status: 1, projectId: 1, designPlanStatus: 1, designPlanVersion: 1, estimation: 1 }).session(session ?? null).lean() as Row[] : [];
  const completionStates = await SiteCompletionStateModel.find({ projectId: { $in: ids } })
    .select({ projectId: 1, currentRound: 1, status: 1 }).session(session ?? null).lean() as Row[];
  const locksReview = (state: Row) => ["pending_client", "client_approved"].includes(state.status);
  const validRound = (state: Row) => Number.isSafeInteger(state.currentRound) && state.currentRound > 0;
  const reviewBindings = completionStates.filter(state => locksReview(state) && validRound(state))
    .map(state => ({ projectId: String(state.projectId), round: Number(state.currentRound) }));
  const reviews = reviewBindings.length ? await SiteCompletionReviewModel.find({ $or: reviewBindings, status: { $in: ["pending", "approved"] } })
    .select({ projectId: 1, round: 1, status: 1, managerId: 1 }).session(session ?? null).lean() as Row[] : [];
  const taskByProject = new Map<string, ProjectManagerTaskFact[]>();
  const sourceByProject = new Map<string, ProjectManagerSourceFact[]>();
  const reviewsByProject = new Map<string, string[]>();
  for (const row of tasks) { const id = String(row.projectId); const list = taskByProject.get(id) ?? []; list.push(projectManagerTaskFact(row)); taskByProject.set(id, list); }
  for (const row of sources) { const id = String(row.projectId); const list = sourceByProject.get(id) ?? []; list.push(projectManagerSourceFact(row)); sourceByProject.set(id, list); }
  for (const row of reviews) { const id = String(row.projectId); const list = reviewsByProject.get(id) ?? []; list.push(String(row.managerId)); reviewsByProject.set(id, list); }
  const userFacts = users.map(user => ({ id: String(user._id), role: String(user.role), active: user.active === true }));
  for (const project of projects) {
    const id = String(project._id);
    const states = completionStates.filter(row => String(row.projectId) === id);
    const state = states[0];
    const boundReviews = state && locksReview(state) ? reviews.filter(row => String(row.projectId) === id && Number(row.round) === Number(state.currentRound)) : [];
    const reviewStateInvalid = states.length > 1 || Boolean(state &&
      (!["draft", "pending_client", "changes_requested", "client_approved"].includes(state.status) ||
      locksReview(state) && (!validRound(state) || boundReviews.length !== 1 || boundReviews[0]!.status !== (state.status === "client_approved" ? "approved" : "pending"))));
    facts.set(id, { project: { id, programManagerId: project.programManagerId == null ? null : String(project.programManagerId), procurementIdentityVersion: Number(project.procurementIdentityVersion ?? 1) },
      tasks: taskByProject.get(id) ?? [], sources: sourceByProject.get(id) ?? [], users: userFacts, reviewStateInvalid, lockedReviewOwnerIds: [...new Set(reviewsByProject.get(id) ?? [])] });
  }
  return facts;
}
export async function readProjectManagerAssignmentFacts(projectId: string, session?: ClientSession): Promise<ProjectManagerAssignmentFacts> {
  return (await readProjectManagerAssignmentsFacts([projectId], session)).get(projectId)!;
}
export async function resolveProjectManagerAssignment(projectId: string, session?: ClientSession): Promise<ProjectManagerAssignment> {
  return classifyProjectManagerAssignment(await readProjectManagerAssignmentFacts(projectId, session));
}
export async function resolveProjectManagerAssignments(projectIds: readonly string[], session?: ClientSession): Promise<Map<string, ProjectManagerAssignment>> {
  return new Map([...await readProjectManagerAssignmentsFacts(projectIds, session)].map(([id, facts]) => [id, classifyProjectManagerAssignment(facts)]));
}
export async function projectManagerProjectIds(ownerId: string, session?: ClientSession): Promise<string[]> {
  const candidates = await ProjectModel.find({ programManagerId: ownerId }).select({ _id: 1 }).session(session ?? null).lean();
  return [...await resolveProjectManagerAssignments(candidates.map(project => String(project._id)), session)]
    .filter(([, assignment]) => assignment.state === "assigned" && assignment.ownerId === ownerId).map(([id]) => id);
}
export function assignmentConflict(assignment: ProjectManagerAssignment): never {
  throw new ApiError(409, "PROJECT_MANAGER_ASSIGNMENT_RECONCILIATION_REQUIRED", "The Project Manager assignment requires reconciliation.", { reason: assignment.reason ?? "ASSIGNMENT_MISMATCH" });
}
export interface SetProjectManagerAssignmentInput {
  projectId: string;
  actorId: string;
  actorRole: "admin" | "super_admin";
  ownerId: string | null;
  expectedProjectVersion?: number;
  expectedTask?: { id: string; version: number };
  at: Date;
  audit: AuditService;
  city?: { name: string; key: string } | null;
}
export async function setProjectManagerAssignment(input: SetProjectManagerAssignmentInput, session: ClientSession): Promise<{ project: Row; task: Row | null }> {
  if (!session.inTransaction()) throw new Error("Project Manager assignment requires a transaction.");
  await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 }, $set: { updatedAt: input.at } }, { upsert: true, session });
  if (!["admin", "super_admin"].includes(input.actorRole) || !await UserModel.exists({ _id: input.actorId, role: input.actorRole, active: true }).session(session)) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (input.actorRole === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }).session(session) !== 1) {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
  }
  const project = await ProjectModel.findById(input.projectId).session(session).lean() as Row | null;
  if (!project) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
  const version = Number(project.procurementIdentityVersion ?? 1);
  if (input.expectedProjectVersion !== undefined && input.expectedProjectVersion !== version) throw new ApiError(409, "PROCUREMENT_IDENTITY_VERSION_CONFLICT", "Project assignment or city changed. Refresh and try again.");
  const facts = await readProjectManagerAssignmentFacts(input.projectId, session);
  let assignment = classifyProjectManagerAssignment(facts);
  // An explicitly replaced inactive account must not need reactivation. Validate the
  // unchanged source/ownership/review bindings before applying the normal guarded move.
  const inactiveOwner = facts.users.find(user => user.id === assignment.ownerId && user.role === "site_manager" && !user.active);
  if (assignment.reason === "OWNER_MISSING_OR_INACTIVE" && inactiveOwner && input.ownerId !== inactiveOwner.id) {
    assignment = classifyProjectManagerAssignment({ ...facts, users: facts.users.map(user => user.id === inactiveOwner.id ? { ...user, active: true } : user) });
  }
  if (assignment.state === "conflict") assignmentConflict(assignment);
  const task = assignment.task;
  if (input.expectedTask && (!task || task.id !== input.expectedTask.id || task.version !== input.expectedTask.version)) throw new ApiError(409, "WORKFLOW_TASK_VERSION_CONFLICT", "The workflow task changed. Refresh and try again.");
  if (input.ownerId !== null && !await UserModel.exists({ _id: input.ownerId, role: "site_manager", active: true }).session(session)) throw new ApiError(400, "INVALID_PROGRAM_MANAGER", "Select an active Project Manager.");
  const ownerChanged = assignment.ownerId !== input.ownerId;
  if (ownerChanged && (project.status === "completed" || task?.status === "completed")) throw new ApiError(409, "WORKFLOW_TASK_COMPLETED", "A completed project assignment cannot be changed.");
  if (ownerChanged && (facts.lockedReviewOwnerIds ?? []).some(owner => owner !== input.ownerId)) throw new ApiError(409, "PROJECT_MANAGER_REVIEW_LOCKED", "Resolve the existing Site completion review before changing the Project Manager.");
  const oldCity = { name: project.cityName ?? null, key: project.cityKey ?? null };
  const cityChanged = input.city !== undefined && (oldCity.name !== (input.city?.name ?? null) || oldCity.key !== (input.city?.key ?? null));
  if (!ownerChanged && !cityChanged) return { project, task: task ? await ProjectWorkflowTaskModel.findById(task.id).session(session).lean() as Row : null };
  const versionPredicate = project.procurementIdentityVersion == null ? { procurementIdentityVersion: { $in: [null, 1] } } : { procurementIdentityVersion: version };
  const updated = await ProjectModel.findOneAndUpdate({ _id: input.projectId, ...versionPredicate, programManagerId: project.programManagerId ?? null }, {
    $set: { programManagerId: input.ownerId, ...(input.city === undefined ? {} : { cityName: input.city?.name ?? null, cityKey: input.city?.key ?? null }), procurementIdentityVersion: version + 1, updatedAt: input.at },
    $inc: { purchaseOrderApprovalEpoch: 1, siteCompletionFenceEpoch: 1 }
  }, { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
  if (!updated) throw new ApiError(409, "PROCUREMENT_IDENTITY_VERSION_CONFLICT", "Project assignment or city changed. Refresh and try again.");
  let updatedTask: Row | null = task ? await ProjectWorkflowTaskModel.findById(task.id).session(session).lean() as Row : null;
  if (ownerChanged && task) {
    updatedTask = await ProjectWorkflowTaskModel.findOneAndUpdate({ _id: task.id, projectId: input.projectId, kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: task.assigneeUserId,
      version: task.version, status: { $ne: "completed" }, supersededAt: null }, {
      $set: { assigneeUserId: input.ownerId, updatedAt: input.at }, $inc: { version: 1, awardApprovalEpoch: 1 }
    }, { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
    if (!updatedTask) throw new ApiError(409, "WORKFLOW_TASK_VERSION_CONFLICT", "The workflow task changed. Refresh and try again.");
    await input.audit.appendInMongoTransaction({ actorId: input.actorId, action: "project_workflow_task_assignee_changed", entityType: "project_workflow_task", entityId: task.id,
      occurredAt: input.at.toISOString(), oldValues: { assigneeUserId: task.assigneeUserId, version: task.version }, newValues: { assigneeUserId: input.ownerId, version: task.version + 1 } }, session);
  }
  if (ownerChanged) await input.audit.appendInMongoTransaction({ actorId: input.actorId, action: "project_program_manager_assigned", entityType: "project", entityId: input.projectId,
    occurredAt: input.at.toISOString(), oldValues: { programManagerId: assignment.ownerId, version }, newValues: { programManagerId: input.ownerId, version: version + 1 } }, session);
  if (cityChanged) await input.audit.appendInMongoTransaction({ actorId: input.actorId, action: "project_city_confirmed", entityType: "project", entityId: input.projectId,
    occurredAt: input.at.toISOString(), oldValues: { city: oldCity, version }, newValues: { city: input.city, version: version + 1 } }, session);
  await appendExecutionChange({ projectId: input.projectId, version: version + 1, kind: "project_manager_assignment", occurredAt: input.at }, session);
  return { project: updated, task: updatedTask };
}
