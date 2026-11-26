import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignerAssignmentRequestModel } from "../src/models/DesignerAssignmentRequest.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectManagerEventModel } from "../src/models/ProjectManagerEvent.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService } from "../src/services/design-workflow-state.service.js";
import { readDesignerHandoffSource } from "../src/services/designer-handoff.service.js";
import { createKeyCollectionReminderScheduler } from "../src/services/key-collection-reminder-scheduler.js";
import { createProjectManagerWorkspace } from "../src/services/project-manager/workspace.js";
import { setProjectManagerAssignment } from "../src/services/project-manager-assignment.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const START = Date.parse("2026-11-26T10:00:00Z");
const HOUR = 3_600_000;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("key-collection-reminder-scheduler");
  await Promise.all([ProjectModel.syncIndexes(), UserModel.syncIndexes(), EstimateModel.syncIndexes(), EstimateClientReviewRoundModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(), DesignerAssignmentRequestModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes(),
    ProjectManagerEventModel.syncIndexes(), ProjectWorkflowTaskModel.syncIndexes(), AuditEventModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => { vi.restoreAllMocks(); await replica.clear(); });
afterAll(async () => replica?.stop());

async function fixture(id = "project-warning", duration = 48 * HOUR) {
  const iso = new Date(START).toISOString();
  const roles = ["client", "designer", "site_manager", "super_admin"] as const;
  const users = Object.fromEntries(roles.map(role => {
    const seed = demoSeedData.users.find(user => user.role === role)!;
    return [role, { ...seed, id: `${id}-${role}`, name: `Fixture ${role}`, email: `${id}-${role}@example.test`, emailNormalized: `${id}-${role}@example.test` }];
  })) as Record<typeof roles[number], typeof demoSeedData.users[number]>;
  // Only one active Super Admin is allowed across every project.
  const existingAdmin = await UserModel.findOne({ role: "super_admin" }).lean();
  if (existingAdmin) users.super_admin = { ...users.super_admin, id: String(existingAdmin._id), email: String(existingAdmin.email), emailNormalized: String(existingAdmin.emailNormalized) };
  await UserModel.create(Object.values(users).filter(user => !existingAdmin || user.role !== "super_admin").map(user => ({ ...user, _id: user.id })));
  const actors = Object.fromEntries(roles.map(role => [role, { id: users[role].id, name: users[role].name, role, email: users[role].email }])) as Record<typeof roles[number], PublicUser>;
  const stages = createProjectDesignWorkflow(id);
  await ProjectModel.create({ ...demoSeedData.projects[0]!, _id: id, name: `Home ${id}`, status: "active", clientId: actors.client.id,
    clientMobile: "9000000000", clientAddress: "Synthetic address", assignedDesignerIds: [actors.designer.id], primaryDesignerId: actors.designer.id,
    programManagerId: actors.site_manager.id, procurementIdentityVersion: 1, designTeamVersion: 1, estimationWorkflowVersion: 2, designWorkflowStages: stages });
  const estimateId = `${id}-estimate`, roundId = `${id}-round`, requestId = `${id}-request`;
  await EstimateModel.create({ _id: estimateId, leadId: `${id}-lead`, ownerId: "sales-fixture", projectId: id,
    version: 4, status: "client_approved", propertyType: "residential", rooms: [], scopes: [], lineItems: [], subtotal: 100, gst: 18, total: 118,
    clientDecisionAt: new Date(START), designPlanDesignerId: actors.designer.id, designPlanAssignedAt: new Date(START),
    estimation: { ...newEstimationLifecycle(), phase: "post", preApproval: { reviewRoundId: roundId, estimateVersion: 3, approvedAt: iso } } });
  await EstimateClientReviewRoundModel.create({ _id: roundId, estimateId, leadId: `${id}-lead`, projectId: id,
    estimateVersion: 3, sendGeneration: 1, phase: "pre", dedupeKey: createHash("sha256").update(id).digest("hex"), recipientEmail: actors.client.email, recipientEmailNormalized: actors.client.email,
    estimateSnapshot: { clientName: "Client", projectName: "Home", location: "Pune", propertyType: "residential", lineItems: [], subtotal: 100, gst: 18, total: 118 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64), pdfStorageReference: "opaque-approval",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, assignedAdminId: actors.super_admin.id,
    status: "approved", decision: "approve", decisionNote: "Approved", decisionSource: "client_portal", decidedById: actors.client.id,
    decidedAt: new Date(START), version: 2 });
  await DesignerAssignmentRequestModel.create({ _id: requestId, projectId: id, estimateId, sourceRevision: "approved-source", sourceSnapshot: { estimateId },
    designerId: actors.designer.id, designerName: actors.designer.name, proposedById: actors.super_admin.id, status: "accepted", version: 2,
    createIdempotencyKey: `${id}-assignment`, decisionIdempotencyKey: `${id}-accept`, decidedById: actors.designer.id,
    createdAt: new Date(START), decidedAt: new Date(START), safePreview: { projectName: "Home", scopeSummary: { itemCount: 0, sectionCount: 0, roomCount: 0 } } });
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const project = (await repository.findProjectById(id))!;
  const source = await readDesignerHandoffSource(repository, project);
  expect(source.issue).toBeNull(); expect(source.assignmentRevision).toBeTruthy();
  const service = createDesignWorkflowStateService(repository, audit, () => new Date(START));
  await service.act(actors.client, id, { action: "key_collection_schedule", expectedVersion: 0, stageId: stages.find(stage => stage.type === "key_collection")!.id,
    idempotencyKey: `${id}-schedule`, note: "", data: duration === 48 * HOUR
      ? { mode: "within_48_hours", expectedAssignmentRevision: source.assignmentRevision }
      : { mode: "chosen_datetime", expectedAssignmentRevision: source.assignmentRevision, scheduledAt: new Date(START + duration).toISOString() } }, null);
  let time = START;
  const scheduler = () => createKeyCollectionReminderScheduler({ audit, now: () => new Date(time) });
  const workspace = createProjectManagerWorkspace({ audit, panels: {}, now: () => new Date(time) });
  return { id, actors, audit, repository, service, stages, scheduler, workspace, setTime: (value: number) => { time = value; } };
}

describe("Mongo key collection advance warnings", () => {
  it("records both warnings at their exact advance boundaries, independently of page reads, without changing workflow history", async () => {
    const f = await fixture(); const scheduler = f.scheduler();
    const before = await f.repository.findDesignWorkflowState(f.id);
    f.setTime(START + 23.5 * HOUR - 1);
    expect(await scheduler.tick()).toMatchObject({ recorded: 0, failed: 0 });
    f.setTime(START + 23.5 * HOUR);
    expect(await scheduler.tick()).toMatchObject({ recorded: 2, failed: 0 });
    let rows = await ProjectManagerEventModel.find({ family: "key_collection" }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.recipientIds[0]).sort()).toEqual([f.actors.site_manager.id, f.actors.super_admin.id].sort());
    expect(rows.every(row => row.result.zone === "orange" && row.result.transitionAt === new Date(START + 24 * HOUR).toISOString())).toBe(true);
    f.setTime(START + 35.5 * HOUR - 1);
    expect(await scheduler.tick()).toMatchObject({ recorded: 0, deduplicated: 2 });
    f.setTime(START + 35.5 * HOUR);
    expect(await scheduler.tick()).toMatchObject({ recorded: 2 });
    rows = await ProjectManagerEventModel.find({ family: "key_collection" }).lean();
    expect(rows).toHaveLength(4);
    expect(rows.filter(row => row.result.zone === "red")).toHaveLength(2);
    expect(await f.repository.findDesignWorkflowState(f.id)).toEqual(before);
  });

  it("deduplicates concurrent processes and restart while retaining read state", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    const reports = await Promise.all([f.scheduler().tick(), f.scheduler().tick()]);
    expect(reports.reduce((sum, row) => sum + row.recorded, 0)).toBe(2);
    expect(reports.every(row => row.failed === 0)).toBe(true);
    const row = await ProjectManagerEventModel.findOne({ recipientIds: f.actors.super_admin.id }).lean();
    await f.workspace.readNotification(f.actors.super_admin, String(row!._id));
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0, deduplicated: 2 });
    expect((await ProjectManagerEventModel.findById(row!._id).lean())!.readBy).toEqual([f.actors.super_admin.id]);
    expect(await AuditEventModel.countDocuments({ action: "project_manager_action_recorded", entityType: "key_collection" })).toBe(2);
  });

  it("recovers only the latest warning and coalesces short chosen-date windows", async () => {
    const f = await fixture(); f.setTime(START + 40 * HOUR);
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 2 });
    const rows = await ProjectManagerEventModel.find({ family: "key_collection" }).lean();
    expect(rows.every(row => row.result.zone === "red" && row.result.title.includes("is in"))).toBe(true);
    f.setTime(START + 24 * HOUR);
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0, deduplicated: 2 });
    await replica.clear();
    const short = await fixture("short-window", 20 * 60_000);
    expect(await short.scheduler().tick()).toMatchObject({ recorded: 2 });
    expect((await ProjectManagerEventModel.find({ family: "key_collection" }).lean()).every(row => row.result.zone === "red")).toBe(true);
  });

  it("keeps Super Admin delivery when PM is missing and routes a later PM assignment once", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    await ProjectModel.updateOne({ _id: f.id }, { $set: { programManagerId: null } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 1, missingRecipients: 1 });
    await ProjectModel.updateOne({ _id: f.id }, { $set: { programManagerId: f.actors.site_manager.id } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 1, deduplicated: 1, missingRecipients: 0 });
    expect(await ProjectManagerEventModel.countDocuments({ recipientIds: f.actors.super_admin.id })).toBe(1);
  });

  it("sends to a replacement PM, revokes the former PM's notifications, and does not duplicate admin copies", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    await f.scheduler().tick();
    const old = await f.workspace.notifications(f.actors.site_manager);
    const manager = demoSeedData.users.find(user => user.role === "site_manager")!;
    await UserModel.create({ ...manager, _id: "new-pm", email: "new-pm@example.test", emailNormalized: "new-pm@example.test" });
    await ProjectModel.updateOne({ _id: f.id }, { $set: { programManagerId: "new-pm" } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 1, deduplicated: 1 });
    expect((await f.workspace.notifications(f.actors.site_manager)).total).toBe(0);
    await expect(f.workspace.readNotification(f.actors.site_manager, old.items[0]!.id)).rejects.toMatchObject({ status: 404 });
    expect((await f.workspace.notifications(f.actors.super_admin)).total).toBe(1);
    expect((await f.workspace.notifications({ ...f.actors.site_manager, id: "new-pm" })).total).toBe(1);
  });

  it("does not expose the PM copy to Super Admin and preserves oversight of other families", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR); await f.scheduler().tick();
    const pmRow = await ProjectManagerEventModel.findOne({ recipientIds: f.actors.site_manager.id }).lean();
    await expect(f.workspace.readNotification(f.actors.super_admin, String(pmRow!._id))).rejects.toMatchObject({ status: 404 });
    await ProjectManagerEventModel.create({ ...pmRow, _id: "legacy-event", family: "quality", idempotencyKey: "legacy-key", readBy: [], result: { title: "Existing quality event" } });
    const adminPage = await f.workspace.notifications(f.actors.super_admin);
    expect(adminPage).toMatchObject({ total: 2, unreadTotal: 2 });
    expect(adminPage.items.find(row => row.family === "key_collection")?.description).toContain("Collection deadline:");
    await f.workspace.readNotification(f.actors.super_admin, "legacy-event");
    expect((await f.workspace.notifications(f.actors.super_admin)).unreadTotal).toBe(1);
    expect((await f.workspace.notifications(f.actors.designer)).total).toBe(0);
  });

  it("requires the unique active Super Admin without blocking the assigned PM when unavailable", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    const admin = demoSeedData.users.find(user => user.role === "super_admin")!;
    await expect(UserModel.create({ ...admin, _id: "other-admin", email: "other-admin@example.test", emailNormalized: "other-admin@example.test" })).rejects.toMatchObject({ code: 11000 });
    await UserModel.updateOne({ _id: f.actors.super_admin.id }, { $set: { active: false } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 1, missingRecipients: 1 });
    expect((await ProjectManagerEventModel.find({ family: "key_collection" }).lean()).map(row => row.recipientIds)).toEqual([[f.actors.site_manager.id]]);
  });

  it("skips completed/received/closed or invalid-source appointments", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    await DesignWorkflowStateModel.updateOne({ _id: f.id }, { $set: { "stages.key_collection.receivedAt": new Date(START + HOUR).toISOString() } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0 });
    await DesignWorkflowStateModel.updateOne({ _id: f.id }, { $unset: { "stages.key_collection.receivedAt": 1 } });
    await ProjectModel.updateOne({ _id: f.id }, { $set: { status: "completed" } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0 });
    await ProjectModel.updateOne({ _id: f.id }, { $set: { status: "active" } });
    await DesignWorkflowStateModel.updateOne({ _id: f.id }, { $set: { "history.0.data.deadlineAt": "invalid" } });
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0, skippedInvalid: 1 });
    expect(await ProjectManagerEventModel.countDocuments({})).toBe(0);
  });

  it("rolls back partial recipients and audit failure, then retries safely", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    const spy = vi.spyOn(f.audit, "appendInMongoTransaction").mockRejectedValueOnce(new Error("synthetic audit failure"));
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 0, failed: 1 });
    expect(await ProjectManagerEventModel.countDocuments({})).toBe(0);
    spy.mockRestore();
    expect(await f.scheduler().tick()).toMatchObject({ recorded: 2, failed: 0 });
  });

  it("serializes a receipt transaction before warning creation", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    let held!: () => void; let release!: () => void;
    const acquired = new Promise<void>(resolve => { held = resolve; });
    const receipt = mongoose.connection.transaction(async session => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      await DesignWorkflowStateModel.updateOne({ _id: f.id }, { $set: { "stages.key_collection.receivedAt": new Date(START + 24 * HOUR).toISOString() } }, { session });
      held(); await new Promise<void>(resolve => { release = resolve; });
    });
    await acquired;
    const warning = f.scheduler().tick();
    release(); await receipt;
    expect(await warning).toMatchObject({ recorded: 0, failed: 0 });
    expect(await ProjectManagerEventModel.countDocuments({})).toBe(0);
  });

  it("serializes PM reassignment before determining warning recipients", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    const manager = demoSeedData.users.find(user => user.role === "site_manager")!;
    await UserModel.create({ ...manager, _id: "race-pm", email: "race-pm@example.test", emailNormalized: "race-pm@example.test" });
    let held!: () => void; let release!: () => void;
    const acquired = new Promise<void>(resolve => { held = resolve; });
    const reassignment = mongoose.connection.transaction(async session => {
      await setProjectManagerAssignment({ projectId: f.id, actorId: f.actors.super_admin.id, actorRole: "super_admin", ownerId: "race-pm", expectedProjectVersion: 1,
        at: new Date(START + 24 * HOUR), audit: f.audit }, session);
      held(); await new Promise<void>(resolve => { release = resolve; });
    });
    await acquired;
    const warning = f.scheduler().tick();
    release(); await reassignment;
    expect(await warning).toMatchObject({ recorded: 2, failed: 0 });
    expect((await ProjectManagerEventModel.find({ family: "key_collection" }).lean()).map(row => row.recipientIds[0]).sort()).toEqual(["race-pm", f.actors.super_admin.id].sort());
  });

  it("rechecks the latest warning after waiting for a transaction fence", async () => {
    const f = await fixture(); f.setTime(START + 24 * HOUR);
    let held!: () => void; let release!: () => void; let attempted!: () => void;
    const acquired = new Promise<void>(resolve => { held = resolve; });
    const attemptedFence = new Promise<void>(resolve => { attempted = resolve; });
    const blocking = mongoose.connection.transaction(async session => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      held(); await new Promise<void>(resolve => { release = resolve; });
    });
    await acquired;
    const update = AuthorizationCoordinationModel.updateOne.bind(AuthorizationCoordinationModel);
    const spy = vi.spyOn(AuthorizationCoordinationModel, "updateOne").mockImplementation((...args) => {
      attempted(); return update(...args);
    });
    const warning = f.scheduler().tick();
    await attemptedFence;
    f.setTime(START + 36 * HOUR);
    release(); await blocking;
    expect(await warning).toMatchObject({ recorded: 2, failed: 0 });
    spy.mockRestore();
    expect((await ProjectManagerEventModel.find({ family: "key_collection" }).lean()).every(row => row.result.zone === "red")).toBe(true);
  });

  it("processes two unequal project windows without crossing recipients", async () => {
    const first = await fixture("first");
    const second = await fixture("second", 96 * HOUR);
    first.setTime(START + 24 * HOUR);
    expect(await first.scheduler().tick()).toMatchObject({ recorded: 2 });
    expect((await ProjectManagerEventModel.find({}).lean()).every(row => row.projectId === first.id)).toBe(true);
    expect((await second.workspace.notifications(second.actors.site_manager)).total).toBe(0);
  });
});
