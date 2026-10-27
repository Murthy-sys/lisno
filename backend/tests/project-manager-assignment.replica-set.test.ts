import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { SiteCompletionReviewModel } from "../src/models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ExecutionChangeEventModel } from "../src/models/ExecutionChangeEvent.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createProcurementProjectIdentityService } from "../src/services/procurement-project-identity.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { projectManagerProjectIds, resolveProjectManagerAssignment } from "../src/services/project-manager-assignment.service.js";
import { executionProjectIds, requireExecutionProject } from "../src/services/vendor-execution-access.js";

const at = new Date("2026-10-27T10:00:00Z");
const admin = { id: "super", name: "Admin", email: "super@example.test", role: "super_admin" as const };
const manager = { id: "pm-a", name: "Manager A", email: "pm-a@example.test", role: "site_manager" as const };
const audit = createAuditService(createMemoryRepository());
const identity = createProcurementProjectIdentityService({ audit, now: () => at });
const workflow = createProjectWorkflowService({ audit, now: () => at, storage: {} as never, mailer: { deliveryKind: "disabled" }, portalUrl: "https://example.test" });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-canonical-assignment");
  await Promise.all([ProjectModel, UserModel, EstimateModel, ProjectWorkflowTaskModel, SiteCompletionReviewModel, SiteCompletionStateModel, AuditEventModel, ExecutionChangeEventModel].map(model => model.init()));
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([admin, manager, { ...manager, id: "pm-b", email: "pm-b@example.test" }].map(user => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email,
    role: user.role, active: true, passwordHash: "fixture", version: 1, sessionVersion: 1 })));
  await ProjectModel.collection.insertMany(["a", "b"].map(id => ({ _id: id, name: id, status: "active", procurementIdentityVersion: 1,
    programManagerId: id === "a" ? "pm-a" : "pm-b", completionAuthority: "legacy_staff", cityName: null, cityKey: null })) as never);
  await EstimateModel.collection.insertMany(["a", "b"].map(id => ({ _id: `estimate-${id}`, projectId: id, status: "client_approved", designPlanStatus: "approved", designPlanVersion: 2 })) as never);
  await ProjectWorkflowTaskModel.create(["a", "b"].map(id => ({ _id: `task-${id}`, dedupeKey: `estimate-${id}:site`, projectId: id, estimateId: `estimate-${id}`, kind: "site_execution", assigneeRole: "site_manager",
    assigneeUserId: id === "a" ? "pm-a" : "pm-b", designPlanVersion: 2, preparationOnly: false, status: "open", progress: 0, version: 1, openedAt: at, title: "Site execution" })));
});

