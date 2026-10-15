import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { insertChatMongoFixture, chatModels } from "./helpers/project-chat-mongo.js";
import { CHAT_NOW } from "./helpers/project-chat.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectChatExclusionModel } from "../src/models/ProjectChatAction.js";
import { createProjectStatusService } from "../src/services/project-status.service.js";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { readMongoProjectStatusExecutionEvidence } from "../src/repositories/project-status.js";
import { chatUser } from "./helpers/project-chat.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({
  vendorActivations: vi.fn(async (vendors: Array<{ _id: string }>) => new Map(vendors.map(vendor => [String(vendor._id), { effectiveStatus: "active" }])))
}));

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("project-status"); for (const model of [...chatModels, EstimateClientReviewRoundModel, EstimateClientResponseProofModel, ProjectFinanceBucketModel]) await model.syncIndexes(); }, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function fixture() {
  const f = await insertChatMongoFixture();
  await ProjectModel.collection.updateOne({ _id: "a" }, { $set: { designWorkflowStages: createProjectDesignWorkflow("a") } });
  await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { status: "sent_to_client", version: 4, designPlanStatus: null, designPlanVersion: 0, rooms: [{ id: "room-a", label: "Hall" }] } });
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "review-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "a", estimateVersion: 4, sendGeneration: 1,
    status: "pending", decision: null, decisionSource: null, decidedById: null, decidedAt: null, createdAt: new Date(CHAT_NOW), dedupeKey: "a".repeat(64),
    estimateSnapshot: { lineItems: [{ id: "line-electric", catalogueId: "EL01", included: true, roomName: "Hall", specification: "Electrical", unit: "unit", quantity: 1, amount: 100, rate: 100 }] } });
  const service = createProjectStatusService(f);
  return { ...f, statusService: service };
}

