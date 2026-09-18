import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
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
const MEDIA = { id: "site-photo", storageReference: "opaque-site-photo", originalFilename: "site.png", mimeType: "image/png", byteSize: 12, sha256: sha256Hex(Buffer.from("site-photo")), kind: "image" as const };
const PROOF = { storageReference: "opaque-workflow-proof", originalFilename: "signed-checklist.pdf", mimeType: "application/pdf" as const, byteSize: 5, sha256: sha256Hex(Buffer.from("proof")) };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("design-workflow-state-regression");
  await Promise.all([
    AiEstimatorKnowledgeUomModel.syncIndexes(), AiEstimatorKnowledgeDisplayOrderSequenceModel.syncIndexes(), ProjectModel.syncIndexes(), UserModel.syncIndexes(), DesignWorkflowStateModel.syncIndexes(),
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
  await AiEstimatorKnowledgeUomModel.create({ _id: "uom-cm", code: "cm", name: "Centimetre", decimalScale: 0, displayOrder: 0, status: "active", version: 1, createdById: designer.id, updatedById: designer.id });
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
    scopes: [], lineItems: [{ id: `${roomId}-item`, catalogueId: "CUSTOM", roomName: `Room ${id}`, specification: "Existing item", unit: "nos", rate: 1000, quantity: 1, included: true, amount: 1000 }], subtotal: 1000, gst: 0, total: 1000, clientDecisionAt: BASE
  });
}

