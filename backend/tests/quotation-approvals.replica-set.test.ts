import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createEstimatesRouter } from "../src/routes/estimates.js";
import { errorHandler } from "../src/middleware/errors.js";
import { newQuotationLifecycle, newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { QuotationUnlockReceiptModel } from "../src/models/QuotationUnlockReceipt.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimatePreparationSnapshotModel } from "../src/models/EstimatePreparationSnapshot.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createEstimatePublicationService } from "../src/services/estimate-publication.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { createEstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import { createEstimateCollaborationService } from "../src/services/estimate-collaboration.service.js";
import { assertDesignWorkflowSubmissionAllowed, createDesignWorkflowStateService } from "../src/services/design-workflow-state.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const client = { id: "collab-client", name: "Test Client", email: "collab-client@example.test", role: "client" } as const;
const sales = { id: "collab-sales", name: "Test Sales", email: "collab-sales@example.test", role: "estimator_sales" } as const;
const designer = { id: "collab-designer", name: "Test Designer", email: "collab-designer@example.test", role: "designer" } as const;
const now = new Date("2026-10-13T10:00:00Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const bytes = Buffer.from("%PDF-synthetic-test");
const storage = {
  savePdfSnapshot: vi.fn(async ({ filename }: { filename: string }) => ({ filename, storageReference: `test/${crypto.randomUUID()}`,
    mimeType: "application/pdf", byteSize: bytes.length, sha256: sha256Hex(bytes) })),
  deleteQuietly: vi.fn(async () => undefined),
  read: vi.fn(async () => bytes)
} as unknown as EstimateClientReviewStorage;
const audit = createAuditService(createMongoRepository());
const reviews = createEstimateClientReviewService({ storage });
const publication = createEstimatePublicationService({ audit, storage,
  pdf: { generate: vi.fn(async () => ({ filename: "test.pdf", bytes })) } as any,
  reviews: { ...reviews, resolveReviewAssignee: async () => ({ assignedAdminId: "collab-super", source: "super_admin_fallback" }) },
  deliverInitial: async () => { throw new Error("Synthetic delivery disabled"); }, now: () => now
});
const decisions = createEstimateDecisionService({ audit, reviews,
  estimateDesigns: { approvalReadinessForDecision: vi.fn() }, now: () => now });
const collaboration = createEstimateCollaborationService(audit);

beforeAll(async () => {
  replica = await startMongoReplicaSet("quotation-approvals");
  await Promise.all([EstimateModel.syncIndexes(), EstimateClientReviewRoundModel.syncIndexes(), EstimatePreparationSnapshotModel.syncIndexes(), QuotationUnlockReceiptModel.syncIndexes(), ProjectWorkflowTaskModel.syncIndexes()]);
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  vi.clearAllMocks();
  await UserModel.insertMany([client, sales, designer].map((user) => ({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "synthetic", role: user.role, active: true, accountKind: "standard", version: 1 })));
  await ProjectModel.create({ _id: "collab-project", name: "Synthetic project", clientId: client.id,
    clientName: client.name, clientEmail: client.email, clientEmailNormalized: client.email, clientMobile: "0000000000",
    clientAddress: "Test location", location: "Test location", assignedEstimatorId: sales.id, status: "planning",
    plannedStartAt: now, plannedEndAt: now, estimationWorkflowVersion: 3, estimateRequirementsVersion: 0 });
  await LeadModel.create({ _id: "collab-lead", ownerId: sales.id, projectId: "collab-project", clientName: client.name,
    clientEmail: client.email, clientMobile: "0000000000", projectName: "Synthetic project", location: "Test location",
    propertyType: "2BHK", source: "walk_in", stage: "new_lead", nextAction: "Estimation", nextActionAt: now });
  await EstimateModel.create({ _id: "collab-estimate", leadId: "collab-lead", ownerId: sales.id, projectId: "collab-project",
    propertyType: "2BHK", rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"],
    lineItems: [{ id: "stable-line", source: "legacy", catalogueId: "legacy-item", roomName: "Bedroom 1", specification: "Wardrobe",
      unit: "sqft", rate: 100, quantity: 10, included: true, amount: 1000, amountPaise: 100000 }],
    subtotal: 1000, gst: 180, total: 1180, subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000,
    estimation: newQuotationLifecycle(), version: 1 });
});

async function publish() {
  const estimate = await EstimateModel.findById("collab-estimate").lean();
  return publication.publishEstimateToClient({ estimateId: "collab-estimate", leadId: "collab-lead", actorId: sales.id,
    expectedEstimateVersion: estimate!.version, expectedStatus: "draft", approveSales: true });
}
async function decide(round: { id: string; version: number }, decision: "approve" | "request_changes" = "approve") {
  return decisions.decide({ estimateId: "collab-estimate", round: { id: round.id, expectedVersion: round.version },
    decision, note: decision === "approve" ? "" : "Change the wardrobe", context: { actor: client, source: "client_portal", proof: null } });
}
async function preApprove() { const pre = await publish(); await decide(pre.clientReview); return pre; }
async function assignPrimary() {
  await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { primaryDesignerId: designer.id, assignedDesignerIds: [designer.id] } });
  await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { designPlanDesignerId: designer.id, designPlanStatus: "draft" } });
}
async function publishDesigner() {
  const estimate = await EstimateModel.findById("collab-estimate").lean();
  return publication.publishEstimateToClient({ estimateId: "collab-estimate", leadId: "collab-lead", actorId: designer.id,
    expectedEstimateVersion: estimate!.version, expectedStatus: "draft" });
}

