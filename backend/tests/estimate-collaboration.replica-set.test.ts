import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../src/middleware/errors.js";
import { createEstimatesRouter } from "../src/routes/estimates.js";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimatePreparationSnapshotModel } from "../src/models/EstimatePreparationSnapshot.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectFinanceBaselineRevisionModel } from "../src/models/ProjectFinanceBaselineRevision.js";
import { ensurePendingProjectFinanceBucket } from "../src/services/project-finance.service.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createEstimatePublicationService } from "../src/services/estimate-publication.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { createEstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import { createEstimateCollaborationService, resolveEstimationPreparationSource } from "../src/services/estimate-collaboration.service.js";
import { assertEstimateEditable, estimatePhysicalScopeChanged, requireEstimateClientMembership } from "../src/services/estimate-collaboration-policy.service.js";
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
  replica = await startMongoReplicaSet("estimate-collaboration");
  await Promise.all([EstimateModel.syncIndexes(), EstimateClientReviewRoundModel.syncIndexes(), EstimatePreparationSnapshotModel.syncIndexes()]);
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
    plannedStartAt: now, plannedEndAt: now, estimationWorkflowVersion: 2, estimateRequirementsVersion: 0 });
  await LeadModel.create({ _id: "collab-lead", ownerId: sales.id, projectId: "collab-project", clientName: client.name,
    clientEmail: client.email, clientMobile: "0000000000", projectName: "Synthetic project", location: "Test location",
    propertyType: "2BHK", source: "walk_in", stage: "new_lead", nextAction: "Estimation", nextActionAt: now });
  await EstimateModel.create({ _id: "collab-estimate", leadId: "collab-lead", ownerId: sales.id, projectId: "collab-project",
    propertyType: "2BHK", rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"],
    lineItems: [{ id: "stable-line", source: "legacy", catalogueId: "legacy-item", roomName: "Bedroom 1", specification: "Wardrobe",
      unit: "sqft", rate: 100, quantity: 10, included: true, amount: 1000, amountPaise: 100000 }],
    subtotal: 1000, gst: 180, total: 1180, subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000,
    estimation: newEstimationLifecycle(), version: 1 });
});

async function publish() {
  const estimate = await EstimateModel.findById("collab-estimate").lean();
  return publication.publishEstimateToClient({ estimateId: "collab-estimate", leadId: "collab-lead", actorId: sales.id,
    expectedEstimateVersion: estimate!.version, expectedStatus: "draft" });
}
async function decide(round: { id: string; version: number }, decision: "approve" | "request_changes" = "approve") {
  return decisions.decide({ estimateId: "collab-estimate", round: { id: round.id, expectedVersion: round.version },
    decision, note: decision === "approve" ? "" : "Change the wardrobe", context: { actor: client, source: "client_portal", proof: null } });
}
async function preApprove() { const pre = await publish(); await decide(pre.clientReview); return pre; }
async function approveDesign() {
  const estimate = await EstimateModel.findById("collab-estimate").lean();
  await DesignPlanReviewRoundModel.collection.insertOne({ _id: "collab-design-round", estimateId: "collab-estimate",
    projectId: "collab-project", designPlanVersion: 3, designScopeRevision: estimate!.estimation.designScopeRevision,
    status: "approved", decision: "approve", decidedAt: now } as any);
  await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { designPlanStatus: "approved", designPlanVersion: 3,
    designPlanDesignerId: designer.id, designFrozenAt: now, "estimation.approvedDesignScopeRevision": estimate!.estimation.designScopeRevision } });
}

function server() {
  const app = express();
  app.use(express.json());
  const auth = { authenticate: async (token: string) => token === "designer" ? designer : token === "client" ? client : sales } as any;
  const leads = { get: async () => ({ id: "collab-lead", ownerId: sales.id, projectId: "collab-project" }) } as any;
  app.use(createEstimatesRouter(auth, leads, audit, {} as any, {} as any, publication, decisions, reviews));
  app.use(errorHandler);
  return app;
}

const legacyLine = (id: string, specification = "Wardrobe") => ({ id, source: "legacy", catalogueId: "legacy-item",
  roomName: "Bedroom 1", specification, unit: "sqft", rate: 100, quantity: 10, included: true });
const saveBody = (expectedVersion: number, lineItems: unknown[] = [legacyLine("stable-line")]) => ({
  expectedVersion, propertyType: "2BHK", rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"], lineItems
});