async function approvedSource(options: { bucketVersion?: number; roundProjectId?: string; snapshotUnit?: string } = {}) {
  await approvedEstimate("canonical-estimate", 4, "canonical-room");
  await approvedEstimate("independent-estimate", 99, "independent-room");
  await EstimateClientReviewRoundModel.create({
    _id: "canonical-round", estimateId: "canonical-estimate", leadId: "lead-canonical-estimate",
    projectId: options.roundProjectId ?? PROJECT_ID, estimateVersion: 3, sendGeneration: 1, dedupeKey: "a".repeat(64),
    recipientEmail: "client@example.test", recipientEmailNormalized: "client@example.test",
    estimateSnapshot: { clientName: "Client", projectName: "Home", location: "Pune", propertyType: "residential", lineItems: [{ id: "canonical-item", catalogueId: "CUSTOM", roomName: "Room canonical-estimate", specification: "Approved item", unit: options.snapshotUnit ?? "nos", rate: 1000, quantity: 2, included: true, amount: 2000 }], subtotal: 1000, gst: 0, total: 1000 },
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
    const expected = { estimateId: "canonical-estimate", estimateVersion: 3, rooms: [{ id: "canonical-room", name: "Room canonical-estimate", estimateItems: [{ id: "canonical-item", name: "CUSTOM — Approved item", catalogueId: "CUSTOM", specification: "Approved item", quantity: 2, uom: "nos", measurementType: "dimensions" }] }] };
    expect(await repository.findDesignWorkflowRoomContext(PROJECT_ID, true)).toEqual(expected);
    expect(await repository.runInTransaction((tx) => tx.findDesignWorkflowRoomContext(PROJECT_ID, true))).toEqual(expected);
    await createDesignWorkflowStateService(repository, audit, () => BASE).act(finance, PROJECT_ID, payment, null);
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toMatchObject({ initialPaymentEstimateId: "canonical-estimate", initialPaymentEstimateVersion: 3, history: [{ data: { estimateId: "canonical-estimate", estimateVersion: 3 } }] });
    const service = createDesignWorkflowStateService(repository, audit, () => DAY_TWO);
    await service.act(designer, PROJECT_ID, kickoff, PROOF);
    const projectView = () => createProjectService(repository, audit, () => DAY_TWO).designWorkflow(designer, PROJECT_ID);
    expect((await projectView()).projectStages![1]!.operational!.timing).toMatchObject({ state: "running", startsAt: DAY_TWO.toISOString(), remainingMs: 4 * 86_400_000 });
    const transition = async (actor: PublicUser, action: WorkflowActionInput["action"], type: string, data: Record<string, unknown> = {}, proof: typeof PROOF | null = null) => service.act(actor, PROJECT_ID, { action, expectedVersion: (await repository.findDesignWorkflowState(PROJECT_ID))!.version, idempotencyKey: `canonical-${action}`, note: "Recorded confirmation", stageId: stages.find((stage) => stage.type === type)!.id, data }, proof, action === "measurement_complete" ? [MEDIA] : []);
    await transition(designer, "client_kickoff_not_required", "client_kickoff");
    await transition(client, "keys_handed_over", "key_collection");
    expect((await projectView()).projectStages![3]!.operational!.timing).toMatchObject({ state: "waiting", startsAt: null, remainingMs: null });
    await transition(designer, "keys_received", "key_collection");
    expect((await projectView()).projectStages![3]!.operational!.timing).toMatchObject({ state: "running", startsAt: DAY_TWO.toISOString(), remainingMs: 6 * 86_400_000 });
    await transition(designer, "measurement_assign", "site_measurement", { designerId: designer.id });
    await transition(designer, "measurement_complete", "site_measurement", {}, null);
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
    await expect(repository.findDesignWorkflowRoomContext(PROJECT_ID, true)).rejects.toBeInstanceOf(RepositoryConflictError);
    const service = createDesignWorkflowStateService(repository, audit, () => BASE);
    expect(await service.queue(finance)).toEqual([]);
    expect((await createProjectService(repository, audit, () => BASE).designWorkflow(designer, PROJECT_ID)).initialPayment).toMatchObject({ status: "awaiting_estimate_approval", canConfirm: false });
    await expect(service.act(finance, PROJECT_ID, payment, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
  });

  it("uses original snapshot positions for legacy keys and excludes unselected lines without reading live replacements", async () => {
    const { repository } = await setup(false);
    await approvedSource();
    const round = await EstimateClientReviewRoundModel.findById("canonical-round").lean();
    const item = round!.estimateSnapshot.lineItems[0]!;
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "canonical-round" }, { $set: { "estimateSnapshot.lineItems": [{ ...item, id: "excluded-item", included: false }, { ...item, id: null }, { ...item, id: "zero-item", quantity: 0 }] } });
    const source = await repository.findDesignWorkflowRoomContext(PROJECT_ID, true);
    expect(source!.rooms[0]!.estimateItems).toEqual([
      { id: "legacy-estimate-line:canonical-estimate:3:1", name: "CUSTOM — Approved item", catalogueId: "CUSTOM", specification: "Approved item", quantity: 2, uom: "nos", measurementType: "dimensions" },
      { id: "zero-item", name: "CUSTOM — Approved item", catalogueId: "CUSTOM", specification: "Approved item", quantity: 0, uom: "nos", measurementType: "dimensions" }
    ]);
    expect(await repository.runInTransaction(tx => tx.findDesignWorkflowRoomContext(PROJECT_ID, true))).toEqual(source);
  });
  it.each(["version", "duplicate-round", "missing-decision", "ambiguous-room"])("rejects %s approval sources without falling back to live items", async scenario => {
    const { repository, audit, finance, payment } = await setup(false);
    await approvedSource();
    if (scenario === "version") await EstimateClientReviewRoundModel.collection.updateOne({ _id: "canonical-round" }, { $set: { estimateVersion: 2 } });
    if (scenario === "missing-decision") await EstimateClientReviewRoundModel.collection.updateOne({ _id: "canonical-round" }, { $set: { decidedById: null } });
    if (scenario === "duplicate-round") {
      const round = await EstimateClientReviewRoundModel.findById("canonical-round").select("+pdfStorageReference").lean();
      await EstimateClientReviewRoundModel.create({ ...round, _id: "conflicting-round", dedupeKey: "c".repeat(64), sendGeneration: 2 });
    }
    if (scenario === "ambiguous-room") await EstimateModel.collection.updateOne({ _id: "canonical-estimate" }, { $push: { rooms: { id: "duplicate-room", label: "Room canonical-estimate" } } });
    await expect(repository.findDesignWorkflowRoomContext(PROJECT_ID, true)).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
    expect(await AuditEventModel.countDocuments()).toBe(0);
    if (scenario !== "version") {
      expect(await repository.findDesignWorkflowRoomContext(PROJECT_ID)).toMatchObject({ estimateId: "canonical-estimate", estimateVersion: 3 });
      await createDesignWorkflowStateService(repository, audit, () => BASE).act(finance, PROJECT_ID, payment, null);
      expect(await repository.findDesignWorkflowState(PROJECT_ID)).toMatchObject({ initialPaymentEstimateId: "canonical-estimate", initialPaymentEstimateVersion: 3 });
    }
  });

  it("rejects two approved estimates when no finance source identifies the canonical one", async () => {
    const { repository } = await setup(false);
    await approvedEstimate("first-estimate", 4, "first-room");
    await approvedEstimate("second-estimate", 99, "second-room");
    await expect(repository.findDesignWorkflowRoomContext(PROJECT_ID, true)).rejects.toBeInstanceOf(RepositoryConflictError);
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


describe("Mongo measurement media history", () => {
  async function ready() {
    const fixture = await setup();
    const state = emptyDesignWorkflowState(PROJECT_ID);
    state.initialPaymentAt = BASE.toISOString();
    state.stages = {
      internal_kickoff: { completedAt: BASE.toISOString() }, client_kickoff: { completedAt: BASE.toISOString() },
      key_collection: { completedAt: BASE.toISOString(), handedOverAt: BASE.toISOString(), receivedAt: BASE.toISOString() },
      site_measurement: { assignedDesignerId: fixture.designer.id }
    };
    await fixture.repository.saveDesignWorkflowState(PROJECT_ID, 0, state);
    const input: WorkflowActionInput = { action: "measurement_complete", stageId: fixture.stages.find(stage => stage.type === "site_measurement")!.id, expectedVersion: 1, data: {}, note: "Measured", idempotencyKey: "measurement-media-one" };
    return { ...fixture, input, mediaFiles: [MEDIA, { ...MEDIA, id: "video-id", storageReference: "opaque-video", originalFilename: "site.mp4", mimeType: "video/mp4", kind: "video" as const }] };
  }
  it("atomically preserves media-only history, rolls back audit failure and serializes competing completions", async () => {
    const f = await ready(); const before = await f.repository.findDesignWorkflowState(PROJECT_ID);
    const failing = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async () => { throw new Error("Audit unavailable"); } }, () => DAY_TWO);
    await expect(failing.act(f.designer, PROJECT_ID, f.input, null, f.mediaFiles)).rejects.toThrow("Audit unavailable");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 0 });
    const service = createDesignWorkflowStateService(f.repository, f.audit, () => DAY_TWO);
    const outcomes = await Promise.allSettled([
      service.act(f.designer, PROJECT_ID, f.input, null, f.mediaFiles),
      service.act(f.designer, PROJECT_ID, { ...f.input, idempotencyKey: "measurement-media-two" }, null, f.mediaFiles)
    ]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(value => value.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.history).toHaveLength(1); expect(saved.history[0]).toMatchObject({ proof: null, mediaFiles: f.mediaFiles });
    expect(await AuditEventModel.countDocuments()).toBe(1);
    await expect(service.act(f.designer, PROJECT_ID, { ...f.input, idempotencyKey: saved.history[0]!.idempotencyKey }, null, f.mediaFiles.map(file => ({ ...file, id: `retry-${file.id}`, storageReference: `retry-${file.storageReference}` })))).resolves.toEqual({ version: 2, replayed: true });
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(saved);
    expect(await service.media(f.client, PROJECT_ID, saved.history[0]!.id, MEDIA.id)).toEqual(MEDIA);
    await expect(service.media(f.client, "foreign-project", saved.history[0]!.id, MEDIA.id)).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: f.designer.id }, { $set: { active: false } });
    await expect(service.media(f.designer, PROJECT_ID, saved.history[0]!.id, MEDIA.id)).rejects.toMatchObject({ status: 401 });
  });
  it.each([false, true])("reconciles a committed transaction with its entire media set, sketch %s", async sketch => {
    const f = await ready(); const run = f.repository.runInTransaction.bind(f.repository);
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(async operation => {
      await run(operation); throw Object.assign(new Error("Response lost"), { errorLabels: ["UnknownTransactionCommitResult"] });
    });
    const service = createDesignWorkflowStateService(f.repository, f.audit, () => DAY_TWO);
    await expect(service.act(f.designer, PROJECT_ID, f.input, sketch ? PROOF : null, f.mediaFiles)).resolves.toEqual({ version: 2, replayed: false });
    expect((await f.repository.findDesignWorkflowState(PROJECT_ID))!.history[0]).toMatchObject({ proof: sketch ? PROOF : null, mediaFiles: f.mediaFiles });
    expect(await AuditEventModel.countDocuments()).toBe(1);
  });
});

