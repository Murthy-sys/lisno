import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { ensurePendingProjectFinanceBucket } from "../src/services/project-finance.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const BASE = new Date("2026-09-11T10:00:00.000Z");
const DAY_TWO = new Date("2026-09-13T10:00:00.000Z");
const PROJECT_ID = "state-cas-project";
const PROOF = { storageReference: "opaque-workflow-proof", originalFilename: "signed-checklist.pdf", mimeType: "application/pdf" as const, byteSize: 5, sha256: sha256Hex(Buffer.from("proof")) };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("design-workflow-state-regression");
  await Promise.all([
    ProjectModel.syncIndexes(), UserModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes(),
    AuthorizationCoordinationModel.syncIndexes(), AuditEventModel.syncIndexes(), EstimateModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes(), ProjectFinanceBucketModel.syncIndexes()
  ]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup(withApprovedEstimate = true) {
  const designer = demoSeedData.users.find((user) => user.id === "user-designer-ananya")!;
  const finance = demoSeedData.users.find((user) => user.role === "finance_head")!;
  const manager = demoSeedData.users.find((user) => user.id === designer.managerId)!;
  const client = demoSeedData.users.find((user) => user.role === "client")!;
  await UserModel.create([{ ...designer, _id: designer.id }, { ...finance, _id: finance.id }, { ...manager, _id: manager.id }, { ...client, _id: client.id }]);
  if (withApprovedEstimate) await approvedEstimate("workflow-approved-estimate", 4, "workflow-room");
  const stages = createProjectDesignWorkflow(PROJECT_ID);
  await ProjectModel.create({
    ...demoSeedData.projects[0]!, _id: PROJECT_ID, clientMobile: "9000000000", clientAddress: "Test address",
    assignedDesignerIds: [designer.id], initiatingDesignerId: designer.id, designWorkflowStages: stages, clientId: client.id
  });
  const actor = (user: typeof designer): PublicUser => ({ id: user.id, role: user.role, name: user.name, email: user.email });
  const repository = createMongoRepository();
  const audit = createAuditService(repository);
  const payment: WorkflowActionInput = { action: "confirm_initial_payment", expectedVersion: 0, idempotencyKey: "initial-payment-one", data: {}, note: "Initial receipt reference" };
  const kickoff: WorkflowActionInput = {
    action: "internal_kickoff_complete", expectedVersion: 1, idempotencyKey: "signed-kickoff-one", data: { designHandoverAcknowledged: true, meetingAt: DAY_TWO.toISOString() }, note: "Checklist signed",
    stageId: stages.find((stage) => stage.type === "internal_kickoff")!.id
  };
  return { repository, audit, finance: actor(finance), designer: actor(designer), client: actor(client), stages, payment, kickoff };
}

async function approvedEstimate(id: string, version: number, roomId: string) {
  await EstimateModel.create({
    _id: id, leadId: `lead-${id}`, ownerId: "sales-fixture", projectId: PROJECT_ID,
    version, status: "client_approved", propertyType: "residential", rooms: [{ id: roomId, label: `Room ${id}` }],
    scopes: [], lineItems: [], subtotal: 1000, gst: 0, total: 1000, clientDecisionAt: BASE
  });
}

async function approvedSource(options: { bucketVersion?: number; roundProjectId?: string } = {}) {
  await approvedEstimate("canonical-estimate", 4, "canonical-room");
  await approvedEstimate("independent-estimate", 99, "independent-room");
  await EstimateClientReviewRoundModel.create({
    _id: "canonical-round", estimateId: "canonical-estimate", leadId: "lead-canonical-estimate",
    projectId: options.roundProjectId ?? PROJECT_ID, estimateVersion: 3, sendGeneration: 1, dedupeKey: "a".repeat(64),
    recipientEmail: "client@example.test", recipientEmailNormalized: "client@example.test",
    estimateSnapshot: { clientName: "Client", projectName: "Home", location: "Pune", propertyType: "residential", lineItems: [], subtotal: 1000, gst: 0, total: 1000 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 5, pdfSha256: "b".repeat(64), pdfStorageReference: "opaque-approved-estimate",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1,
    assignedAdminId: "sales-manager-fixture", status: "approved", decision: "approve", decisionSource: "client_portal",
    decisionNote: "Approved", decidedById: "client-fixture", decidedAt: BASE, version: 2
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => ensurePendingProjectFinanceBucket({
      projectId: PROJECT_ID, estimateId: "canonical-estimate", estimateVersion: options.bucketVersion ?? 3,
      estimateReviewRoundId: "canonical-round", approvedSubtotalRupees: 1000, approvedGstRupees: 0,
      approvedContractTotalRupees: 1000, createdById: "client-fixture", occurredAt: BASE
    }, session));
  } finally { await session.endSession(); }
}

describe("Mongo operational workflow state", () => {
  it("serializes version-zero concurrent confirmations, preserves empty stages and hides history by default", async () => {
    const { repository, audit, finance, payment } = await setup();
    const service = createDesignWorkflowStateService(repository, audit, () => BASE);
    const results = await Promise.allSettled([
      service.act(finance, PROJECT_ID, payment, null),
      service.act(finance, PROJECT_ID, { ...payment, idempotencyKey: "initial-payment-two" }, null)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const state = (await repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(state).toMatchObject({ version: 1, stages: {}, initialPaymentAt: BASE.toISOString() });
    expect(state.history).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ action: "design_workflow_action_recorded" })).toBe(1);
    expect(await DesignWorkflowStateModel.findById(PROJECT_ID).lean()).not.toHaveProperty("history");
    await expect(service.act(finance, PROJECT_ID, { ...payment, idempotencyKey: state.history[0]!.idempotencyKey }, null)).resolves.toEqual({ version: 1, replayed: true });
    expect(await DesignWorkflowStateModel.countDocuments()).toBe(1);
  });

  it("rolls back initial state creation when its audit cannot be persisted", async () => {
    const { repository, audit, finance, payment } = await setup();
    const service = createDesignWorkflowStateService(repository, { ...audit, append: async () => { throw new Error("Audit unavailable"); } }, () => BASE);
    await expect(service.act(finance, PROJECT_ID, payment, null)).rejects.toThrow("Audit unavailable");
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("completes kickoff on payment day and keeps its proof and audit atomic and idempotent", async () => {
    const { repository, audit, finance, designer, payment, kickoff } = await setup();
    await createDesignWorkflowStateService(repository, audit, () => BASE).act(finance, PROJECT_ID, payment, null);
    const sameDayKickoff = { ...kickoff, data: { ...kickoff.data, meetingAt: BASE.toISOString() } };
    const initialView = await createProjectService(repository, audit, () => BASE).designWorkflow(designer, PROJECT_ID);
    expect(initialView.projectStages![0]!.operational).toMatchObject({ status: "in_progress", timing: { state: "running", startsAt: BASE.toISOString() } });
    expect(initialView.projectStages![0]!.operational!.availableActions.find((action) => action.id === "internal_kickoff_complete")).toEqual({ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true });
    expect(initialView).not.toHaveProperty("kickoffManager");
    // A management change after opening the form is unrelated to the Designer's receipt.
    await ProjectModel.updateOne({ _id: PROJECT_ID }, { $set: { managerId: null } });
    await UserModel.updateOne({ _id: designer.id }, { $set: { managerId: null } });
    await UserModel.deleteMany({ role: "design_manager" });
    const failing = createDesignWorkflowStateService(repository, { ...audit, append: async () => { throw new Error("Audit unavailable"); } }, () => BASE);
    await expect(failing.act(designer, PROJECT_ID, sameDayKickoff, PROOF)).rejects.toThrow("Audit unavailable");
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toMatchObject({ version: 1, stages: {}, history: [{ action: "confirm_initial_payment" }] });
    const service = createDesignWorkflowStateService(repository, audit, () => BASE);
    await expect(service.act({ ...designer, name: "Stale session name" }, PROJECT_ID, sameDayKickoff, PROOF)).resolves.toEqual({ version: 2, replayed: false });
    await expect(service.act(designer, PROJECT_ID, sameDayKickoff, PROOF)).resolves.toEqual({ version: 2, replayed: true });
    const state = (await repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(state.history).toHaveLength(2);
    const receipt = { completedAt: BASE.toISOString(), meetingAt: BASE.toISOString(), handoverAcknowledgedAt: BASE.toISOString(), handoverAcknowledgedById: designer.id, handoverAcknowledgedByName: designer.name };
    expect(state.history[1]).toMatchObject({ actorId: designer.id, actorName: designer.name, actorRole: "designer", proof: PROOF, data: { ...receipt, designHandoverAcknowledged: true } });
    expect(state.stages.internal_kickoff).toEqual({ ...receipt, timingBasis: "sequential" });
    expect(await AuditEventModel.findOne({ "newValues.action": "internal_kickoff_complete" }).lean()).toMatchObject({ actorId: designer.id, newValues: { ...receipt, designHandoverAcknowledged: true } });
    const completedView = await createProjectService(repository, audit, () => DAY_TWO).designWorkflow(designer, PROJECT_ID);
    expect(completedView.projectStages![0]!.operational!.availableActions).not.toContainEqual(expect.objectContaining({ id: "internal_kickoff_complete" }));
    expect(completedView.projectStages![0]!.operational!.timing).toMatchObject({ state: "completed", endsAt: BASE.toISOString(), designerElapsedMs: 0 });
    expect(await DesignWorkflowStateModel.findById(PROJECT_ID).lean()).not.toHaveProperty("history");
    expect(await AuditEventModel.countDocuments({ action: "design_workflow_action_recorded" })).toBe(2);
  });

  it("rejects missing acknowledgement and spoofed recipients without persisting state or audit changes", async () => {
    const { repository, audit, finance, designer, payment, kickoff } = await setup();
    const service = createDesignWorkflowStateService(repository, audit, () => DAY_TWO);
    await service.act(finance, PROJECT_ID, payment, null);
    const before = await repository.findDesignWorkflowState(PROJECT_ID);
    for (const [data, code] of [
      [{ meetingAt: DAY_TWO.toISOString() }, "KICKOFF_HANDOVER_REQUIRED"],
      [{ ...kickoff.data, designHandoverAcknowledged: false }, "KICKOFF_HANDOVER_REQUIRED"],
      [{ ...kickoff.data, handoverAcknowledgedById: "another-designer" }, "INVALID_WORKFLOW_ACTION"],
      [{ meetingAt: DAY_TWO.toISOString(), handedOverToManager: true, handoverManagerId: "user-manager-aarav" }, "INVALID_WORKFLOW_ACTION"]
    ] as const) await expect(service.act(designer, PROJECT_ID, { ...kickoff, data }, PROOF)).rejects.toMatchObject({ code });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });

  it("atomically closes the Client task without a request, stops its timer and preserves CAS and replay", async () => {
    const { repository, audit, finance, designer, client, payment, kickoff, stages } = await setup();
    await createDesignWorkflowStateService(repository, audit, () => BASE).act(finance, PROJECT_ID, payment, null);
    const service = createDesignWorkflowStateService(repository, audit, () => DAY_TWO);
    const input: WorkflowActionInput = { action: "client_kickoff_complete", stageId: stages[1]!.id, expectedVersion: 1, idempotencyKey: "client-stage-completion", data: {}, note: "Kick off completed" };
    await expect(service.act(client, PROJECT_ID, input, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await service.act(designer, PROJECT_ID, kickoff, PROOF);
    input.expectedVersion = 2;
    input.data = { reviewedDocumentEventId: (await repository.findDesignWorkflowState(PROJECT_ID))!.history.find((event) => event.action === "internal_kickoff_complete")!.id };
    const view = await createProjectService(repository, audit, () => DAY_TWO).designWorkflow(client, PROJECT_ID);
    expect(view.projectStages![1]!.operational).toMatchObject({ availableActions: [{ id: "client_kickoff_complete", label: "Complete Client Kick off", actor: "client", requiresProof: false }], timing: { state: "running", startsAt: DAY_TWO.toISOString(), remainingMs: 4 * 86_400_000 } });
    expect(view.projectStages![1]!.operational!.submittedDocument).toEqual({ eventId: input.data.reviewedDocumentEventId, filename: PROOF.originalFilename, mimeType: PROOF.mimeType, uploadedAt: DAY_TWO.toISOString() });
    await expect(service.proof(client, PROJECT_ID, input.data.reviewedDocumentEventId as string)).resolves.toEqual(PROOF);
    expect(view.notices).toContainEqual(expect.objectContaining({ id: `${PROJECT_ID}:kickoff-pending` }));
    const before = await repository.findDesignWorkflowState(PROJECT_ID);
    await expect(service.act(client, PROJECT_ID, { ...input, data: {} }, null)).rejects.toMatchObject({ code: "KICKOFF_DOCUMENT_REVIEW_REQUIRED" });
    await expect(service.act(client, PROJECT_ID, { ...input, data: { reviewedDocumentEventId: "foreign-event" } }, null)).rejects.toMatchObject({ code: "KICKOFF_DOCUMENT_REVIEW_REQUIRED" });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before);
    const failing = createDesignWorkflowStateService(repository, { ...audit, append: async () => { throw new Error("Audit unavailable"); } }, () => DAY_TWO);
    await expect(failing.act(client, PROJECT_ID, input, null)).rejects.toThrow("Audit unavailable");
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before);
    expect(await AuditEventModel.countDocuments()).toBe(2);
    await expect(service.act(designer, PROJECT_ID, input, null)).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled([
      service.act(client, PROJECT_ID, input, null),
      service.act(client, PROJECT_ID, { ...input, idempotencyKey: "client-stage-concurrent" }, null)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await repository.findDesignWorkflowState(PROJECT_ID))!;
    const event = saved.history.at(-1)!;
    expect(event).toMatchObject({ action: "client_kickoff_complete", actorId: client.id, actorRole: "client", onBehalfOfClient: false, proof: null, data: { reviewedDocumentEventId: input.data.reviewedDocumentEventId } });
    await expect(service.act(client, PROJECT_ID, { ...input, idempotencyKey: event.idempotencyKey }, null)).resolves.toEqual({ version: 3, replayed: true });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toEqual(saved);
    const closed = await createProjectService(repository, audit, () => new Date("2026-09-19T10:00:00.000Z")).designWorkflow(client, PROJECT_ID);
    expect(closed.projectStages![1]!.operational!.timing).toMatchObject({ state: "completed", endsAt: DAY_TWO.toISOString(), remainingMs: 4 * 86_400_000 });
    expect(closed.projectStages![2]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "keys_handed_over" }));
    expect(closed.notices).not.toContainEqual(expect.objectContaining({ id: `${PROJECT_ID}:kickoff-pending` }));
    expect(await AuditEventModel.findOne({ "newValues.action": "client_kickoff_complete" }).lean()).toMatchObject({ actorId: client.id, newValues: { onBehalfOfClient: false, version: 3, reviewedDocumentEventId: input.data.reviewedDocumentEventId } });
    expect(await AuditEventModel.countDocuments()).toBe(3);
  });
});

describe("Mongo approved room source", () => {
  it("pins furniture to approved version N when the live estimate is N+1 and another estimate has a higher version", async () => {
    const { repository, audit, finance, designer, client, payment, kickoff, stages } = await setup(false);
    await approvedSource();
    const expected = { estimateId: "canonical-estimate", estimateVersion: 3, rooms: [{ id: "canonical-room", name: "Room canonical-estimate" }] };
    expect(await repository.findDesignWorkflowRoomContext(PROJECT_ID)).toEqual(expected);
    expect(await repository.runInTransaction((tx) => tx.findDesignWorkflowRoomContext(PROJECT_ID))).toEqual(expected);
    await createDesignWorkflowStateService(repository, audit, () => BASE).act(finance, PROJECT_ID, payment, null);
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toMatchObject({ initialPaymentEstimateId: "canonical-estimate", initialPaymentEstimateVersion: 3, history: [{ data: { estimateId: "canonical-estimate", estimateVersion: 3 } }] });
    const service = createDesignWorkflowStateService(repository, audit, () => DAY_TWO);
    await service.act(designer, PROJECT_ID, kickoff, PROOF);
    const projectView = () => createProjectService(repository, audit, () => DAY_TWO).designWorkflow(designer, PROJECT_ID);
    expect((await projectView()).projectStages![1]!.operational!.timing).toMatchObject({ state: "running", startsAt: DAY_TWO.toISOString(), remainingMs: 4 * 86_400_000 });
    const transition = async (actor: PublicUser, action: WorkflowActionInput["action"], type: string, data: Record<string, unknown> = {}, proof: typeof PROOF | null = null) => service.act(actor, PROJECT_ID, { action, expectedVersion: (await repository.findDesignWorkflowState(PROJECT_ID))!.version, idempotencyKey: `canonical-${action}`, note: "Recorded confirmation", stageId: stages.find((stage) => stage.type === type)!.id, data }, proof);
    await transition(designer, "client_kickoff_not_required", "client_kickoff");
    await transition(client, "keys_handed_over", "key_collection");
    expect((await projectView()).projectStages![3]!.operational!.timing).toMatchObject({ state: "waiting", startsAt: null, remainingMs: null });
    await transition(designer, "keys_received", "key_collection");
    expect((await projectView()).projectStages![3]!.operational!.timing).toMatchObject({ state: "running", startsAt: DAY_TWO.toISOString(), remainingMs: 6 * 86_400_000 });
    await transition(designer, "measurement_assign", "site_measurement", { designerId: designer.id });
    await transition(designer, "measurement_complete", "site_measurement", { mediaFolderUrl: "https://example.test/photos" }, PROOF);
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.stages).toMatchObject({ internal_kickoff: { timingBasis: "sequential" }, client_kickoff: { timingBasis: "sequential" }, site_measurement: { timingBasis: "sequential" } });
    await service.act(designer, PROJECT_ID, {
      action: "furniture_scope", expectedVersion: 7, idempotencyKey: "declare-canonical-rooms", note: "Existing furniture",
      stageId: stages.find((stage) => stage.type === "existing_furniture_dimensions")!.id,
      data: { rooms: [{ id: "canonical-room", required: true }] }
    }, null);
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.stages.existing_furniture_dimensions).toMatchObject({
      scopeEstimateId: "canonical-estimate", scopeEstimateVersion: 3,
      rooms: [{ id: "canonical-room", required: true, uploadedAt: null, proceed: false }]
    });
  });

  it.each([
    { bucketVersion: 4 },
    { roundProjectId: "another-project" }
  ])("rejects inconsistent approval lineage: %j", async (options) => {
    const { repository, audit, finance, payment, designer } = await setup(false);
    await approvedSource(options);
    await expect(repository.findDesignWorkflowRoomContext(PROJECT_ID)).rejects.toBeInstanceOf(RepositoryConflictError);
    const service = createDesignWorkflowStateService(repository, audit, () => BASE);
    expect(await service.queue(finance)).toEqual([]);
    expect((await createProjectService(repository, audit, () => BASE).designWorkflow(designer, PROJECT_ID)).initialPayment).toMatchObject({ status: "awaiting_estimate_approval", canConfirm: false });
    await expect(service.act(finance, PROJECT_ID, payment, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
  });

  it("rejects two approved estimates when no finance source identifies the canonical one", async () => {
    const { repository } = await setup(false);
    await approvedEstimate("first-estimate", 4, "first-room");
    await approvedEstimate("second-estimate", 99, "second-room");
    await expect(repository.findDesignWorkflowRoomContext(PROJECT_ID)).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("requires an approved estimate even when a persisted estimate exists", async () => {
    const { repository, audit, finance, payment } = await setup();
    await EstimateModel.updateOne({ _id: "workflow-approved-estimate" }, { $set: { status: "draft" } });
    const service = createDesignWorkflowStateService(repository, audit, () => BASE);
    expect(await service.queue(finance)).toEqual([]);
    await expect(service.act(finance, PROJECT_ID, payment, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
});