describe("collaborative estimate lifecycle on a replica set", () => {
  it.each([
    ["deactivated", "release"], ["role_changed", "release"],
    ["deactivated", "withdraw"], ["role_changed", "withdraw"],
    ["deactivated", "save"], ["role_changed", "save"]
  ] as const)("rejects a %s captured staff identity before %s writes", async (change, operation) => {
    const pending = operation === "withdraw" ? await publish() : null;
    if (operation === "release") await preApprove();
    const before = await EstimateModel.findById("collab-estimate").lean();
    const projectBefore = await ProjectModel.findById("collab-project").lean();
    const roundsBefore = await EstimateClientReviewRoundModel.find().lean();
    const auditsBefore = await AuditEventModel.countDocuments();
    await UserModel.updateOne({ _id: sales.id }, { $set: change === "deactivated" ? { active: false } : { role: "client" } });
    // The route authenticator intentionally returns the identity captured before the account change.
    if (operation === "save") {
      const response = await request(server()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer sales")
        .send(saveBody(before!.version, [{ ...legacyLine("stable-line"), quantity: 20 }])).expect(404);
      expect(response.body.error.code).toBe("ESTIMATE_NOT_FOUND");
    } else if (operation === "release") {
      await expect(collaboration.releasePreparation(sales, "collab-estimate", before!.version)).rejects.toMatchObject({ code: "ESTIMATE_NOT_FOUND" });
    } else {
      await expect(collaboration.withdraw(sales, "collab-estimate", { expectedVersion: before!.version,
        reviewRoundId: pending!.clientReview.id, reviewRoundVersion: pending!.clientReview.version, reason: "Captured stale authority" }))
        .rejects.toMatchObject({ code: "ESTIMATE_NOT_FOUND" });
    }
    expect(await EstimateModel.findById("collab-estimate").lean()).toEqual(before);
    expect(await ProjectModel.findById("collab-project").lean()).toEqual(projectBefore);
    expect(await EstimateClientReviewRoundModel.find().lean()).toEqual(roundsBefore);
    expect(await EstimatePreparationSnapshotModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(auditsBefore);
  });

  it("opens a post draft, keeps the pre snapshot immutable, and closes only the exact final design/estimate pair", async () => {
    const pre = await preApprove();
    const afterPre = await EstimateModel.findById("collab-estimate").lean();
    expect(afterPre).toMatchObject({ status: "client_approved", version: 2, designPlanStatus: "pending_assignment",
      estimation: { phase: "post", status: "draft", preApproval: { reviewRoundId: pre.clientReview.id, estimateVersion: 1 } } });
    await expect(publish()).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_RECONCILIATION_REQUIRED" });
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(1);
    await approveDesign();
    const final = await publish();
    await decide(final.clientReview);
    const result = await EstimateModel.findById("collab-estimate").lean();
    expect(result).toMatchObject({ designPlanDesignerId: designer.id, designPlanVersion: 3, designFrozenAt: now,
      estimation: { phase: "post", status: "client_approved", finalApproval: { reviewRoundId: final.clientReview.id,
        estimateVersion: 2, designReviewRoundId: "collab-design-round", designPlanVersion: 3, requirementsVersion: 0 } } });
    expect(() => assertEstimateEditable(result!)).toThrow("editing is closed");
    await request(server()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer sales")
      .send(saveBody(3)).expect(409);
    expect(await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean()).toMatchObject({ status: "approved",
      estimateSnapshot: { rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"] } });
    const source = await resolveEstimationPreparationSource(result!);
    expect(source.source).toMatchObject({ kind: "approved_final", estimateReviewRoundId: final.clientReview.id });
    const [clientView] = await reviews.listClientEstimates(client);
    expect(clientView).toMatchObject({ publishedReview: { phase: "post", canDecide: false },
      preApprovedReview: { reviewRoundId: pre.clientReview.id }, changesFromPre: { noChanges: true } });
  });

  it("withdraws without inventing client feedback and rejects the old decision token", async () => {
    const pending = await publish();
    await collaboration.withdraw(sales, "collab-estimate", { expectedVersion: 1, reviewRoundId: pending.clientReview.id,
      reviewRoundVersion: 1, reason: "Correct scope" });
    expect(await EstimateClientReviewRoundModel.findById(pending.clientReview.id).lean()).toMatchObject({
      status: "superseded", decision: null, decisionSource: null, decidedById: sales.id });
    await expect(decide(pending.clientReview)).rejects.toMatchObject({ code: "ESTIMATE_NOT_REVIEWABLE" });
    const next = await publish();
    expect(next.clientReview.id).not.toBe(pending.clientReview.id);
    expect(next.clientReview.estimateVersion).toBe(2);
  });

  it("lets a final change request retain completed design and be resubmitted", async () => {
    await preApprove(); await approveDesign();
    const final = await publish(); await decide(final.clientReview, "request_changes");
    const current = await EstimateModel.findById("collab-estimate").lean();
    expect(current).toMatchObject({ status: "client_approved", designPlanStatus: "approved", designPlanDesignerId: designer.id,
      estimation: { status: "client_changes_requested", editClosedAt: null } });
    expect(() => assertEstimateEditable(current!)).not.toThrow();
  });

  it("releases a distinct immutable preparation source without claiming approval", async () => {
    await preApprove();
    const source = await collaboration.releasePreparation(sales, "collab-estimate", 2);
    expect(source).toMatchObject({ kind: "released_post", estimateReviewRoundId: null, estimateVersion: 2 });
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "lineItems.0.quantity": 20 }, $inc: { version: 1 } });
    const resolved = await resolveEstimationPreparationSource((await EstimateModel.findById("collab-estimate").lean())!);
    expect(resolved.source).toEqual(source);
    expect(resolved.snapshot.lineItems[0]!.quantity).toBe(10);
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(1);
  });

  it("rejects matching-email clients until they accept this exact project", async () => {
    const pending = await publish();
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { clientId: null } });
    expect(await reviews.listClientEstimates(client)).toEqual([]);
    await expect(reviews.readClientPdf(client, pending.clientReview.id)).rejects.toMatchObject({ status: 404 });
    await expect(decide(pending.clientReview)).rejects.toMatchObject({ status: 404 });
    expect(await EstimateClientReviewRoundModel.findById(pending.clientReview.id).lean()).toMatchObject({ status: "pending" });
  });

  it("enforces project membership when estimate metadata is missing and fails closed on a mismatched lead project", async () => {
    const pending = await publish();
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { clientId: null } });
    const withoutMetadata = { ...(await EstimateModel.findById("collab-estimate").lean())!, estimation: undefined };
    await expect(requireEstimateClientMembership(client, withoutMetadata)).rejects.toMatchObject({ status: 404 });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { clientId: client.id } });
    await LeadModel.updateOne({ _id: "collab-lead" }, { $set: { projectId: "other-project" } });
    expect(await reviews.listClientEstimates(client)).toEqual([]);
    await expect(reviews.readClientPdf(client, pending.clientReview.id)).rejects.toMatchObject({ status: 404 });
    await expect(decide(pending.clientReview)).rejects.toMatchObject({ status: 404 });
  });

  it("serializes withdrawal against client approval to a single winning transition", async () => {
    const pending = await publish();
    const outcomes = await Promise.allSettled([decide(pending.clientReview), collaboration.withdraw(sales, "collab-estimate", {
      expectedVersion: 1, reviewRoundId: pending.clientReview.id, reviewRoundVersion: 1, reason: "Scope changed" })]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const round = await EstimateClientReviewRoundModel.findById(pending.clientReview.id).lean();
    expect(["approved", "superseded"]).toContain(round!.status);
  });

  it("refuses stale approved design scope even when the design status says approved", async () => {
    await preApprove(); await approveDesign();
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $inc: { "estimation.designScopeRevision": 1, version: 1 } });
    await expect(publish()).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_RECONCILIATION_REQUIRED" });
  });

  it("treats commercial-only updates differently from room or quantity changes", () => {
    const before = { rooms: [{ id: "room", label: "Bedroom" }], lineItems: [{ id: "stable", included: true, quantity: 2, rate: 100 }] };
    expect(estimatePhysicalScopeChanged(before, { ...before, lineItems: [{ ...before.lineItems[0], rate: 120 }] })).toBe(false);
    expect(estimatePhysicalScopeChanged(before, { ...before, lineItems: [{ ...before.lineItems[0], quantity: 3 }] })).toBe(true);
    expect(estimatePhysicalScopeChanged(before, { ...before, lineItems: [{ ...before.lineItems[0], modeTier: "signature" }] })).toBe(false);
    expect(estimatePhysicalScopeChanged(before, { ...before, lineItems: [{ ...before.lineItems[0], modeTier: "premium" }] })).toBe(true);
    expect(estimatePhysicalScopeChanged(before, { ...before, lineItems: [{ ...before.lineItems[0], selectedInHouseComponentIds: ["a"] }] })).toBe(true);
    const selected = { ...before, lineItems: [{ ...before.lineItems[0], selectedInHouseComponentIds: ["b", "a"] }] };
    expect(estimatePhysicalScopeChanged(selected, { ...selected, lineItems: [{ ...selected.lineItems[0], selectedInHouseComponentIds: ["a", "b"] }] })).toBe(false);
    const measured = { ...before, lineItems: [{ ...before.lineItems[0], quantity: 12, dimensionsMandatory: true, dimensions: { length: "2", width: "6", height: "8" } }] };
    expect(estimatePhysicalScopeChanged(measured, { ...measured, lineItems: [{ ...measured.lineItems[0], dimensions: { length: "3", width: "4", height: "8" } }] })).toBe(true);
    expect(estimatePhysicalScopeChanged(measured, { ...measured, lineItems: [{ ...measured.lineItems[0], dimensions: { length: "2", width: "6", height: "9" } }] })).toBe(true);
  });

  it("retains legacy line identity when a preceding line is removed and rejects stale saves", async () => {
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $push: { lineItems: {
      ...legacyLine("second-line", "Shelf"), amount: 1000, amountPaise: 100000
    } } });
    const app = server();
    const response = await request(app).put("/leads/collab-lead/estimate").set("Authorization", "Bearer sales")
      .send(saveBody(1, [legacyLine("second-line", "Shelf")])).expect(200);
    expect(response.body.data.lineItems.map((line: any) => line.id)).toEqual(["second-line"]);
    expect(response.body.data.version).toBe(2);
    await request(app).put("/leads/collab-lead/estimate").set("Authorization", "Bearer sales")
      .send(saveBody(1, [legacyLine("second-line", "Shelf")])).expect(409);
  });

  it("allows the assigned post designer to save without resetting completed design, and rejects clients", async () => {
    await preApprove(); await approveDesign();
    const response = await request(server()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer designer")
      .send(saveBody(2, [{ ...legacyLine("stable-line"), quantity: 15 }])).expect(200);
    expect(response.body.data).toMatchObject({ designPlanStatus: "approved", designPlanVersion: 3, designPlanDesignerId: designer.id,
      estimation: { status: "draft", designScopeRevision: 2, approvedDesignScopeRevision: 1 } });
    await request(server()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer client").send(saveBody(3)).expect(403);
    await expect(publish()).rejects.toMatchObject({ code: "ESTIMATE_DESIGN_RECONCILIATION_REQUIRED" });
  });

  it("transitions an eligible legacy pre-approval without changing membership, design work or its historical round", async () => {
    const pre = await preApprove();
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $unset: { estimation: "" },
      $set: { designPlanDesignerId: designer.id, designPlanVersion: 2, designPlanStatus: "in_progress" } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $unset: { estimationWorkflowVersion: "" } });
    const result = await collaboration.enable(sales, "collab-estimate", 2);
    expect(result).toMatchObject({ designPlanDesignerId: designer.id, designPlanVersion: 2,
      estimation: { phase: "post", preApproval: { reviewRoundId: pre.clientReview.id, estimateVersion: 1 } } });
    expect(await ProjectModel.findById("collab-project").lean()).toMatchObject({ clientId: client.id, estimationWorkflowVersion: 2 });
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(1);
  });

  it("refuses a completed legacy transition without partially marking the project", async () => {
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $unset: { estimation: "" }, $set: { designPlanStatus: "approved" } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $unset: { estimationWorkflowVersion: "" } });
    await expect(collaboration.enable(sales, "collab-estimate", 1)).rejects.toMatchObject({ code: "ESTIMATE_TRANSITION_CONFLICT" });
    expect((await ProjectModel.findById("collab-project").lean())!.estimationWorkflowVersion).toBeUndefined();
  });

  it("preserves the original finance baseline and selects the final source atomically without opening spending", async () => {
    const financed = createEstimateDecisionService({ audit, reviews,
      estimateDesigns: { approvalReadinessForDecision: vi.fn() }, finance: { ensurePending: ensurePendingProjectFinanceBucket }, now: () => now });
    const approve = (round: { id: string; version: number }) => financed.decide({ estimateId: "collab-estimate",
      round: { id: round.id, expectedVersion: round.version }, decision: "approve", note: "",
      context: { actor: client, source: "client_portal", proof: null } });
    const pre = await publish(); await approve(pre.clientReview);
    await request(server()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer sales")
      .send(saveBody(2, [{ ...legacyLine("stable-line"), rate: 150 }])).expect(200);
    await approveDesign();
    const final = await publish(); await approve(final.clientReview);
    const bucket = await ProjectFinanceBucketModel.findOne({ projectId: "collab-project" }).lean();
    expect(bucket).toMatchObject({ status: "pending_design", approvedContractTotalPaise: 118000,
      estimateReviewRoundId: pre.clientReview.id, effectiveBaseline: { approvedContractTotalPaise: 177000,
        estimateReviewRoundId: final.clientReview.id, phase: "post" } });
    expect(await ProjectFinanceBaselineRevisionModel.countDocuments({ projectId: "collab-project" })).toBe(2);
  });
});