describe("Mongo furniture dimensions review", () => {
  async function ready() {
    const fixture = await setup();
    const state = emptyDesignWorkflowState(PROJECT_ID);
    const at = BASE.toISOString();
    state.initialPaymentAt = at;
    state.stages = { internal_kickoff: { completedAt: at }, client_kickoff: { completedAt: at }, key_collection: { completedAt: at, handedOverAt: at, receivedAt: at }, site_measurement: { completedAt: at }, existing_furniture_dimensions: { acceptedAt: at, scopeEstimateId: "workflow-approved-estimate", scopeEstimateVersion: 3, rooms: [{ id: "workflow-room", name: "Living room", required: true, uploadedAt: null, proceed: false }] } };
    await fixture.repository.saveDesignWorkflowState(PROJECT_ID, 0, state);
    const input: WorkflowActionInput = { action: "furniture_upload", expectedVersion: 1, stageId: fixture.stages.find(stage => stage.type === "existing_furniture_dimensions")!.id, idempotencyKey: "furniture-dimensions-one", note: "Measured", data: { rooms: [{ roomId: "workflow-room", items: [{ estimateItemId: "workflow-room-item", length: 200, width: 90, height: 85, uomId: "uom-cm" }] }] } };
    const service = createDesignWorkflowStateService(fixture.repository, fixture.audit, () => DAY_TWO);
    return { ...fixture, input, service };
  }
  it("round-trips structured revisions, atomically rolls back audit failure and serializes approve versus return", async () => {
    const f = await ready(); const before = await f.repository.findDesignWorkflowState(PROJECT_ID);
    const failing = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async () => { throw new Error("Audit unavailable"); } }, () => DAY_TWO);
    await expect(failing.act(f.designer, PROJECT_ID, f.input, PROOF)).rejects.toThrow("Audit unavailable");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(0);
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const pending = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    const dimensions = pending.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!;
    expect(dimensions).toMatchObject({ revision: 1, status: "pending", items: [{ id: "workflow-room-item", estimateItemId: "workflow-room-item", length: 200, unit: "cm" }] });
    expect(pending.history[0]).toMatchObject({ id: dimensions.submissionEventId, proof: PROOF, actorId: f.designer.id });
    const review = { ...f.input, expectedVersion: pending.version, data: { submissions: [{ roomId: "workflow-room", submissionEventId: dimensions.submissionEventId }] } };
    const outcomes = await Promise.allSettled([
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_dimensions_approve", idempotencyKey: "furniture-approve-one" }, null),
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_dimensions_return", idempotencyKey: "furniture-return-one", note: "Correct width" }, null)
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.version).toBe(3); expect(saved.history).toHaveLength(2); expect(await AuditEventModel.countDocuments()).toBe(2);
    const status = saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.status;
    expect(["approved", "changes_requested"]).toContain(status);
    expect(Boolean(saved.stages.existing_furniture_dimensions!.completedAt)).toBe(status === "approved");
    expect(saved.history[0]).toEqual(pending.history[0]);
  });
  it("deduplicates concurrent uploads and persists return, revision increment and exact current approval", async () => {
    const f = await ready();
    const retries = await Promise.all([f.service.act(f.designer, PROJECT_ID, f.input, PROOF), f.service.act(f.designer, PROJECT_ID, f.input, PROOF)]);
    expect(retries.map(result => result.replayed).sort()).toEqual([false, true]);
    let saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.history).toHaveLength(1); expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 1 });
    const original = saved.history[0]!;
    const review = { ...f.input, action: "furniture_dimensions_return" as const, expectedVersion: saved.version, idempotencyKey: "furniture-return-for-correction", note: "Width needs checking", data: { submissions: [{ roomId: "workflow-room", submissionEventId: original.id }] } };
    await f.service.act(f.client, PROJECT_ID, review, null);
    saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", returnReason: review.note });
    await f.service.act(f.designer, PROJECT_ID, { ...f.input, expectedVersion: saved.version, idempotencyKey: "furniture-dimensions-two" }, PROOF);
    saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    const current = saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!;
    expect(current).toMatchObject({ revision: 2, status: "pending" }); expect(current.submissionEventId).not.toBe(original.id);
    await expect(f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_dimensions_approve", expectedVersion: saved.version, idempotencyKey: "furniture-stale-review" }, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_dimensions_approve", expectedVersion: saved.version, idempotencyKey: "furniture-current-review", data: { submissions: [{ roomId: "workflow-room", submissionEventId: current.submissionEventId }] } }, null);
    const completed = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(completed.stages.existing_furniture_dimensions).toMatchObject({ completedAt: DAY_TWO.toISOString(), rooms: [{ dimensions: { revision: 2, status: "approved" } }] });
    expect(completed.history[0]).toEqual(original); expect(completed.history).toHaveLength(4); expect(await AuditEventModel.countDocuments()).toBe(4);
  });
  it("creates reusable global UOMs with one audit under concurrent duplicate creation and preserves Configuration identity", async () => {
    const f = await ready();
    const before = await f.repository.findDesignWorkflowState(PROJECT_ID);
    const results = await Promise.all([
      f.service.createFurnitureUom(f.designer, PROJECT_ID, { code: " ＭＭ ", name: " Milli metre ", decimalScale: 2 }),
      f.service.createFurnitureUom(f.client, PROJECT_ID, { code: "mm", name: "MILLI metre", decimalScale: 0 })
    ]);
    expect(results.map(result => result.reused).sort()).toEqual([false, true]);
    expect(results[0]!.uom).toEqual(results[1]!.uom);
    const id = results[0]!.uom.id;
    expect(await AiEstimatorKnowledgeUomModel.countDocuments({ codeNormalized: "mm" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: id })).toBe(1);
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before);
    expect(await AiEstimatorKnowledgeUomModel.findById(id).lean()).toMatchObject({ status: "active", version: 1, dependencyEpoch: 0, displayOrder: 1 });
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.findById("masters:uoms").lean()).toMatchObject({ highWaterOrder: 1 });
    expect(await AuditEventModel.findOne({ entityId: id }).lean()).toMatchObject({ newValues: { projectId: PROJECT_ID, source: "furniture_dimensions" } });
  });
  it("shares append ordering and the global catalog with Configuration creates", async () => {
    const f = await ready();
    const user = demoSeedData.users.find(user => user.role === "super_admin")!;
    await UserModel.create({ ...user, _id: user.id });
    const actor: PublicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const configuration = createAiEstimatorKnowledgeReferenceService({ audit: f.audit, now: () => DAY_TWO });
    const [workflow, configured] = await Promise.all([
      f.service.createFurnitureUom(f.client, PROJECT_ID, { code: "MM", name: "Millimetre" }),
      configuration.createMaster(actor, "uoms", { code: "IN", name: "Inch", decimalScale: 2 })
    ]);
    expect(workflow.uom.id).not.toBe(configured.id);
    expect((await AiEstimatorKnowledgeUomModel.find().sort({ displayOrder: 1 }).lean()).map(row => row.displayOrder)).toEqual([0, 1, 2]);
    expect(await f.service.listFurnitureUoms(f.designer, PROJECT_ID)).toContainEqual({ id: configured.id, code: "IN", name: "Inch", decimalScale: 2 });
    expect((await configuration.listMasters(actor, "uoms", {}, { limit: 20, offset: 0 })).items).toContainEqual(expect.objectContaining(workflow.uom));
  });
  it("rolls back UOM creation, sequence allocation and audit as a single transaction", async () => {
    const f = await ready();
    const append = f.audit.append.bind(f.audit);
    const service = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async (...args) => { await append(...args); throw new Error("Injected UOM audit failure"); } }, () => DAY_TWO);
    await expect(service.createFurnitureUom(f.client, PROJECT_ID, { code: "MM", name: "Millimetre" })).rejects.toThrow("Injected UOM audit failure");
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeDisplayOrderSequenceModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it.each(["inactive", "archived", "deleted"])("retains pending measurement snapshots after the UOM is %s and can approve them without re-reading the catalog", async status => {
    const f = await ready();
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const before = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    const original = before.history[0]!;
    const item = before.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]!;
    expect(item).toMatchObject({ uomId: "uom-cm", unit: "cm", uomName: "Centimetre" });
    if (status === "deleted") await AiEstimatorKnowledgeUomModel.deleteOne({ _id: "uom-cm" });
    else await AiEstimatorKnowledgeUomModel.updateOne({ _id: "uom-cm" }, { $set: { status, code: "RENAME", name: "Changed name", ...(status === "archived" ? { archivedAt: DAY_TWO, archivedById: f.designer.id } : {}) } });
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_dimensions_approve", expectedVersion: before.version, idempotencyKey: "approve-unit-snapshot", data: { submissions: [{ roomId: "workflow-room", submissionEventId: original.id }] } }, null);
    const after = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(after.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "approved", items: [item] });
    expect(after.history[0]).toEqual(original);
  });
  it("rejects a returned stale UOM and then accepts explicit active replacement without rewriting the old revision", async () => {
    const f = await ready(); await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    let saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const original = saved.history[0]!;
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_dimensions_return", expectedVersion: saved.version, idempotencyKey: "return-old-unit", note: "Correct dimensions", data: { submissions: [{ roomId: "workflow-room", submissionEventId: original.id }] } }, null);
    await AiEstimatorKnowledgeUomModel.updateOne({ _id: "uom-cm" }, { $set: { status: "inactive" } });
    saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const count = await AuditEventModel.countDocuments();
    await expect(f.service.act(f.designer, PROJECT_ID, { ...f.input, expectedVersion: saved.version, idempotencyKey: "stale-uom-correction" }, PROOF)).rejects.toMatchObject({ code: "FURNITURE_UOM_UNAVAILABLE" });
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(saved); expect(await AuditEventModel.countDocuments()).toBe(count);
    const added = await f.service.createFurnitureUom(f.designer, PROJECT_ID, { code: "MM", name: "Millimetre" });
    const replacement = structuredClone(f.input.data) as { rooms: Array<{ items: Array<{ uomId: string }> }> }; replacement.rooms[0]!.items[0]!.uomId = added.uom.id;
    await f.service.act(f.designer, PROJECT_ID, { ...f.input, expectedVersion: saved.version, idempotencyKey: "new-uom-correction", data: replacement }, PROOF);
    const corrected = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(corrected.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ revision: 2, status: "pending", items: [{ uomId: added.uom.id, unit: "MM", uomName: "Millimetre" }] });
    expect(corrected.history[0]).toEqual(original);
  });
  it("serializes a selection with lifecycle writes and rejects subsequent stale references", async () => {
    const f = await ready(); let selected!: () => void; let release!: () => void;
    const selection = new Promise<void>(resolve => { selected = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const append = f.audit.append.bind(f.audit); vi.spyOn(f.audit, "append").mockImplementationOnce(async (...args) => { selected(); await gate; return append(...args); });
    const upload = f.service.act(f.designer, PROJECT_ID, f.input, PROOF); await selection;
    const archive = mongoose.connection.transaction(async session => AiEstimatorKnowledgeUomModel.findOneAndUpdate({ _id: "uom-cm", status: "active" }, { $set: { status: "archived", archivedAt: DAY_TWO, archivedById: f.designer.id }, $inc: { version: 1 } }, { session, returnDocument: "after" }).lean());
    release(); await upload; await archive;
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 1, status: "archived" });
    expect(await f.repository.runInTransaction(tx => tx.referenceWorkflowUoms(["uom-cm"]))).toEqual([]);
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]).toMatchObject({ unit: "cm", uomName: "Centimetre" });
  });
  it("rechecks stored identity and current project assignment before global creation", async () => {
    const f = await ready();
    await f.service.listFurnitureUoms(f.designer, PROJECT_ID);
    await ProjectModel.updateOne({ _id: PROJECT_ID }, { $set: { assignedDesignerIds: [], initiatingDesignerId: null } });
    await expect(f.service.createFurnitureUom(f.designer, PROJECT_ID, { code: "MM", name: "Millimetre" })).rejects.toMatchObject({ status: 404 });
    await UserModel.updateOne({ _id: f.client.id }, { $set: { active: false } });
    await expect(f.service.createFurnitureUom(f.client, PROJECT_ID, { code: "MM", name: "Millimetre" })).rejects.toMatchObject({ status: 401 });
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(1); expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("preserves measurement history through actual Configuration rename, quantity precision change and archival without widening its privileges", async () => {
    const f = await ready(); const user = demoSeedData.users.find(user => user.role === "super_admin")!;
    await UserModel.create({ ...user, _id: user.id });
    const admin: PublicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const configuration = createAiEstimatorKnowledgeReferenceService({ audit: f.audit, now: () => DAY_TWO });
    await expect(configuration.createMaster(f.client, "uoms", { code: "DENY", name: "Denied", decimalScale: 3 })).rejects.toMatchObject({ status: 403 });
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const original = saved.history[0]!;
    expect(await configuration.updateMaster(admin, "uoms", "uom-cm", { expectedVersion: 1, code: "CM-NEW", name: "Renamed centimetre", decimalScale: 3 })).toMatchObject({ version: 2, decimalScale: 3 });
    expect(await configuration.archiveMaster(admin, "uoms", "uom-cm", { expectedVersion: 2 })).toMatchObject({ status: "archived", version: 3 });
    expect(await f.service.listFurnitureUoms(f.client, PROJECT_ID)).toEqual([]);
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_dimensions_approve", expectedVersion: saved.version, idempotencyKey: "approve-configured-history", data: { submissions: [{ roomId: "workflow-room", submissionEventId: original.id }] } }, null);
    const approved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(approved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "approved", items: [{ uomId: "uom-cm", unit: "cm", uomName: "Centimetre" }] });
    expect(approved.history[0]).toEqual(original);
  });

});