describe("Project Manager transactional assignment", () => {
  it("uses the same canonical owner for list/detail and denies task-only, duplicates and stale sources", async () => {
    expect(await projectManagerProjectIds(manager.id)).toEqual(["a"]);
    expect(await executionProjectIds(manager)).toEqual(["a"]);
    await expect(requireExecutionProject(manager, "b")).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: null } });
    expect(await projectManagerProjectIds(manager.id)).toEqual([]);
    await expect(requireExecutionProject(manager, "a")).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: manager.id } });
    await ProjectWorkflowTaskModel.collection.updateOne({ _id: "task-a" }, { $set: { designPlanVersion: 1 } });
    expect((await resolveProjectManagerAssignment("a")).reason).toBe("SITE_SOURCE_INVALID");
  });
  it("synchronizes scalar and task from either editor and invalidates the other editor version", async () => {
    expect(await identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).toMatchObject({ programManagerId: "pm-b", version: 2 });
    expect(await ProjectWorkflowTaskModel.findById("task-a").lean()).toMatchObject({ assigneeUserId: "pm-b", version: 2, awardApprovalEpoch: 1 });
    await expect(workflow.overrideWorkerAssignment({ actor: admin, projectId: "a", taskId: "task-a", expectedVersion: 1, workerId: "pm-a" })).rejects.toMatchObject({ status: 409 });
    expect(await workflow.overrideWorkerAssignment({ actor: admin, projectId: "a", taskId: "task-a", expectedVersion: 2, workerId: "pm-a" })).toMatchObject({ assignedWorker: { id: "pm-a" }, version: 3 });
    expect(await ProjectModel.findById("a").lean()).toMatchObject({ programManagerId: "pm-a", procurementIdentityVersion: 3, purchaseOrderApprovalEpoch: 2, siteCompletionFenceEpoch: 2 });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 2, programManagerId: "pm-b" })).rejects.toMatchObject({ status: 409 });
    expect(await AuditEventModel.countDocuments({ action: "project_program_manager_assigned" })).toBe(2);
    expect(await ExecutionChangeEventModel.countDocuments({ projectId: "a", kind: "project_manager_assignment" })).toBe(2);
  });
  it.each(["project", "task"])("replaces an inactive synchronized owner through the %s editor without reactivating that account", async editor => {
    await UserModel.updateOne({ _id: manager.id }, { $set: { active: false } });
    await expect(requireExecutionProject(manager, "a")).rejects.toMatchObject({ status: 404 });
    if (editor === "project") await identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" });
    else await workflow.overrideWorkerAssignment({ actor: admin, projectId: "a", taskId: "task-a", expectedVersion: 1, workerId: "pm-b" });
    expect(await resolveProjectManagerAssignment("a")).toMatchObject({ state: "assigned", ownerId: "pm-b" });
    expect(await UserModel.findById(manager.id).lean()).toMatchObject({ active: false });
    expect(await ProjectWorkflowTaskModel.findById("task-a").lean()).toMatchObject({ assigneeUserId: "pm-b", version: 2 });
    expect(await AuditEventModel.countDocuments({ action: "project_program_manager_assigned" })).toBe(1);
  });
  it("unassigns an inactive owner while preserving source and completed-task restrictions", async () => {
    await UserModel.updateOne({ _id: manager.id }, { $set: { active: false } });
    await ProjectWorkflowTaskModel.updateOne({ _id: "task-a" }, { $set: { status: "completed" } });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: null })).rejects.toMatchObject({ code: "WORKFLOW_TASK_COMPLETED" });
    await ProjectWorkflowTaskModel.collection.updateOne({ _id: "task-a" }, { $set: { status: "open", designPlanVersion: 1 } });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: null })).rejects.toMatchObject({ code: "PROJECT_MANAGER_ASSIGNMENT_RECONCILIATION_REQUIRED" });
    await ProjectWorkflowTaskModel.collection.updateOne({ _id: "task-a" }, { $set: { designPlanVersion: 2 } });
    await identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: null });
    expect(await resolveProjectManagerAssignment("a")).toMatchObject({ state: "unassigned", ownerId: null });
    expect(await ProjectWorkflowTaskModel.findById("task-a").lean()).toMatchObject({ assigneeUserId: null, version: 2 });
    expect(await UserModel.findById(manager.id).lean()).toMatchObject({ active: false });
  });
  it("preserves the current review lock when the assigned account is inactive", async () => {
    await UserModel.updateOne({ _id: manager.id }, { $set: { active: false } });
    await SiteCompletionStateModel.collection.insertOne({ _id: "a", projectId: "a", status: "pending_client", currentRound: 1, version: 1 } as never);
    await SiteCompletionReviewModel.collection.insertOne({ _id: "current", projectId: "a", round: 1, managerId: manager.id, status: "pending" } as never);
    await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).rejects.toMatchObject({ code: "PROJECT_MANAGER_REVIEW_LOCKED" });
    expect(await ProjectModel.findById("a").lean()).toMatchObject({ programManagerId: manager.id, procurementIdentityVersion: 1 });
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("allows only one winner for concurrent scalar/task edits", async () => {
    const results = await Promise.allSettled([
      identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" }),
      workflow.overrideWorkerAssignment({ actor: admin, projectId: "a", taskId: "task-a", expectedVersion: 1, workerId: null })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const project = await ProjectModel.findById("a").lean();
    const task = await ProjectWorkflowTaskModel.findById("task-a").lean();
    expect(project?.programManagerId).toBe(task?.assigneeUserId);
    expect(project?.procurementIdentityVersion).toBe(2);
    expect(task?.version).toBe(2);
  });
  it("does not rewrite completed tasks or current frozen review actors", async () => {
    await SiteCompletionStateModel.collection.insertOne({ _id: "a", projectId: "a", status: "pending_client", currentRound: 2, version: 1 } as never);
    await SiteCompletionReviewModel.collection.insertMany([
      { _id: "historical", projectId: "a", round: 1, managerId: "historical-manager", status: "approved", signature: "preserved" },
      { _id: "current", projectId: "a", round: 2, managerId: "pm-a", status: "pending", signature: "preserved-current" }
    ] as never);
    const before = await SiteCompletionReviewModel.collection.find({ projectId: "a" }).toArray();
    expect((await resolveProjectManagerAssignment("a")).state).toBe("assigned");
    await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).rejects.toMatchObject({ code: "PROJECT_MANAGER_REVIEW_LOCKED" });
    expect(await SiteCompletionReviewModel.collection.find({ projectId: "a" }).toArray()).toEqual(before);
    await SiteCompletionStateModel.updateOne({ _id: "a" }, { $set: { status: "changes_requested" } });
    expect(await identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).toMatchObject({ version: 2 });
    await ProjectWorkflowTaskModel.updateOne({ _id: "task-a" }, { $set: { status: "completed" } });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 2, programManagerId: "pm-a" })).rejects.toMatchObject({ code: "WORKFLOW_TASK_COMPLETED" });
    expect(await SiteCompletionReviewModel.collection.find({ projectId: "a" }).toArray()).toEqual(before);
  });
  it("saves setup assignment without generating tasks or allowing a legacy role", async () => {
    await ProjectWorkflowTaskModel.deleteOne({ _id: "task-a" });
    await EstimateModel.deleteOne({ _id: "estimate-a" });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: null, status: "planning" } });
    expect(await identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-a" })).toMatchObject({ version: 2, programManagerId: "pm-a" });
    expect(await ProjectWorkflowTaskModel.countDocuments({ projectId: "a" })).toBe(0);
    await UserModel.collection.updateOne({ _id: "pm-b" }, { $set: { role: "program_manager" } });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 2, programManagerId: "pm-b" })).rejects.toMatchObject({ code: "INVALID_PROGRAM_MANAGER" });
  });
  it.each([0, 4])("reports a broken current Site review round %s without allowing reassignment", async round => {
    await SiteCompletionStateModel.collection.insertOne({ _id: "a", projectId: "a", status: "pending_client", currentRound: round, version: 1 } as never);
    expect(await resolveProjectManagerAssignment("a")).toMatchObject({ state: "conflict", reason: "REVIEW_SOURCE_INVALID" });
    await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).rejects.toMatchObject({ code: "PROJECT_MANAGER_ASSIGNMENT_RECONCILIATION_REQUIRED" });
    expect(await ProjectModel.findById("a").lean()).toMatchObject({ programManagerId: "pm-a", procurementIdentityVersion: 1 });
  });
  it.each(["inactive", "role-changed"])("revalidates the %s actor inside the assignment transaction", async condition => {
    await UserModel.collection.updateOne({ _id: admin.id }, { $set: condition === "inactive" ? { active: false } : { role: "admin" } });
    await expect(workflow.overrideWorkerAssignment({ actor: admin, projectId: "a", taskId: "task-a", expectedVersion: 1, workerId: "pm-b" })).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    expect(await ProjectModel.findById("a").lean()).toMatchObject({ programManagerId: "pm-a", procurementIdentityVersion: 1 });
    expect(await ProjectWorkflowTaskModel.findById("task-a").lean()).toMatchObject({ assigneeUserId: "pm-a", version: 1 });
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("rolls back assignment if downstream event persistence fails", async () => {
    await mongoose.connection.db!.command({ collMod: ExecutionChangeEventModel.collection.name, validator: { kind: { $ne: "project_manager_assignment" } }, validationLevel: "strict", validationAction: "error" });
    try {
      await expect(identity.updateProject(admin, "a", { expectedVersion: 1, programManagerId: "pm-b" })).rejects.toThrow();
      expect(await ProjectModel.findById("a").lean()).toMatchObject({ programManagerId: "pm-a", procurementIdentityVersion: 1 });
      expect(await ProjectWorkflowTaskModel.findById("task-a").lean()).toMatchObject({ assigneeUserId: "pm-a", version: 1 });
      expect(await AuditEventModel.countDocuments()).toBe(0);
    } finally { await mongoose.connection.db!.command({ collMod: ExecutionChangeEventModel.collection.name, validator: {} }); }
  });
});