describe("project status Mongo snapshot reads", () => {
  it("preserves existing explicit Program Manager participant authority until revoked", async () => {
    const f = await fixture();
    await UserModel.create({ ...chatUser("selected-pm", "program_manager"), _id: "selected-pm" });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: "different-pm" } });
    const actor = { ...f.actor("client-a"), id: "selected-pm", role: "program_manager" as const };
    const selection = { id: "selected-pm-membership", projectId: "a", userId: "selected-pm", selectedRole: "program_manager" as const, active: true, version: 1,
      selectedBy: { id: "super", name: "Super", role: "super_admin" as const }, selectedAt: CHAT_NOW, reason: "Support", tradeReference: null, revokedBy: null, revokedAt: null, revocationReason: null };
    await expect(f.statusService.get(actor, "a")).rejects.toMatchObject({ status: 404 });
    await f.chatRepository.mutate(tx => tx.saveSelection(selection));
    expect(await f.statusService.get(actor, "a")).toMatchObject({ projectId: "a" });
    await expect(f.statusService.get(actor, "b")).rejects.toMatchObject({ status: 404 });
    await expect(f.service.actionTypes(actor, "a")).rejects.toMatchObject({ status: 403 });
    await f.chatRepository.mutate(tx => tx.saveSelection({ ...selection, active: false, version: 2 }));
    await expect(f.statusService.get(actor, "a")).rejects.toMatchObject({ status: 404 });
  });

  it("uses current exact Program Manager assignment for status while keeping chat denied", async () => {
    const f = await fixture();
    await UserModel.create({ ...chatUser("pm-status", "program_manager"), _id: "pm-status" });
    await UserModel.create({ ...chatUser("other-pm-status", "program_manager"), _id: "other-pm-status" });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: "pm-status" } });
    const actor = { ...f.actor("client-a"), id: "pm-status", role: "program_manager" as const };
    expect(await f.statusService.get(actor, "a")).toMatchObject({ projectId: "a", currentStage: { key: "estimate_approval" } });
    await expect(f.statusService.get(actor, "b")).rejects.toMatchObject({ status: 404 });
    await expect(f.service.actionTypes(actor, "a")).rejects.toMatchObject({ status: 403 });
    await ProjectModel.updateOne({ _id: "a" }, { $set: { programManagerId: "other-pm-status" } });
    await expect(f.statusService.get(actor, "a")).rejects.toMatchObject({ status: 404 });
    expect(await f.statusService.get({ ...actor, id: "other-pm-status" }, "a")).toMatchObject({ projectId: "a" });
  });
  it("follows pre-approval through design, final approval and exact payment attestation using immutable sources", async () => {
    const f = await fixture();
    const estimation = { ...newEstimationLifecycle(3), phase: "post" as const, designScopeRevision: 2,
      preApproval: { reviewRoundId: "review-a", estimateVersion: 4, approvedAt: CHAT_NOW } };
    await ProjectModel.collection.updateOne({ _id: "a" }, { $set: { estimationWorkflowVersion: 2, status: "planning" } });
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { estimation, status: "client_approved", version: 9,
      clientDecisionAt: new Date(CHAT_NOW), designPlanStatus: "assigned", designPlanVersion: 0, designPlanDesignerId: "designer-a" } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { phase: "pre", requirementsVersion: 1,
      status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedAt: new Date(CHAT_NOW) } });
    await ProjectFinanceBucketModel.collection.insertOne({ _id: "budget-a", projectId: "a", estimateId: "estimate-a", estimateVersion: 4,
      estimateReviewRoundId: "review-a", status: "pending_design" });
    const designing = await f.statusService.get(f.actor("client-a"), "a");
    expect(designing).toMatchObject({ state: "active", currentStage: { key: "internal_kickoff" } });
    expect(designing.pendingActions.some(action => action.stageKey === "initial_payment")).toBe(false);
    expect(await DesignWorkflowStateModel.countDocuments()).toBe(0);

    const finalApproval = { reviewRoundId: "final-a", estimateVersion: 8, approvedAt: CHAT_NOW, requirementsVersion: 3,
      designReviewRoundId: "design-a", designPlanVersion: 1, designScopeRevision: 2 };
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: {
      estimation: { ...estimation, finalApproval, approvedDesignScopeRevision: 2, status: "client_approved", editClosedAt: CHAT_NOW },
      designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: new Date(CHAT_NOW), designFrozenAt: new Date(CHAT_NOW),
      designPlanApprovedById: "client-a", designPlanApprovalSource: "client_portal" } });
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "final-a", estimateId: "estimate-a", projectId: "a", leadId: "lead-a",
      estimateVersion: 8, sendGeneration: 2, phase: "post", requirementsVersion: 3, designReviewRoundId: "design-a", designPlanVersion: 1,
      designScopeRevision: 2, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a",
      decidedAt: new Date(CHAT_NOW), createdAt: new Date(CHAT_NOW), dedupeKey: "f".repeat(64), estimateSnapshot: {
        subtotal: 100, gst: 18, total: 118, lineItems: [{ id: "line-electric", catalogueId: "EL01", included: true,
          roomName: "Hall", specification: "Electrical", unit: "unit", quantity: 1, amount: 100, rate: 100 }] } });
    await DesignPlanReviewRoundModel.collection.insertOne({ _id: "design-a", estimateId: "estimate-a", projectId: "a", designPlanVersion: 1,
      designScopeRevision: 2, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedByRole: "client",
      decidedAt: new Date(CHAT_NOW), submittedRevisionIds: ["drawing-revision-a"] });
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "drawing-a", estimateId: "estimate-a", active: true });
    await EstimateDesignRevisionModel.collection.insertOne({ _id: "drawing-revision-a", drawingId: "drawing-a", revisionNumber: 1,
      reviewStatus: "approved", reviewerId: "client-a", reviewedAt: new Date(CHAT_NOW) });
    await ProjectFinanceBucketModel.collection.updateOne({ _id: "budget-a" }, { $set: { effectiveBaseline: {
      estimateId: "estimate-a", estimateVersion: 8, estimateReviewRoundId: "final-a" } } });
    const payment = await f.statusService.get(f.actor("client-a"), "a");
    expect(payment).toMatchObject({ state: "active", currentStage: { key: "initial_payment" }, pendingActions: [{ responsibleRole: "super_admin", people: [{ id: "super" }] }] });
    await DesignWorkflowStateModel.collection.insertOne({ _id: "a", projectId: "a", version: 1, estimationWorkflowVersion: 2,
      designStartedAt: CHAT_NOW, initialPaymentAt: CHAT_NOW, initialPaymentEstimateId: "estimate-a", initialPaymentEstimateVersion: 4,
      stages: {}, pauses: [], history: [] });
    expect((await f.statusService.get(f.actor("client-a"), "a")).currentStage?.key).toBe("initial_payment");
    await DesignWorkflowStateModel.collection.updateOne({ _id: "a" }, { $set: { initialPaymentEstimateVersion: 8,
      initialPaymentReviewRoundId: "final-a", initialPaymentDesignReviewRoundId: "design-a" } });
    const paid = await f.statusService.get(f.actor("client-a"), "a");
    expect(paid.state).toBe("active");
    expect(paid.pendingActions.some(action => action.stageKey === "initial_payment")).toBe(false);
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "final-a" }, { $set: { designScopeRevision: 1 } });
    expect(await f.statusService.get(f.actor("client-a"), "a")).toMatchObject({ state: "unavailable", pendingActions: [] });
  });

  it("matches memory pending state, validates membership and performs no domain writes", async () => {
    const f = await fixture();
    const counts = await Promise.all(chatModels.map(model => model.countDocuments()));
    const summary = await f.statusService.get(f.actor("client-a"), "a");
    expect(summary).toMatchObject({ state: "active", currentStage: { key: "estimate_approval" }, pendingActions: [{ people: [{ id: "client-a" }] }] });
    expect(JSON.stringify(summary)).not.toMatch(/chat\.test|Electrical|lineItems|subtotal|storageReference/);
    await expect(f.statusService.get(f.actor("client-b"), "a")).rejects.toMatchObject({ status: 404 });
    expect(await Promise.all(chatModels.map(model => model.countDocuments()))).toEqual(counts);
    await ProjectChatExclusionModel.collection.insertOne({ _id: "excluded-sales", projectId: "a", userId: "sales-a", active: true, version: 1, person: { id: "sales-a", name: "Sales", role: "estimator_sales" }, history: [] });
    await expect(f.statusService.get(f.actor("sales-a"), "a")).rejects.toMatchObject({ status: 404 });
  });

  it("requires exact current immutable approval and matching stored on-behalf proof", async () => {
    const f = await fixture();
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { status: "client_approved", version: 5, clientDecisionAt: new Date(CHAT_NOW), designPlanStatus: "pending_assignment" } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { status: "approved", decision: "approve", decisionSource: "admin_proof", decidedById: "admin-a", decidedAt: new Date(CHAT_NOW) } });
    expect(await EstimateModel.collection.findOne({ _id: "estimate-a" })).not.toHaveProperty("clientDecisionSource");
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
    await EstimateClientResponseProofModel.create({ _id: "proof-a", estimateId: "estimate-a", reviewRoundId: "review-a", uploadedById: "admin-a", uploadedAt: new Date(CHAT_NOW), storageReference: "private-proof-reference", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 100, sha256: "b".repeat(64) });
    const approved = await f.statusService.get(f.actor("client-a"), "a");
    expect(approved).toMatchObject({ state: "active", currentStage: { key: "initial_payment" }, pendingActions: [{ responsibleRole: "super_admin" }, { responsibleRole: "admin", people: [{ id: "admin-a" }], action: "Assign a Designer to prepare the Design plan." }] });
    expect(JSON.stringify(approved)).not.toMatch(/private-proof|proof\.pdf|uploadedById|decidedById|storageReference|sha256/);
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { version: 6 } });
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
  });

  it("recognizes direct Client approval and rejects cross-project or orphan decision sources", async () => {
    const f = await fixture();
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { status: "client_approved", version: 5, clientDecisionAt: new Date(CHAT_NOW), designPlanStatus: "pending_assignment" } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-a", decidedAt: new Date(CHAT_NOW) } });
    expect(await EstimateModel.collection.findOne({ _id: "estimate-a" })).not.toHaveProperty("clientDecisionSource");
    expect((await f.statusService.get(f.actor("client-a"), "a")).currentStage?.key).toBe("initial_payment");
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { decidedById: "admin-a" } });
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { decidedById: "client-a" } });
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { clientDecisionAt: new Date("2026-09-16T21:59:59.000Z") } });
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
    await EstimateModel.collection.updateOne({ _id: "estimate-a" }, { $set: { clientDecisionAt: new Date(CHAT_NOW) } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { projectId: "b" } });
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "review-a" }, { $set: { projectId: "a", estimateId: "orphan-estimate" } });
    expect((await f.statusService.get(f.actor("client-a"), "a")).state).toBe("unavailable");
  });

  it("scopes invited Vendor status reads to a current approved order without granting chat membership", async () => {
    const f = await fixture();
    await AiEstimatorKnowledgeVendorModel.collection.insertMany([
      { _id: "vendor-company-a", status: "active", archivedAt: null },
      { _id: "vendor-company-b", status: "active", archivedAt: null }
    ]);
    await UserModel.insertMany([
      { ...chatUser("vendor-user-a", "vendor", "Vendor A"), vendorId: "vendor-company-a", _id: "vendor-user-a" },
      { ...chatUser("vendor-user-b", "vendor", "Vendor B"), vendorId: "vendor-company-b", _id: "vendor-user-b" }
    ]);
    const actor = (id: string) => ({ id, role: "vendor" as const, sessionVersion: 1, expiresAt: Math.floor(f.clock().getTime() / 1000) + 3600 });
    await expect(f.statusService.get(actor("vendor-user-a"), "a")).rejects.toMatchObject({ status: 404 });
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", projectId: "a", vendorId: "vendor-company-a",
      createdById: "procurement", approvedRevisionId: "revision-a", approvedRevision: 1, cancelledAt: null });
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "revision-a", orderId: "order-a", projectId: "a",
      vendorId: "vendor-company-a", revision: 1 });
    const status = await f.statusService.get(actor("vendor-user-a"), "a");
    expect(status).toMatchObject({ projectId: "a", state: "unavailable", pendingActions: [] });
    await expect(f.statusService.get(actor("vendor-user-b"), "a")).rejects.toMatchObject({ status: 404 });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-company-a" }, { $set: { status: "inactive" } });
    await expect(f.statusService.get(actor("vendor-user-a"), "a")).rejects.toMatchObject({ status: 404 });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-company-a" }, { $set: { status: "active" } });
    await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: { vendorId: "vendor-company-b" } });
    await expect(f.statusService.get(actor("vendor-user-a"), "a")).rejects.toMatchObject({ status: 404 });
    expect(await f.statusService.get(f.actor("client-a"), "a")).toMatchObject({
      state: "active", currentStage: { key: "estimate_approval" },
      pendingActions: [expect.objectContaining({ responsibleRole: "client" })]
    });
  });

  it("names the assigned Procurement owner before the first purchase order", async () => {
    await fixture();
    await UserModel.insertOne({ ...chatUser("procurement-a", "procurement", "Procurement A"), _id: "procurement-a" });
    await ProjectWorkflowTaskModel.collection.insertOne({ _id: "procurement-task-a", projectId: "a", kind: "procurement", assigneeUserId: "procurement-a" });
    const session = await mongoose.startSession();
    try {
      const evidence = await readMongoProjectStatusExecutionEvidence("a", session);
      expect(evidence.procurementOwnerIds).toEqual(["procurement-a"]);
      expect(evidence.people).toEqual([expect.objectContaining({ id: "procurement-a", role: "procurement" })]);
    } finally {
      await session.endSession();
    }
  });

  it("keeps the procurement item creator in project status and exposes only source identity", async () => {
    const f = await fixture();
    await UserModel.insertOne({ ...chatUser("procurement-a", "procurement", "Procurement A"), _id: "procurement-a" });
    await ProjectProcurementItemModel.collection.insertOne({ _id: "procurement-item-a", projectId: "a",
      createdById: "procurement-a", removedAt: null, estimateId: "estimate-a", estimateVersion: 4,
      estimateReviewRoundId: "review-a", itemName: "Private item name" });
    const session = await mongoose.startSession();
    try {
      const evidence = await readMongoProjectStatusExecutionEvidence("a", session);
      expect(evidence.procurementOwnerIds).toContain("procurement-a");
      expect(evidence.procurementSources).toContainEqual({ estimateId: "estimate-a", estimateVersion: 4,
        estimateReviewRoundId: "review-a" });
    } finally {
      await session.endSession();
    }
    const status = await f.statusService.get({ id: "procurement-a", role: "procurement", sessionVersion: 1,
      expiresAt: Math.floor(f.clock().getTime() / 1000) + 3600 }, "a");
    expect(JSON.stringify(status)).not.toContain("Private item name");
  });
});