describe("Mongo combined furniture requirements", () => {
  async function ready() {
    const f = await setup(); const state = emptyDesignWorkflowState(PROJECT_ID); const at = BASE.toISOString();
    state.initialPaymentAt = at;
    state.stages = { internal_kickoff: { completedAt: at }, client_kickoff: { completedAt: at }, key_collection: { completedAt: at, handedOverAt: at, receivedAt: at }, site_measurement: { completedAt: at } };
    await f.repository.saveDesignWorkflowState(PROJECT_ID, 0, state);
    const input: WorkflowActionInput = { action: "furniture_scope", expectedVersion: 1, stageId: f.stages.find(stage => stage.type === "existing_furniture_dimensions")!.id, idempotencyKey: "combined-requirements", note: "Measured requirements", data: { rooms: [{ id: "workflow-room", required: true }], dimensions: [{ roomId: "workflow-room", items: [{ estimateItemId: "workflow-room-item", length: 200.123456, width: 90, height: 85, uomId: "uom-cm" }] }] } };
    const service = createDesignWorkflowStateService(f.repository, f.audit, () => DAY_TWO);
    return { ...f, input, service };
  }
  it("rolls back scope, dimensions, unit references and audit together, then deduplicates concurrent retries", async () => {
    const f = await ready(); const before = await f.repository.findDesignWorkflowState(PROJECT_ID);
    const failing = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async () => { throw new Error("Combined audit failed"); } }, () => DAY_TWO);
    await expect(failing.act(f.designer, PROJECT_ID, f.input, PROOF)).rejects.toThrow("Combined audit failed");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 0 });
    const outcomes = await Promise.all([f.service.act(f.designer, PROJECT_ID, f.input, PROOF), f.service.act(f.designer, PROJECT_ID, f.input, { ...PROOF, storageReference: "retry-proof" })]);
    expect(outcomes.map(result => result.replayed).sort()).toEqual([false, true]);
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const stage = saved.stages.existing_furniture_dimensions!;
    expect(saved.history).toHaveLength(1); expect(await AuditEventModel.countDocuments()).toBe(1);
    expect(stage).not.toHaveProperty("acceptedAt"); expect(stage).not.toHaveProperty("completedAt");
    expect(stage.rooms![0]!.dimensions).toMatchObject({ submissionEventId: stage.requirementsSubmissionEventId, status: "pending", revision: 1, items: [{ id: "workflow-room-item", name: "CUSTOM — Existing item", length: 200.123456, unit: "cm", uomId: "uom-cm", uomName: "Centimetre" }] });
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 1 });
  });
  it("serializes combined approve versus return and never partially approves rooms or scope", async () => {
    const f = await ready(); await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const before = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const token = before.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    const review = { ...f.input, expectedVersion: before.version, data: { submissionEventId: token } };
    const results = await Promise.allSettled([
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_accept", idempotencyKey: "combined-approve" }, null),
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_scope_return", idempotencyKey: "combined-return", note: "Check height" }, null)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const stage = saved.stages.existing_furniture_dimensions!;
    expect(saved.history).toHaveLength(2); expect(await AuditEventModel.countDocuments()).toBe(2);
    if (stage.acceptedAt) { expect(stage.completedAt).toBeTruthy(); expect(stage.rooms![0]!.dimensions!.status).toBe("approved"); expect(stage.scopeReturn).toBeUndefined(); }
    else { expect(stage.completedAt).toBeUndefined(); expect(stage.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", returnReason: "Check height" }); expect(stage.scopeReturn!.reason).toBe("Check height"); }
    expect(saved.history[0]).toEqual(before.history[0]);
  });
  it("preserves submitted UOM snapshots across catalog changes and approves the exact combined token", async () => {
    const f = await ready();
    await expect(f.service.createFurnitureUom(f.client, PROJECT_ID, { code: "m", name: "Metre" })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const created = await f.service.createFurnitureUom(f.designer, PROJECT_ID, { code: "m", name: "Metre", decimalScale: 0 });
    const dimensions = f.input.data.dimensions as Array<{ items: Array<{ uomId: string }> }>; dimensions[0]!.items[0]!.uomId = created.uom.id;
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const before = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const token = before.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    await AiEstimatorKnowledgeUomModel.updateOne({ _id: created.uom.id }, { $set: { status: "archived", code: "new-code", name: "Renamed unit", decimalScale: 3 }, $inc: { version: 1, dependencyEpoch: 1 } });
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_accept", expectedVersion: before.version, idempotencyKey: "combined-snapshot-approve", data: { submissionEventId: token } }, null);
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "approved", items: [{ uomId: created.uom.id, unit: "m", uomName: "Metre", length: 200.123456 }] });
    expect(saved.history[0]).toEqual(before.history[0]);
  });
  it("returns then resubmits a new immutable revision, rejects a stale review token and rolls back a failed approval audit", async () => {
    const f = await ready(); await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const first = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const token = first.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_scope_return", expectedVersion: first.version, idempotencyKey: "combined-sendback", note: "Check width", data: { submissionEventId: token } }, null);
    await f.service.act(f.designer, PROJECT_ID, { ...f.input, expectedVersion: first.version + 1, idempotencyKey: "combined-resubmit" }, PROOF);
    const second = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const current = second.stages.existing_furniture_dimensions!;
    expect(current.rooms![0]!.dimensions).toMatchObject({ revision: 2, status: "pending" }); expect(current.scopeReturn).toBeUndefined();
    const review = { ...f.input, action: "furniture_accept" as const, expectedVersion: second.version, idempotencyKey: "combined-corrected-approve", data: { submissionEventId: token } };
    await expect(f.service.act(f.client, PROJECT_ID, review, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    review.data.submissionEventId = current.requirementsSubmissionEventId!;
    const failing = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async () => { throw new Error("Review audit failed"); } }, () => DAY_TWO);
    await expect(failing.act(f.client, PROJECT_ID, review, null)).rejects.toThrow("Review audit failed");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(second);
    await f.service.act(f.client, PROJECT_ID, review, null);
    const complete = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(complete.stages.existing_furniture_dimensions!.completedAt).toBeTruthy(); expect(complete.history[0]).toEqual(first.history[0]);
  });
});

describe("Mongo mixed point and dimension measurements", () => {
  async function ready() {
    const f = await setup();
    await EstimateModel.updateOne({ _id: "workflow-approved-estimate" }, { $push: { lineItems: { id: "workflow-point-item", catalogueId: "CUSTOM", roomName: "Room workflow-approved-estimate", specification: "Light fan switch points", unit: "pts", quantity: 1, included: true, rate: 10, amount: 10 } } });
    const state = emptyDesignWorkflowState(PROJECT_ID); const at = BASE.toISOString(); state.initialPaymentAt = at;
    state.stages = { internal_kickoff: { completedAt: at }, client_kickoff: { completedAt: at }, key_collection: { completedAt: at, handedOverAt: at, receivedAt: at }, site_measurement: { completedAt: at } };
    await f.repository.saveDesignWorkflowState(PROJECT_ID, 0, state);
    const input: WorkflowActionInput = { action: "furniture_scope", expectedVersion: 1, stageId: f.stages.find(stage => stage.type === "existing_furniture_dimensions")!.id, idempotencyKey: "mixed-point-requirements", note: "Measured requirements", data: { rooms: [{ id: "workflow-room", required: true }], dimensions: [{ roomId: "workflow-room", items: [{ estimateItemId: "workflow-room-item", length: 200.123456, width: 90, height: 85, uomId: "uom-cm" }, { estimateItemId: "workflow-point-item", measurementType: "count", quantity: 4, uomId: "uom-cm" }] }] } };
    const service = createDesignWorkflowStateService(f.repository, f.audit, () => DAY_TWO);
    return { ...f, input, service };
  }
  it("classifies only immutable approved point units despite conflicting mutable live estimate units", async () => {
    const f = await setup(false); await approvedSource({ snapshotUnit: " POINTS. " });
    const expected = { id: "canonical-item", measurementType: "count", uom: " POINTS. " };
    expect((await f.repository.findDesignWorkflowRoomOptions(PROJECT_ID))[0]!.estimateItems[0]).toMatchObject(expected);
    expect(await f.repository.runInTransaction(async tx => (await tx.findDesignWorkflowRoomContext(PROJECT_ID, true))!.rooms[0]!.estimateItems[0])).toMatchObject(expected);
    expect(await EstimateModel.findById("canonical-estimate").lean()).toMatchObject({ lineItems: [{ unit: "nos" }] });
  });
  it("atomically round-trips mixed measurements, rolls back failures, replays safely and preserves returned history", async () => {
    const f = await ready(); const before = await f.repository.findDesignWorkflowState(PROJECT_ID); const estimate = await EstimateModel.findById("workflow-approved-estimate").lean();
    const failing = createDesignWorkflowStateService(f.repository, { ...f.audit, append: async () => { throw new Error("Mixed audit failed"); } }, () => DAY_TWO);
    await expect(failing.act(f.designer, PROJECT_ID, f.input, PROOF)).rejects.toThrow("Mixed audit failed");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 0 });
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    await expect(f.service.act(f.designer, PROJECT_ID, f.input, { ...PROOF, storageReference: "retry-mixed-proof" })).resolves.toMatchObject({ replayed: true });
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 1 });
    const first = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const token = first.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    expect(first.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[1]).toEqual({ id: "workflow-point-item", estimateItemId: "workflow-point-item", name: "CUSTOM — Light fan switch points", measurementType: "count", quantity: 4, uomId: "uom-cm", unit: "cm", uomName: "Centimetre" });
    const changed = structuredClone(f.input); (changed.data.dimensions as Array<{ items: Array<{ quantity?: number }> }>)[0]!.items[1]!.quantity = 7;
    await expect(f.service.act(f.designer, PROJECT_ID, changed, PROOF)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_scope_return", expectedVersion: first.version, idempotencyKey: "mixed-return", note: "Check points", data: { submissionEventId: token } }, null);
    const returned = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(returned.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", items: [{ length: 200.123456 }, { quantity: 4 }] });
    await f.service.act(f.designer, PROJECT_ID, { ...changed, expectedVersion: returned.version, idempotencyKey: "mixed-correction" }, PROOF);
    const revised = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const revisedToken = revised.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    const approve = { ...f.input, action: "furniture_accept" as const, expectedVersion: revised.version, idempotencyKey: "mixed-approve", data: { submissionEventId: token } };
    await expect(f.service.act(f.client, PROJECT_ID, approve, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    approve.data.submissionEventId = revisedToken; await f.service.act(f.client, PROJECT_ID, approve, null);
    const complete = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(complete.stages.existing_furniture_dimensions).toMatchObject({ completedAt: DAY_TWO.toISOString(), rooms: [{ dimensions: { status: "approved", revision: 2, items: [{ length: 200.123456 }, { quantity: 7 }] } }] });
    expect(complete.history[0]).toEqual(first.history[0]); expect(await EstimateModel.findById("workflow-approved-estimate").lean()).toEqual(estimate);
  });
  it("serializes competing mixed approvals and returns with a single complete decision", async () => {
    const f = await ready(); await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const state = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    const review = { ...f.input, expectedVersion: state.version, data: { submissionEventId: state.stages.existing_furniture_dimensions!.requirementsSubmissionEventId } };
    const results = await Promise.allSettled([
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_accept", idempotencyKey: "mixed-race-approve" }, null),
      f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_scope_return", idempotencyKey: "mixed-race-return", note: "Check points" }, null)
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "WORKFLOW_VERSION_CONFLICT" } });
    const saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const stage = saved.stages.existing_furniture_dimensions!;
    expect(saved.history).toHaveLength(2); expect(await AuditEventModel.countDocuments()).toBe(2);
    expect(stage.rooms![0]!.dimensions!.items).toMatchObject([{ length: 200.123456 }, { measurementType: "count", quantity: 4 }]);
    expect(stage.rooms![0]!.dimensions!.status).toBe(stage.completedAt ? "approved" : "changes_requested");
    expect(Boolean(stage.acceptedAt)).toBe(Boolean(stage.completedAt));
  });
});

