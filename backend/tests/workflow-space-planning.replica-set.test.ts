import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignPlanResponseProofModel } from "../src/models/DesignPlanResponseProof.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { LeadModel } from "../src/models/Lead.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { spacePlanningFixture, SPACE_NOW } from "./fixtures/space-planning.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("space-planning-confirmation");
  await Promise.all([AuditEventModel, AuthorizationCoordinationModel, DesignWorkflowStateModel, DesignPlanReviewRoundModel, DesignPlanResponseProofModel, EstimateModel, EstimateClientReviewRoundModel, EstimateDesignDrawingModel, EstimateDesignRevisionModel, EstimatePlanChangeRequestModel, ProjectModel, ProjectFinanceBucketModel, ProjectWorkflowTaskModel, UserModel, LeadModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup() {
  const fixture = spacePlanningFixture(), { seed, project, source, users, state, stageId } = fixture;
  const now = new Date(SPACE_NOW), estimate = seed.estimateSummaries![0]!;
  state.version = 1;
  await UserModel.create(seed.users.map(user => ({ ...user, _id: user.id })));
  await ProjectModel.create({ ...project, _id: project.id, clientMobile: "9000000000", clientAddress: "Test address" });
  await EstimateModel.create({ _id: source.estimateId, leadId: estimate.leadId, projectId: project.id, ownerId: users.estimator_sales!.id, version: 4, status: "client_approved", propertyType: "villa", rooms: [], lineItems: [], subtotal: 1000, gst: 0, total: 1000, designPlanStatus: "approved", designPlanVersion: 2, designPlanApprovedAt: now, designPlanApprovedById: users.client!.id, designPlanApprovalSource: "client_portal", designFrozenAt: now, designLifecycleVersion: 7 });
  await DesignWorkflowStateModel.create({ _id: project.id, ...state });
  await DesignPlanReviewRoundModel.create({ ...source.rounds[0], _id: "space-round", leadId: estimate.leadId, recipientEmail: users.client!.email, clientName: "Client", projectName: "Synthetic project", submittedById: users.designer!.id, submittedAt: now, assignedAdminId: users.admin!.id, attachments: [{ uploadId: "upload", filename: "plan.png", mimeType: "image/png", byteSize: 10, sha256: "a".repeat(64), storageReference: "opaque-synthetic" }] });
  for (const drawing of source.drawings) {
    await EstimateDesignDrawingModel.create({ _id: drawing.id, estimateId: estimate.id, uploadId: "upload", sourcePageId: "page", active: true, verified: true, detectedTitle: "Plan", displayTitle: "Plan", source: "manual", mappingStatus: "misc" });
    const revision = drawing.revisions[0]!;
    await EstimateDesignRevisionModel.create({ ...revision, _id: revision.id, drawingId: drawing.id, sourcePageId: "page", crop: { x: 0, y: 0, width: 10, height: 10 }, croppedFileReference: "opaque-synthetic", label: "Plan", mappingStatus: "misc" });
  }
  const repository = createMongoRepository(), audit = createAuditService(repository), service = createDesignWorkflowStateService(repository, audit, () => now);
  const input: WorkflowActionInput = { action: "space_planning_complete", stageId, expectedVersion: 1, idempotencyKey: "space-confirm-1", note: "", data: { estimateId: source.estimateId, designPlanVersion: 2, reviewRoundId: "space-round" } };
  return { ...fixture, repository, audit, service, input, act: (value = input) => service.act(users.client!, project.id, value, null) };
}

describe("transactional Client space-planning completion", () => {
  it("serializes concurrent keys and same-key replays with exactly one audit and no Design side effects", async () => {
    const { act, input, project } = await setup();
    const results = await Promise.allSettled([act(), act({ ...input, idempotencyKey: "different-confirm-key" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const state = await DesignWorkflowStateModel.findById(project.id).select("+history").lean();
    expect(state!.history).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ action: "design_workflow_action_recorded" })).toBe(1);
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(0);
    expect(await ProjectFinanceBucketModel.countDocuments()).toBe(0);
    expect(await DesignPlanReviewRoundModel.countDocuments()).toBe(1);
    const winner = (state!.history as Array<{ idempotencyKey: string }>)[0]!.idempotencyKey;
    expect(await act({ ...input, idempotencyKey: winner })).toMatchObject({ replayed: true, version: 2 });
  });
  it("rolls back estimate source locking and state when audit fails", async () => {
    const { act, audit, project } = await setup();
    vi.spyOn(audit, "append").mockRejectedValueOnce(new Error("failed audit"));
    await expect(act()).rejects.toThrow("failed audit");
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toMatchObject({ version: 1 });
    expect(await EstimateModel.findById("space-estimate").lean()).toMatchObject({ designLifecycleVersion: 7 });
  });
  it.each(["pending-revision", "extra-revision", "missing-round", "wrong-source", "feedback", "wrong-client"])("rejects %s without completion", async cause => {
    const { act, project, users } = await setup();
    if (cause === "pending-revision") await EstimateDesignRevisionModel.updateOne({ _id: "revision-b" }, { $set: { reviewStatus: "submitted" } });
    if (cause === "extra-revision") await EstimateDesignRevisionModel.collection.insertOne({ _id: "revision-c", drawingId: "drawing-a", revisionNumber: 3, reviewStatus: "approved", reviewerId: users.client!.id, reviewedAt: new Date(SPACE_NOW) } as never);
    if (cause === "missing-round") await DesignPlanReviewRoundModel.deleteMany({});
    if (cause === "wrong-source") await EstimateModel.collection.updateOne({ _id: "space-estimate" } as never, { $set: { projectId: "another-project" } });
    if (cause === "feedback") await EstimatePlanChangeRequestModel.collection.insertOne({ _id: "open-feedback", estimateId: "space-estimate", status: "open" } as never);
    if (cause === "wrong-client") await ProjectModel.updateOne({ _id: project.id }, { $set: { clientId: "someone-else" } });
    await expect(act()).rejects.toMatchObject({ status: cause === "wrong-client" ? 404 : 409 });
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toMatchObject({ version: 1 });
  });
  it("rejects an approval source changed after its read but before the lifecycle write", async () => {
    const { act, project } = await setup();
    let release!: () => void, signal!: () => void;
    const ready = new Promise<void>(resolve => { signal = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    const original = EstimateModel.updateOne.bind(EstimateModel);
    let intercepted = false;
    const guard = vi.spyOn(EstimateModel, "updateOne").mockImplementation((...args: Parameters<typeof EstimateModel.updateOne>) => {
      const filter = args[0] as Record<string, unknown>;
      if (!intercepted && filter.designLifecycleVersion !== undefined) {
        intercepted = true; signal();
        return (async () => { await pause; return original(...args); })() as never;
      }
      return original(...args);
    });
    const completion = act();
    await ready; // The acknowledgement has read the old round and estimate already.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await original({ _id: "space-estimate" }, { $inc: { designLifecycleVersion: 1 }, $set: { designPlanStatus: "changes_requested", designFrozenAt: null } }, { session });
        await EstimateDesignRevisionModel.updateOne({ _id: "revision-b" }, { $set: { reviewStatus: "changes_requested" } }, { session });
      });
    } finally { release(); await session.endSession(); }
    try { await expect(completion).rejects.toMatchObject({ status: 409 }); }
    finally { guard.mockRestore(); }
    expect(intercepted).toBe(true);
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toMatchObject({ version: 1 });
  });
  it("uses the immutable Finance estimate pin and rejects a mismatched approved baseline", async () => {
    const { repository, project, act, input } = await setup();
    const extra = await EstimateModel.findById("space-estimate").lean();
    await EstimateModel.create({ ...extra, _id: "unrelated-approved", leadId: "unrelated-lead", designPlanStatus: null, designPlanVersion: 0 });
    await expect(repository.findDesignWorkflowSpacePlanningSource(project.id)).rejects.toThrow(/ambiguous/);
    await ProjectFinanceBucketModel.collection.insertOne({ _id: "bucket", projectId: project.id, estimateId: "space-estimate", estimateVersion: 3, estimateReviewRoundId: null } as never);
    const historicalRound = await DesignPlanReviewRoundModel.findById("space-round").select("+attachments.storageReference").lean();
    await DesignPlanReviewRoundModel.create({ ...historicalRound, _id: "unrelated-round", estimateId: "unrelated-approved", designPlanVersion: 1 });
    expect((await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion).toBe(true);
    await expect(act({ ...input, data: { estimateId: "unrelated-approved", designPlanVersion: 1, reviewRoundId: "unrelated-round" } })).rejects.toMatchObject({ status: 409 });
    await ProjectFinanceBucketModel.collection.updateOne({ _id: "bucket" } as never, { $set: { estimateVersion: 2 } });
    await expect(act()).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toMatchObject({ version: 1 });
    await ProjectFinanceBucketModel.collection.updateOne({ _id: "bucket" } as never, { $set: { estimateVersion: 3 } });
    expect(await act()).toMatchObject({ version: 2, replayed: false });
  });
  it("rejects malformed representative proof timestamps and accepts the valid immutable proof", async () => {
    const { repository, project, users } = await setup();
    await EstimateModel.updateOne({ _id: "space-estimate" }, { $set: { designPlanApprovalSource: "admin_proof", designPlanApprovedById: users.admin!.id } });
    await DesignPlanReviewRoundModel.updateOne({ _id: "space-round" }, { $set: { decisionSource: "admin_proof", decidedByRole: "admin", decidedById: users.admin!.id } });
    await DesignPlanResponseProofModel.collection.insertOne({ _id: "space-proof", reviewRoundId: "space-round", estimateId: "space-estimate", storageReference: "opaque", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 10, sha256: "a".repeat(64), uploadedById: users.admin!.id, uploadedAt: "not-a-date" } as never);
    expect((await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion).toBe(false);
    await DesignPlanResponseProofModel.collection.updateOne({ _id: "space-proof" } as never, { $set: { uploadedAt: new Date(SPACE_NOW) } });
    expect((await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion).toBe(true);
  });
  it("preserves last-image auto-finalization, and acknowledgement never repeats finance/tasks/mail", async () => {
    const { act, repository, audit, users, project } = await setup();
    await EstimateModel.updateOne({ _id: "space-estimate" }, { $set: { designPlanStatus: "ready_for_client", designFrozenAt: null, designPlanApprovedAt: null, designPlanApprovedById: null, designPlanApprovalSource: null } });
    await DesignPlanReviewRoundModel.updateOne({ _id: "space-round" }, { $set: { status: "pending", decision: null, decisionSource: null, decidedById: null, decidedAt: null, decidedByRole: null } });
    await EstimateDesignRevisionModel.updateOne({ _id: "revision-b" }, { $set: { reviewStatus: "submitted", reviewerId: null, reviewedAt: null } });
    const finance = { open: vi.fn(async () => ({})) }, mailer = { deliveryKind: "disabled" as const };
    const workflow = createProjectWorkflowService({ audit, finance, storage: {} as never, mailer, portalUrl: "https://example.test/client", now: () => new Date(SPACE_NOW) });
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await workflow.recordClientDrawingDecision("space-estimate", users.client!, "approve", "", new Date(SPACE_NOW), session);
    });
    expect(finance.open).not.toHaveBeenCalled();
    expect((await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion).toBe(false);
    await session.withTransaction(async () => {
      await EstimateDesignRevisionModel.updateOne({ _id: "revision-b" }, { $set: { reviewStatus: "approved", reviewerId: users.client!.id, reviewedAt: new Date(SPACE_NOW) } }, { session });
      await workflow.recordClientDrawingDecision("space-estimate", users.client!, "approve", "", new Date(SPACE_NOW), session);
    });
    await session.endSession();
    expect(finance.open).toHaveBeenCalledTimes(1);
    expect((await repository.findDesignWorkflowSpacePlanningSource(project.id))?.readyForCompletion).toBe(true);
    const tasksBefore = await ProjectWorkflowTaskModel.find({}).sort({ _id: 1 }).lean();
    expect(tasksBefore.length).toBeGreaterThan(0);
    await act(); await act();
    expect(finance.open).toHaveBeenCalledTimes(1);
    expect(await ProjectWorkflowTaskModel.find({}).sort({ _id: 1 }).lean()).toEqual(tasksBefore);
    expect(await AuditEventModel.countDocuments({ action: "design_plan_approved" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "design_workflow_action_recorded" })).toBe(1);
  });
});