function submissionServer() {
  const app = express();
  app.use(express.json());
  const auth = { authenticate: async (token: string) => token === "designer" ? designer : sales } as any;
  const leads = { get: async () => ({ id: "collab-lead", ownerId: sales.id, projectId: "collab-project" }) } as any;
  app.use(createEstimatesRouter(auth, leads, audit, {} as any, {} as any, publication, decisions, reviews));
  app.use(errorHandler);
  return app;
}

async function setHighValueQuotation() {
  await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: {
    "lineItems.0.rate": 200_000, "lineItems.0.amount": 2_000_000, "lineItems.0.amountPaise": 200_000_000,
    subtotal: 2_000_000, gst: 360_000, total: 2_360_000,
    subtotalPaise: 200_000_000, gstPaise: 36_000_000, totalPaise: 236_000_000
  } });
}

describe("version 3 two-phase quotation approvals", () => {
  it("advertises publication only for assigned Sales before pre-approval and the primary afterwards", async () => {
    const app = submissionServer();
    const detail = async (actor: string) => (await request(app).get("/leads/collab-lead/estimate").set("Authorization", `Bearer ${actor}`).expect(200)).body.data;
    expect((await detail("sales")).capabilities.canPublishQuotation).toBe(true);
    await preApprove(); await assignPrimary();
    expect((await detail("sales")).capabilities.canPublishQuotation).toBe(false);
    expect((await detail("designer")).capabilities.canPublishQuotation).toBe(true);
    await publishDesigner();
    expect((await detail("designer")).capabilities.canPublishQuotation).toBe(false);
  });
  it("submits both quotation phases above ₹15 lakh directly to the Client with the required actor evidence", async () => {
    await setHighValueQuotation();
    const app = submissionServer();
    const pre = await request(app).post("/leads/collab-lead/estimate/submit").set("Authorization", "Bearer sales")
      .send({ expectedVersion: 1, approveSales: true }).expect(200);
    expect(pre.body.data).toMatchObject({ status: "sent_to_client", approvalRequired: false,
      estimation: { workflowVersion: 3, phase: "pre", status: "sent_to_client" } });
    const preRound = await EstimateClientReviewRoundModel.findById(pre.body.data.clientReview.id).lean();
    expect(preRound).toMatchObject({ phase: "pre", estimateVersion: 1, submittedById: sales.id,
      salesApproval: { actorId: sales.id, sourceDigest: quotationSnapshotDigest(preRound!.estimateSnapshot) } });
    await decide(pre.body.data.clientReview);
    await assignPrimary();
    const post = await request(app).post("/leads/collab-lead/estimate/submit").set("Authorization", "Bearer designer")
      .send({ expectedVersion: 2 }).expect(200);
    expect(post.body.data).toMatchObject({ status: "sent_to_client", approvalRequired: false,
      estimation: { workflowVersion: 3, phase: "post", status: "sent_to_client" } });
    const postRound = await EstimateClientReviewRoundModel.findById(post.body.data.clientReview.id).lean();
    expect(postRound).toMatchObject({ phase: "post", estimateVersion: 2, submittedById: designer.id, salesApproval: null });
    await decide(post.body.data.clientReview);
    const approved = await EstimateModel.findById("collab-estimate").lean();
    expect(approved).toMatchObject({ approvalRequired: false, assignedDesignerId: null,
      designPlanVersion: 0, estimation: { editClosedAt: now.toISOString(), finalApproval: { reviewRoundId: postRound!._id } } });
    expect(approved!.reviews.some((review: any) => review.action === "designer_assigned")).toBe(false);
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(2);
    expect(await DesignPlanReviewRoundModel.countDocuments()).toBe(0);
  });

  it("preserves the version-2 manager approval threshold on the submission route", async () => {
    await setHighValueQuotation();
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { estimation: newEstimationLifecycle() } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { estimationWorkflowVersion: 2 } });
    const response = await request(submissionServer()).post("/leads/collab-lead/estimate/submit").set("Authorization", "Bearer sales")
      .send({ expectedVersion: 1 }).expect(200);
    expect(response.body.data).toMatchObject({ approvalRequired: true, status: "pending_manager_assignment",
      estimation: { workflowVersion: 2, status: "pending_manager_assignment" } });
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(0);
  });

  it("requires explicit assigned Sales approval and binds it to the immutable priced snapshot", async () => {
    await expect(publication.publishEstimateToClient({ estimateId: "collab-estimate", leadId: "collab-lead", actorId: sales.id,
      expectedEstimateVersion: 1, expectedStatus: "draft" })).rejects.toMatchObject({ code: "ESTIMATE_SALES_APPROVAL_REQUIRED" });
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(0);
    const published = await publish();
    const round = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    expect(round).toMatchObject({ workflowVersion: 3, pricedRevision: 1, submittedById: sales.id,
      estimateSnapshot: { proposal: { templateVersion: "lisno-proposal-v1", issuedAt: now.toISOString() } },
      salesApproval: { actorId: sales.id, estimateVersion: 1, pricedRevision: 1, sourceDigest: quotationSnapshotDigest(round!.estimateSnapshot) } });
    await decide(published.clientReview);
    expect((await EstimateModel.findById("collab-estimate").lean())!.estimation).toMatchObject({ phase: "post", preApproval: { reviewRoundId: published.clientReview.id } });
  });

  it("lets the primary submit and Client approve the second quotation before drawings, then opens design tasks", async () => {
    await preApprove();
    await assignPrimary();
    await expect(publish()).rejects.toMatchObject({ code: "ESTIMATE_PRIMARY_DESIGNER_REQUIRED" });
    const published = await publishDesigner();
    const frozen = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    expect(frozen).toMatchObject({ workflowVersion: 3, phase: "post", submittedById: designer.id });
    await decide(published.clientReview);
    const saved = await EstimateModel.findById("collab-estimate").lean();
    expect(saved).toMatchObject({ designPlanStatus: "draft", designPlanVersion: 0,
      estimation: { status: "client_approved", editClosedAt: now.toISOString(), designApproval: null,
        finalApproval: { reviewRoundId: published.clientReview.id, designReviewRoundId: null, designPlanVersion: null } } });
    const task = await ProjectWorkflowTaskModel.findOne({ estimateId: "collab-estimate", kind: "design_plan_upload" }).lean();
    expect(task).toMatchObject({ openedAt: now, assigneeUserId: designer.id, status: "open" });
    expect(await DesignPlanReviewRoundModel.countDocuments()).toBe(0);
  });

  it("rejects missing or stale Sales evidence without changing Client approval history", async () => {
    const published = await publish();
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.salesApproval": null } });
    await expect(decide(published.clientReview)).rejects.toMatchObject({ code: "ESTIMATE_NOT_REVIEWABLE" });
    expect((await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean())!.status).toBe("pending");
  });

  it("rejects a changed frozen proposal even when its financial line values are untouched", async () => {
    const published = await publish();
    const before = await EstimateModel.findById("collab-estimate").lean();
    // Bypass immutable model guards to simulate corrupt stored data, not a supported edit.
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: published.clientReview.id }, {
      $set: { "estimateSnapshot.proposal.terms.paymentDueWorkingDays": 7 }
    });
    await expect(decide(published.clientReview)).rejects.toMatchObject({ code: "ESTIMATE_NOT_REVIEWABLE" });
    expect(await EstimateModel.findById("collab-estimate").lean()).toEqual(before);
    expect((await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean())!.status).toBe("pending");
  });

  it("reopens once with a reason and preserves all approved history and the prior baseline", async () => {
    await preApprove(); await assignPrimary(); const published = await publishDesigner(); await decide(published.clientReview);
    const approved = await EstimateModel.findById("collab-estimate").lean();
    const frozen = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    const input = { expectedVersion: approved!.version, reviewRoundId: published.clientReview.id, reason: "Client requested another room", idempotencyKey: "unlock-request-001" };
    const first = await collaboration.unlock(sales, "collab-estimate", input);
    const retry = await collaboration.unlock(sales, "collab-estimate", input);
    expect(first).toMatchObject({ version: approved!.version + 1, estimation: { editClosedAt: null, status: "draft", finalApproval: approved!.estimation.finalApproval } });
    expect(retry.version).toBe(first.version);
    expect(await QuotationUnlockReceiptModel.countDocuments()).toBe(1);
    expect(await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean()).toEqual(frozen);
    await expect(collaboration.unlock(sales, "collab-estimate", { ...input, reason: "Different reason" })).rejects.toMatchObject({ code: "QUOTATION_UNLOCK_CONFLICT" });
  });

  it("denies a removed primary and unrelated Sales before any unlock write", async () => {
    await preApprove(); await assignPrimary(); const published = await publishDesigner(); await decide(published.clientReview);
    const approved = await EstimateModel.findById("collab-estimate").lean();
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { primaryDesignerId: "another-designer", assignedEstimatorId: "another-sales" } });
    const input = { expectedVersion: approved!.version, reviewRoundId: published.clientReview.id, reason: "Scope change", idempotencyKey: "unlock-request-002" };
    for (const actor of [designer, sales]) await expect(collaboration.unlock(actor, "collab-estimate", input)).rejects.toMatchObject({ code: "ESTIMATE_NOT_FOUND" });
    expect(await QuotationUnlockReceiptModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById("collab-estimate").lean()).toEqual(approved);
  });
});