describe("Mongo all selected items including zero estimate quantities", () => {
  async function ready() {
    const f = await setup(false); await approvedSource();
    const rooms = [{ id: "living", label: "Living & Dining" }, { id: "bedroom", label: "Master Bedroom" }, { id: "kitchen", label: "Kitchen" }];
    const base = { catalogueId: "CUSTOM", specification: "Selected item", unit: "nos", included: true, rate: 100, amount: 0 };
    const lines = [
      { ...base, id: "living-positive", roomName: "Living & Dining", quantity: 2, amount: 200 },
      { ...base, id: "living-zero", roomName: "Living & Dining", quantity: 0 },
      { ...base, id: "excluded-bedroom", roomName: "Master Bedroom", quantity: 4, included: false },
      { ...base, id: null, roomName: "Master Bedroom", quantity: 0 },
      { ...base, id: "kitchen-points", roomName: "Kitchen", quantity: 0, unit: "pts" }
    ];
    await EstimateModel.collection.updateOne({ _id: "canonical-estimate" }, { $set: { rooms, lineItems: lines.map((line, index) => ({ ...line, id: `mutable-${index}`, included: false, quantity: 99 })) } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "canonical-round" }, { $set: { "estimateSnapshot.lineItems": lines } });
    const state = emptyDesignWorkflowState(PROJECT_ID); const at = BASE.toISOString(); state.initialPaymentAt = at;
    state.stages = { internal_kickoff: { completedAt: at }, client_kickoff: { completedAt: at }, key_collection: { completedAt: at, handedOverAt: at, receivedAt: at }, site_measurement: { completedAt: at } };
    await f.repository.saveDesignWorkflowState(PROJECT_ID, 0, state);
    const measured = (estimateItemId: string) => ({ estimateItemId, length: 210, width: 90, height: 85, uomId: "uom-cm" });
    const input: WorkflowActionInput = { action: "furniture_scope", expectedVersion: 1, stageId: f.stages.find(stage => stage.type === "existing_furniture_dimensions")!.id, idempotencyKey: "all-selected-requirements", note: "Actual measurements", data: {
      rooms: rooms.map(room => ({ id: room.id, required: true })), dimensions: [
        { roomId: "living", items: [measured("living-positive"), measured("living-zero")] },
        { roomId: "bedroom", items: [measured("legacy-estimate-line:canonical-estimate:3:3")] },
        { roomId: "kitchen", items: [{ estimateItemId: "kitchen-points", measurementType: "count", quantity: 6, uomId: "uom-cm" }] }
      ]
    } };
    return { ...f, input, service: createDesignWorkflowStateService(f.repository, f.audit, () => DAY_TWO) };
  }
  async function legacy(f: Awaited<ReturnType<typeof ready>>, approved = false) {
    const oldInput = structuredClone(f.input);
    oldInput.data.rooms = (oldInput.data.rooms as Array<{ id: string; required: boolean }>).map(room => ({ ...room, required: room.id === "living" }));
    oldInput.data.dimensions = (oldInput.data.dimensions as unknown[]).slice(0, 1);
    await f.service.act(f.designer, PROJECT_ID, oldInput, PROOF);
    let saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    if (approved) {
      await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_accept", expectedVersion: saved.version, idempotencyKey: "historical-approval", data: { submissionEventId: saved.stages.existing_furniture_dimensions!.requirementsSubmissionEventId } }, null);
      saved = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    }
    const stage = saved.stages.existing_furniture_dimensions!; const event = saved.history.find(row => row.id === stage.requirementsSubmissionEventId)!;
    stage.rooms![0]!.dimensions!.items.pop();
    (event.data!.dimensions as Array<{ items: unknown[] }>)[0]!.items.pop();
    await f.repository.saveDesignWorkflowState(PROJECT_ID, saved.version, saved);
    return event;
  }
  it("projects pinned zero-only rooms with original legacy indexes and requires every selected item before exact Client approval", async () => {
    const f = await ready();
    const source = await f.repository.findDesignWorkflowRoomContext(PROJECT_ID, true);
    expect(source).toMatchObject({ estimateId: "canonical-estimate", estimateVersion: 3, rooms: [
      { id: "living", name: "Living & Dining", estimateItems: [{ id: "living-positive", quantity: 2 }, { id: "living-zero", quantity: 0 }] },
      { id: "bedroom", name: "Master Bedroom", estimateItems: [{ id: "legacy-estimate-line:canonical-estimate:3:3", quantity: 0, measurementType: "dimensions" }] },
      { id: "kitchen", name: "Kitchen", estimateItems: [{ id: "kitchen-points", quantity: 0, measurementType: "count" }] }
    ] });
    expect(source!.rooms.map(room => room.estimateItems.length)).toEqual([2, 1, 1]);
    expect(await f.repository.runInTransaction(tx => tx.findDesignWorkflowRoomContext(PROJECT_ID, true))).toEqual(source);
    const before = await f.repository.findDesignWorkflowState(PROJECT_ID); const audits = await AuditEventModel.countDocuments();
    const incomplete = structuredClone(f.input); (incomplete.data.dimensions as Array<{ items: unknown[] }>)[0]!.items.pop();
    await expect(f.service.act(f.designer, PROJECT_ID, incomplete, PROOF)).rejects.toMatchObject({ code: "INVALID_FURNITURE_DIMENSIONS" });
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(audits);
    expect(await AiEstimatorKnowledgeUomModel.findById("uom-cm").lean()).toMatchObject({ dependencyEpoch: 0 });
    await f.service.act(f.designer, PROJECT_ID, f.input, PROOF);
    const pending = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    await f.service.act(f.client, PROJECT_ID, { ...f.input, action: "furniture_accept", expectedVersion: pending.version, idempotencyKey: "all-selected-approval", data: { submissionEventId: pending.stages.existing_furniture_dimensions!.requirementsSubmissionEventId } }, null);
    const complete = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(complete.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
    expect(complete.stages.existing_furniture_dimensions!.rooms!.every(room => room.dimensions!.status === "approved")).toBe(true);
    expect(complete.stages.existing_furniture_dimensions!.rooms![2]!.dimensions!.items[0]).toMatchObject({ quantity: 6, measurementType: "count" });
    expect(complete.history[0]).toEqual(pending.history[0]); expect(await f.repository.findDesignWorkflowRoomContext(PROJECT_ID, true)).toEqual(source);
  });
  it("rejects historical incomplete approval without writes, returns the exact subset, and preserves history after complete resubmission", async () => {
    const f = await ready(); const event = await legacy(f); const before = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    const audits = await AuditEventModel.countDocuments();
    const review = { ...f.input, expectedVersion: before.version, idempotencyKey: "historical-review", data: { submissionEventId: event.id } };
    await expect(f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_accept" }, null)).rejects.toMatchObject({ code: "INVALID_FURNITURE_DIMENSIONS" });
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before); expect(await AuditEventModel.countDocuments()).toBe(audits);
    await f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_scope_return", note: "Enter all selected items" }, null);
    const returned = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(returned.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.status).toBe("changes_requested");
    await f.service.act(f.designer, PROJECT_ID, { ...f.input, expectedVersion: returned.version, idempotencyKey: "complete-resubmission" }, PROOF);
    const revised = (await f.repository.findDesignWorkflowState(PROJECT_ID))!; const stage = revised.stages.existing_furniture_dimensions!;
    expect(stage.rooms![0]!.dimensions!.revision).toBe(2);
    await expect(f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_accept", expectedVersion: revised.version, idempotencyKey: "stale-historical-review" }, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.service.act(f.client, PROJECT_ID, { ...review, action: "furniture_accept", expectedVersion: revised.version, idempotencyKey: "complete-review", data: { submissionEventId: stage.requirementsSubmissionEventId } }, null);
    const complete = (await f.repository.findDesignWorkflowState(PROJECT_ID))!;
    expect(complete.stages.existing_furniture_dimensions!.completedAt).toBeTruthy(); expect(complete.history.find(row => row.id === event.id)).toEqual(event);
  });
  it("leaves approved historical records unchanged when zero-quantity selections become visible", async () => {
    const f = await ready(); await legacy(f, true); const before = await f.repository.findDesignWorkflowState(PROJECT_ID);
    const view = await createProjectService(f.repository, f.audit, () => DAY_TWO).designWorkflow(f.client, PROJECT_ID);
    expect(view.furnitureRooms!.map(room => room.estimateItems.length)).toEqual([2, 1, 1]);
    expect(view.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!.status).toBe("completed");
    expect(await f.repository.findDesignWorkflowState(PROJECT_ID)).toEqual(before);
  });
});
