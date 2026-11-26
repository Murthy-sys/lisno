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
import { UserModel } from "../src/models/User.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { readDesignerHandoffSource, projectDesignerHandoff } from "../src/services/designer-handoff.service.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { createDesignerAssignmentService } from "../src/services/designer-assignment.service.js";
import { createKeyCollectionRemindersService } from "../src/services/key-collection-reminders.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const PROJECT = "appointment-project", ESTIMATE = "appointment-estimate";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("key-collection-appointment");
  await Promise.all([ProjectModel.syncIndexes(), UserModel.syncIndexes(), EstimateModel.syncIndexes(), EstimateClientReviewRoundModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes(), DesignerAssignmentRequestModel.syncIndexes(), AuditEventModel.syncIndexes(), LeadModel.syncIndexes(), ProjectWorkflowTaskModel.syncIndexes()]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup(accepted = true) {
  const client = demoSeedData.users.find(user => user.role === "client")!;
  const designer = demoSeedData.users.find(user => user.role === "designer")!;
  const replacement = { ...designer, id: "replacement-designer", email: "replacement@example.test", emailNormalized: "replacement@example.test" };
  await UserModel.create([client, designer, replacement].map(user => ({ ...user, _id: user.id })));
  const stages = createProjectDesignWorkflow(PROJECT);
  await ProjectModel.create({ ...demoSeedData.projects[0]!, _id: PROJECT, clientId: client.id,
    clientMobile: "9000000000", clientAddress: "Synthetic address", assignedDesignerIds: [designer.id], primaryDesignerId: designer.id,
    designTeamVersion: 1, estimationWorkflowVersion: 2, designWorkflowStages: stages });
  await EstimateModel.create({ _id: ESTIMATE, leadId: "appointment-lead", ownerId: "sales-fixture", projectId: PROJECT,
    version: 4, status: "client_approved", propertyType: "residential", rooms: [], scopes: [], lineItems: [], subtotal: 100, gst: 18, total: 118,
    clientDecisionAt: NOW, designPlanDesignerId: designer.id, designPlanAssignedAt: NOW,
    estimation: { ...newEstimationLifecycle(), phase: "post", preApproval: { reviewRoundId: "appointment-round", estimateVersion: 3, approvedAt: NOW.toISOString() } } });
  await EstimateClientReviewRoundModel.create({ _id: "appointment-round", estimateId: ESTIMATE, leadId: "appointment-lead", projectId: PROJECT,
    estimateVersion: 3, sendGeneration: 1, phase: "pre", dedupeKey: "a".repeat(64), recipientEmail: "fixture@example.test", recipientEmailNormalized: "fixture@example.test",
    estimateSnapshot: { clientName: "Client", projectName: "Home", location: "Pune", propertyType: "residential", lineItems: [], subtotal: 100, gst: 18, total: 118 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64), pdfStorageReference: "opaque-approval",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, assignedAdminId: "super-fixture", status: "approved", decision: "approve", decisionNote: "Approved", decisionSource: "client_portal", decidedById: client.id, decidedAt: NOW, version: 2 });
  if (accepted) await DesignerAssignmentRequestModel.create({ _id: "accepted-request", projectId: PROJECT, estimateId: ESTIMATE, sourceRevision: "approved-source",
    sourceSnapshot: { estimateId: ESTIMATE }, designerId: designer.id, designerName: designer.name, proposedById: "super-fixture", status: "accepted", version: 2,
    createIdempotencyKey: "original-assignment", decisionIdempotencyKey: "accept-assignment", decidedById: designer.id, createdAt: NOW, decidedAt: NOW,
    safePreview: { projectName: "Home", scopeSummary: { itemCount: 0, sectionCount: 0, roomCount: 0 } } });
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const actor: PublicUser = { id: client.id, name: client.name, email: client.email, role: "client" };
  const project = (await repository.findProjectById(PROJECT))!;
  const source = await readDesignerHandoffSource(repository, project);
  expect(source.issue).toBeNull(); expect(source.assignmentRevision).toBeTruthy();
  const input: WorkflowActionInput = { action: "key_collection_schedule", expectedVersion: 0, stageId: stages.find(stage => stage.type === "key_collection")!.id,
    idempotencyKey: "confirm-appointment", note: "", data: { mode: "within_48_hours", expectedAssignmentRevision: source.assignmentRevision } };
  return { repository, audit, actor, input, project, designer, replacement, service: createDesignWorkflowStateService(repository, audit, () => NOW) };
}

describe("Mongo key collection appointment invariants", () => {
  it("projects the personal reminder feed from a saved appointment using Mongo scope and snapshot reads", async () => {
    const f = await setup();
    await f.service.act(f.actor, PROJECT, f.input, null);
    const designer: PublicUser = { id: f.designer.id, role: "designer", name: f.designer.name, email: f.designer.email };
    const service = createKeyCollectionRemindersService(f.repository, () => new Date(NOW.getTime() + 36 * 3_600_000));
    const result = await service.list(designer, {});
    expect(result).toMatchObject({ urgentCount: 1, nextRedAt: null, pagination: { total: 1, limit: 20, offset: 0, hasMore: false } });
    expect(result.items[0]).toMatchObject({ projectId: PROJECT, appointment: { remainingMs: 12 * 3_600_000,
      deadlineAt: "2026-11-27T10:00:00.000Z", timing: { zone: "red" } } });
    expect((await f.repository.findDesignWorkflowState(PROJECT))!.version).toBe(1);
    await DesignWorkflowStateModel.updateOne({ _id: PROJECT }, { $set: { "stages.key_collection.receivedAt": NOW.toISOString() } });
    expect(await service.list(designer, {})).toMatchObject({ urgentCount: 0, items: [] });
    await UserModel.updateOne({ _id: designer.id }, { $set: { active: false } });
    await expect(service.list(designer, {})).rejects.toMatchObject({ status: 401 });
  });

  it("takes a zero-round version-one legacy project through request, acceptance, scheduling and both kickoff/key confirmations", async () => {
    const f = await setup(false);
    const adminUser = demoSeedData.users.find(user => user.role === "super_admin")!;
    await UserModel.create({ ...adminUser, _id: adminUser.id });
    const admin: PublicUser = { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: "super_admin" };
    const designer: PublicUser = { id: f.replacement.id, name: f.replacement.name, email: f.replacement.email, role: "designer" };
    await ProjectModel.updateOne({ _id: PROJECT }, { $unset: { estimationWorkflowVersion: 1 }, $set: { primaryDesignerId: null } });
    await EstimateModel.updateOne({ _id: ESTIMATE }, { $unset: { estimation: 1 }, $set: { version: 1, designPlanStatus: "assigned" } });
    await EstimateClientReviewRoundModel.deleteMany({ estimateId: ESTIMATE });
    await LeadModel.create({ _id: "appointment-lead", projectId: PROJECT, ownerId: "sales-fixture", clientName: "Client", clientEmail: "client@example.test",
      clientMobile: "9000000000", projectName: "Home", location: "Pune", propertyType: "residential", source: "direct", stage: "won", nextAction: "Assign Designer", nextActionAt: NOW });
    const assignments = createDesignerAssignmentService({ audit: f.audit, now: () => NOW });
    const suggestions = await assignments.suggestions(admin, PROJECT);
    expect(suggestions.canRequest).toBe(true);
    const request = await assignments.createRequest(admin, PROJECT, { designerId: designer.id, expectedSourceRevision: suggestions.sourceRevision!, idempotencyKey: "legacy-request-key" });
    await assignments.decideRequest(designer, request.id, { expectedVersion: request.version, decision: "accept", idempotencyKey: "legacy-accept-key" });
    const project = (await f.repository.findProjectById(PROJECT))!;
    const source = await readDesignerHandoffSource(f.repository, project);
    expect(source).toMatchObject({ issue: null, approval: { estimateVersion: 1, reviewRoundId: null }, evidence: { acceptedRequest: { id: request.id } }, designer: { id: designer.id } });
    let sequence = 0;
    const action = async (actor: PublicUser, type: WorkflowActionInput["action"], stageType?: string, data: Record<string, unknown> = {}, proof: Parameters<typeof f.service.act>[3] = null) => f.service.act(actor, PROJECT, {
      action: type, stageId: stageType ? project.designWorkflowStages!.find(stage => stage.type === stageType)!.id : undefined,
      expectedVersion: (await f.repository.findDesignWorkflowState(PROJECT))?.version ?? 0, idempotencyKey: `legacy-workflow-${++sequence}`, note: "Synthetic confirmation", data
    }, proof);
    await action(f.actor, "key_collection_schedule", "key_collection", { mode: "within_48_hours", expectedAssignmentRevision: source.assignmentRevision });
    expect((await f.repository.findDesignWorkflowState(PROJECT))!.stages.key_collection!.appointment).toMatchObject({ approvalReviewRoundId: null, estimateVersion: 1 });
    await expect(action(designer, "keys_received", "key_collection")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await action(admin, "confirm_initial_payment");
    await action(designer, "internal_kickoff_complete", "internal_kickoff", { meetingAt: NOW.toISOString(), designHandoverAcknowledged: true },
      { storageReference: "opaque-legacy-kickoff", originalFilename: "kickoff.pdf", mimeType: "application/pdf", byteSize: 1, sha256: "c".repeat(64) });
    const kickoffEvent = (await f.repository.findDesignWorkflowState(PROJECT))!.history.find(event => event.action === "internal_kickoff_complete")!;
    await action(f.actor, "client_kickoff_complete", "client_kickoff", { reviewedDocumentEventId: kickoffEvent.id });
    await action(f.actor, "keys_handed_over", "key_collection");
    await action(designer, "keys_received", "key_collection");
    const state = (await f.repository.findDesignWorkflowState(PROJECT))!;
    expect(state.stages.key_collection).toMatchObject({ completedAt: NOW.toISOString(), receivedAt: NOW.toISOString(), handedOverAt: NOW.toISOString() });
    expect(projectDesignerHandoff(await readDesignerHandoffSource(f.repository, project), project, state, f.actor, NOW)).toMatchObject({ state: "completed", canSchedule: false });
    expect(await EstimateClientReviewRoundModel.countDocuments({ estimateId: ESTIMATE })).toBe(0);
  });
  it("serializes competing confirmations, persists one audit and replays the original response", async () => {
    const f = await setup();
    const results = await Promise.allSettled([f.service.act(f.actor, PROJECT, f.input, null), f.service.act(f.actor, PROJECT, { ...f.input, idempotencyKey: "competing-confirmation" }, null)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const state = (await f.repository.findDesignWorkflowState(PROJECT))!;
    expect(state.stages.key_collection?.appointment).toMatchObject({ assignmentRequestId: "accepted-request", originalDeadlineAt: "2026-11-27T10:00:00.000Z", deadlineAt: "2026-11-27T10:00:00.000Z" });
    expect(await AuditEventModel.countDocuments({ entityId: PROJECT, action: "design_workflow_action_recorded" })).toBe(1);
    await expect(f.service.act(f.actor, PROJECT, { ...f.input, idempotencyKey: state.history[0]!.idempotencyKey }, null)).resolves.toMatchObject({ replayed: true });
  });

  it("rolls back appointment and Project fence when audit fails", async () => {
    const f = await setup();
    const before = await ProjectModel.findById(PROJECT).lean();
    vi.spyOn(f.audit, "append").mockRejectedValue(new Error("synthetic audit failure"));
    await expect(f.service.act(f.actor, PROJECT, f.input, null)).rejects.toThrow("synthetic audit failure");
    expect(await f.repository.findDesignWorkflowState(PROJECT)).toBeNull();
    expect((await ProjectModel.findById(PROJECT).lean())!.estimationFenceEpoch).toBe(before!.estimationFenceEpoch);
  });

  it("rejects a stale confirmation racing an assignment replacement through the shared Project fence", async () => {
    const f = await setup();
    let reached!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const continueSchedule = new Promise<void>(resolve => { release = resolve; });
    const transaction = f.repository.runInTransaction.bind(f.repository);
    let intercept = true;
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(operation => transaction(tx => operation({ ...tx,
      findProjectEstimationContext: async (id, lock) => {
        if (lock && intercept) { intercept = false; reached(); await continueSchedule; }
        return tx.findProjectEstimationContext(id, lock);
      }
    })));
    const pending = f.service.act(f.actor, PROJECT, f.input, null);
    await waiting;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ProjectModel.updateOne({ _id: PROJECT }, { $set: { primaryDesignerId: f.replacement.id, assignedDesignerIds: [f.replacement.id] }, $inc: { designTeamVersion: 1 } }, { session });
        await EstimateModel.updateOne({ _id: ESTIMATE }, { $set: { designPlanDesignerId: f.replacement.id, designPlanAssignedAt: new Date(NOW.getTime() + 1) } }, { session });
      });
    } finally { await session.endSession(); release(); }
    await expect(pending).rejects.toMatchObject({ code: "ASSIGNMENT_VERSION_CONFLICT" });
    expect(await f.repository.findDesignWorkflowState(PROJECT)).toBeNull();
  });

  it("retains a previously confirmed deadline after replacement and preserves unscheduled legacy history", async () => {
    const f = await setup(false);
    await f.service.act(f.actor, PROJECT, f.input, null);
    await ProjectModel.updateOne({ _id: PROJECT }, { $set: { primaryDesignerId: f.replacement.id, assignedDesignerIds: [f.replacement.id] }, $inc: { designTeamVersion: 1 } });
    const project = (await f.repository.findProjectById(PROJECT))!;
    const state = (await f.repository.findDesignWorkflowState(PROJECT))!;
    const source = await readDesignerHandoffSource(f.repository, project);
    expect(projectDesignerHandoff(source, project, state, f.actor, NOW)).toMatchObject({ designer: { id: f.replacement.id }, canSchedule: false, appointment: { deadlineAt: "2026-11-27T10:00:00.000Z" } });
    const legacy = emptyDesignWorkflowState(PROJECT);
    legacy.stages.key_collection = { receivedAt: NOW.toISOString(), handedOverAt: NOW.toISOString(), completedAt: NOW.toISOString() };
    expect(projectDesignerHandoff(source, project, legacy, f.actor, NOW)).toMatchObject({ state: "completed", appointment: null, canSchedule: false });
  });
});