describe("explicit version 3 transition", () => {
  beforeEach(async () => {
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { estimation: newEstimationLifecycle() } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { estimationWorkflowVersion: 2 } });
  });

  it("previews without writes, enables a clean draft, and replays the same transition once", async () => {
    const beforeEstimate = await EstimateModel.findById("collab-estimate").lean();
    const beforeProject = await ProjectModel.findById("collab-project").lean();
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview).toMatchObject({ eligible: true, currentWorkflowVersion: 2, targetVersion: 3, estimateVersion: 1, blockers: [] });
    expect(await EstimateModel.findById("collab-estimate").lean()).toEqual(beforeEstimate);
    expect(await ProjectModel.findById("collab-project").lean()).toEqual(beforeProject);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    const input = { expectedVersion: 1, targetVersion: 3 as const, reason: "Enable the revised quotation workflow", previewFingerprint: preview.previewFingerprint };
    const enabled = await collaboration.enableQuotation(sales, "collab-estimate", input);
    expect(enabled).toMatchObject({ version: 2, estimation: { workflowVersion: 3, phase: "pre", pricedRevision: 1, preApproval: null, salesApproval: null } });
    expect((await ProjectModel.findById("collab-project").lean())!.estimationWorkflowVersion).toBe(3);
    expect((await ProjectModel.findById("collab-project").lean())!.designWorkflowStages).toEqual(createProjectDesignWorkflow("collab-project"));
    expect((await collaboration.enableQuotation(sales, "collab-estimate", input)).version).toBe(2);
    expect(await AuditEventModel.countDocuments({ action: "estimate_collaboration_enabled" })).toBe(1);
  });

  it("initializes an empty stage list and opens operational actions only after the second quotation approval", async () => {
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { designWorkflowStages: [] } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    await collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Enable operational quotation handoff", previewFingerprint: preview.previewFingerprint });
    const repository = createMongoRepository();
    await expect(assertDesignWorkflowSubmissionAllowed(repository, "collab-project", { phase: "upload" })).rejects.toMatchObject({
      code: "DESIGN_WORKFLOW_BLOCKED", message: expect.stringContaining("Client must approve the current Designer-revised quotation")
    });
    await preApprove(); await assignPrimary();
    const workflow = createDesignWorkflowStateService(repository, audit, () => now);
    const input = { action: "internal_kickoff_complete" as const, stageId: createProjectDesignWorkflow("collab-project")[0].id,
      expectedVersion: 0, idempotencyKey: "transition-kickoff-check", note: "Record handover", data: { meetingAt: now.toISOString(), designHandoverAcknowledged: true } };
    const proof = { storageReference: "synthetic-kickoff", originalFilename: "kickoff.pdf", mimeType: "application/pdf" as const, byteSize: bytes.length, sha256: sha256Hex(bytes) };
    await expect(workflow.act(designer, "collab-project", input, proof)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const post = await publishDesigner(); await decide(post.clientReview);
    await expect(workflow.act(designer, "collab-project", input, proof)).resolves.toMatchObject({ version: 1, replayed: false });
    expect((await repository.findDesignWorkflowState("collab-project"))!.stages.internal_kickoff?.completedAt).toBe(now.toISOString());
  });

  it("preserves valid configured stage identities and labels", async () => {
    const stages = createProjectDesignWorkflow("collab-project").map((stage, index) => ({ ...stage, id: `configured-stage-${index}`, name: `Configured ${stage.name}` }));
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { designWorkflowStages: stages } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview.eligible).toBe(true);
    await collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Preserve configured operations", previewFingerprint: preview.previewFingerprint });
    expect((await ProjectModel.findById("collab-project").lean())!.designWorkflowStages).toEqual(stages);
  });

  it.each(["duplicate ID", "blank ID", "duplicate order", "wrong order", "fractional order", "legacy type", "missing stage"])("blocks incompatible configured stages: %s", async invalid => {
    const stages = createProjectDesignWorkflow("collab-project");
    if (invalid === "duplicate ID") stages[1].id = stages[0].id;
    if (invalid === "blank ID") stages[1].id = " ";
    if (invalid === "duplicate order") stages[1].order = 0;
    if (invalid === "wrong order") { stages[0].order = 1; stages[1].order = 0; }
    if (invalid === "fractional order") stages[1].order = 1.5;
    if (invalid === "legacy type") stages[1].type = "concept_mood_board";
    if (invalid === "missing stage") stages.pop();
    await ProjectModel.collection.updateOne({ _id: "collab-project" }, { $set: { designWorkflowStages: stages } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview.eligible).toBe(false);
    expect(preview.blockers.join(" ")).toContain("Reconcile the configured design stages");
    await expect(collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Invalid stage configuration", previewFingerprint: preview.previewFingerprint })).rejects.toMatchObject({ code: "ESTIMATE_TRANSITION_CONFLICT" });
    expect((await ProjectModel.findById("collab-project").lean())!.estimationWorkflowVersion).toBe(2);
    expect(await AuditEventModel.countDocuments({ action: "estimate_collaboration_enabled" })).toBe(0);
  });

  it("invalidates preview when configured stages change even without a timestamp update", async () => {
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { designWorkflowStages: createProjectDesignWorkflow("collab-project") } });
    const before = await ProjectModel.findById("collab-project").lean();
    const preview = await collaboration.preview(sales, "collab-estimate");
    await ProjectModel.collection.updateOne({ _id: "collab-project" }, { $set: { "designWorkflowStages.0.name": "Updated handover" } });
    expect((await ProjectModel.findById("collab-project").lean())!.updatedAt).toEqual(before!.updatedAt);
    const updated = await collaboration.preview(sales, "collab-estimate");
    expect(updated.eligible).toBe(true);
    expect(updated.previewFingerprint).not.toBe(preview.previewFingerprint);
    await expect(collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Stale stage preview", previewFingerprint: preview.previewFingerprint })).rejects.toMatchObject({ code: "ESTIMATE_TRANSITION_CONFLICT" });
  });

  it("requires a fresh fingerprint and leaves both project and estimate unchanged on conflicts", async () => {
    const preview = await collaboration.preview(sales, "collab-estimate");
    await ProjectModel.updateOne({ _id: "collab-project" }, { $inc: { estimateRequirementsVersion: 1 } });
    const before = await EstimateModel.findById("collab-estimate").lean();
    await expect(collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "New flow", previewFingerprint: preview.previewFingerprint })).rejects.toMatchObject({ code: "ESTIMATE_TRANSITION_CONFLICT" });
    expect(await EstimateModel.findById("collab-estimate").lean()).toEqual(before);
    expect((await ProjectModel.findById("collab-project").lean())!.estimationWorkflowVersion).toBe(2);
  });

  it("blocks undecided and approved history instead of manufacturing Sales evidence", async () => {
    const pending = await publish();
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview.eligible).toBe(false);
    expect(preview.blockers.join(" ")).toContain("Withdraw the pending Client review");
    await decide(pending.clientReview);
    const approved = await collaboration.preview(sales, "collab-estimate");
    expect(approved.eligible).toBe(false);
    expect(approved.blockers.join(" ")).toContain("Sales approval evidence");
    expect((await EstimateModel.findById("collab-estimate").lean())!.estimation.workflowVersion).toBe(2);
  });

  it("supports an eligible unversioned draft without inventing primary assignment", async () => {
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $unset: { estimation: 1 } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $unset: { estimationWorkflowVersion: 1 } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview).toMatchObject({ eligible: true, currentWorkflowVersion: null });
    await collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Enable current workflow", previewFingerprint: preview.previewFingerprint });
    expect((await ProjectModel.findById("collab-project").lean())!.primaryDesignerId).toBeNull();
  });

  it("blocks mismatched project and quotation lifecycle versions", async () => {
    await ProjectModel.updateOne({ _id: "collab-project" }, { $unset: { estimationWorkflowVersion: 1 } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    expect(preview.eligible).toBe(false);
    expect(preview.blockers.join(" ")).toContain("workflow versions must be reconciled");
  });
});

