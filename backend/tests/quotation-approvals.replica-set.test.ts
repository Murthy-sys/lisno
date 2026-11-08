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
import { createEstimateCollaborationService, resolveEstimationPreparationSource } from "../src/services/estimate-collaboration.service.js";
import { approvedProcurementSnapshotFromRows, readProcurementDashboardApprovalRounds, readProcurementDashboardPortfolioReport } from "../src/services/procurement.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { assertDesignWorkflowSubmissionAllowed, createDesignWorkflowStateService } from "../src/services/design-workflow-state.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const client = { id: "collab-client", name: "Test Client", email: "collab-client@example.test", role: "client" } as const;
const sales = { id: "collab-sales", name: "Test Sales", email: "collab-sales@example.test", role: "estimator_sales" } as const;
const designer = { id: "collab-designer", name: "Test Designer", email: "collab-designer@example.test", role: "designer" } as const;
const secondaryDesigner = { ...designer, id: "secondary-designer", email: "secondary-designer@example.test" };
const unrelatedDesigner = { ...designer, id: "unrelated-designer", email: "unrelated-designer@example.test" };
const superAdmin = { id: "collab-super", name: "Test Super Admin", email: "collab-super@example.test", role: "super_admin" } as const;
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
    plannedStartAt: now, plannedEndAt: now, estimationWorkflowVersion: 3, estimateRequirementsVersion: 0,
    designWorkflowStages: createProjectDesignWorkflow("collab-project") });
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
  await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: {
    designPlanDesignerId: designer.id, designPlanStatus: "assigned", designPlanAssignedAt: now
  } });
}
async function publishDesigner() {
  const estimate = await EstimateModel.findById("collab-estimate").lean();
  return publication.publishEstimateToClient({ estimateId: "collab-estimate", leadId: "collab-lead", actorId: designer.id,
    expectedEstimateVersion: estimate!.version, expectedStatus: "draft" });
}

function submissionServer() {
  const app = express();
  app.use(express.json());
  const auth = { authenticate: async (token: string) => token === "designer" ? designer :
    token === "secondary" ? secondaryDesigner : token === "unrelated" ? unrelatedDesigner : sales } as any;
  const leads = { get: async () => ({ id: "collab-lead", ownerId: sales.id, projectId: "collab-project" }) } as any;
  app.use(createEstimatesRouter(auth, leads, audit, {} as any, {} as any, publication, decisions, reviews));
  app.use(errorHandler);
  return app;
}

async function saveDesignerQuantity(quantity: number) {
  const current = await EstimateModel.findById("collab-estimate").lean();
  const line = current!.lineItems[0]!;
  const response = await request(submissionServer()).put("/leads/collab-lead/estimate").set("Authorization", "Bearer designer")
    .send({ expectedVersion: current!.version, propertyType: "2BHK", rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"],
      lineItems: [{ id: "stable-line", source: "legacy", catalogueId: "legacy-item", roomName: "Bedroom 1", specification: "Wardrobe",
        unit: "sqft", rate: line.rate, quantity, included: true }] });
  if (response.status !== 200) throw new Error(`Designer save failed (${response.status}): ${JSON.stringify(response.body)}`);
  return response;
}

async function setHighValueQuotation() {
  await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: {
    "lineItems.0.rate": 200_000, "lineItems.0.amount": 2_000_000, "lineItems.0.amountPaise": 200_000_000,
    subtotal: 2_000_000, gst: 360_000, total: 2_360_000,
    subtotalPaise: 200_000_000, gstPaise: 36_000_000, totalPaise: 236_000_000
  } });
}

describe("version 3 two-phase quotation approvals", () => {
  it("opens design on unchanged initial approval and requires reapproval only after a real Designer edit", async () => {
    const repository = createMongoRepository();
    await UserModel.create({ _id: superAdmin.id, name: superAdmin.name, email: superAdmin.email,
      emailNormalized: superAdmin.email, passwordHash: "synthetic", role: superAdmin.role, active: true, accountKind: "standard", version: 1 });
    const adminActor = (await repository.findUserById(superAdmin.id))!;
    const workflow = createProjectWorkflowService({
      storage: { read: async () => bytes } as never,
      mailer: { deliveryKind: "disabled" },
      portalUrl: "https://portal.example.test/client", audit, now: () => now
    });
    const otherProject = await ProjectModel.findById("collab-project").lean();
    const otherLead = await LeadModel.findById("collab-lead").lean();
    const otherEstimate = await EstimateModel.findById("collab-estimate").lean();
    await ProjectModel.create({ ...otherProject, _id: "other-project", name: "Separate project" });
    await LeadModel.create({ ...otherLead, _id: "other-lead", projectId: "other-project" });
    await EstimateModel.create({ ...otherEstimate, _id: "other-estimate", leadId: "other-lead", projectId: "other-project",
      subtotal: 2000, gst: 360, total: 2360, subtotalPaise: 200000, gstPaise: 36000, totalPaise: 236000 });
    const otherBefore = await EstimateModel.findById("other-estimate").lean();
    await expect(workflow.assignDesigner(superAdmin, "collab-project", designer.id)).rejects.toMatchObject({ code: "DESIGN_PLAN_NOT_ASSIGNABLE" });

    const pre = await preApprove();
    const initialApprovedAt = new Date(now.getTime() - 60 * 60 * 1000);
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: pre.clientReview.id as never }, { $set: { decidedAt: initialApprovedAt } });
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.preApproval.approvedAt": initialApprovedAt.toISOString() } });
    const initialRound = await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean();
    const initiallyApproved = await EstimateModel.findById("collab-estimate").lean();
    expect(initiallyApproved).toMatchObject({ status: "client_approved", designPlanStatus: "pending_assignment",
      estimation: { phase: "post", status: "draft", preApproval: { reviewRoundId: pre.clientReview.id } } });
    expect((await repository.findAdminProject(adminActor, "collab-project"))?.estimate).toMatchObject({
      status: "draft", canAssignDesigner: true, initialEstimateApproval: { reviewRoundId: pre.clientReview.id },
      approvedBaseline: { total: 1180 }
    });
    await expect(workflow.assignDesigner(designer, "collab-project", designer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await workflow.assignDesigner(superAdmin, "collab-project", designer.id);
    expect(await ProjectModel.findById("collab-project").lean()).toMatchObject({ primaryDesignerId: designer.id, assignedDesignerIds: [designer.id] });
    expect(await workflow.listDesignerTasks(designer)).toEqual([expect.objectContaining({
      estimateId: "collab-estimate", leadId: "collab-lead", quotationApproved: true,
      quotationApprovalState: "initial_current", requiresClientReapproval: false, canEditQuotation: true,
      rooms: [expect.objectContaining({ id: "bedroom-1" })], lineItems: [expect.objectContaining({ specification: "Wardrobe" })]
    })]);
    const initialTask = await ProjectWorkflowTaskModel.findOne({ estimateId: "collab-estimate", kind: "design_plan_upload" }).lean();
    expect(initialTask).toMatchObject({ assigneeUserId: designer.id, status: "open", openedAt: now });
    expect(initialTask!.openedAt.getTime()).toBeGreaterThan(initialApprovedAt.getTime());
    await expect(publishDesigner()).rejects.toMatchObject({ code: "QUOTATION_UNCHANGED" });
    expect(await EstimateClientReviewRoundModel.countDocuments()).toBe(1);

    await saveDesignerQuantity(12);
    expect(await workflow.listDesignerTasks(designer)).toEqual([expect.objectContaining({
      quotationApproved: false, quotationApprovalState: "revision_draft", requiresClientReapproval: true
    })]);
    await expect(assertDesignWorkflowSubmissionAllowed(repository, "collab-project", { phase: "upload" }))
      .rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const sent = await publishDesigner();
    expect(await EstimateClientReviewRoundModel.findById(sent.clientReview.id).lean()).toMatchObject({
      phase: "post", submittedById: designer.id, salesApproval: null,
      estimateVersion: initiallyApproved!.version + 1
    });
    await decide(sent.clientReview, "request_changes");
    expect((await EstimateModel.findById("collab-estimate").lean())!.estimation).toMatchObject({
      status: "client_changes_requested", preApproval: initiallyApproved!.estimation.preApproval, finalApproval: null
    });
    await saveDesignerQuantity(15);
    const resent = await publishDesigner();
    await expect(decide(sent.clientReview)).rejects.toMatchObject({ code: "ESTIMATE_NOT_REVIEWABLE" });
    await decide(resent.clientReview);
    const completed = await EstimateModel.findById("collab-estimate").lean();
    expect(completed).toMatchObject({ total: 1770, estimation: { status: "client_approved", editClosedAt: now.toISOString(),
      preApproval: initiallyApproved!.estimation.preApproval, finalApproval: { reviewRoundId: resent.clientReview.id } } });
    const task = await ProjectWorkflowTaskModel.findOne({ estimateId: "collab-estimate", kind: "design_plan_upload" }).lean();
    expect(task).toMatchObject({ assigneeUserId: designer.id, status: "open", openedAt: initialTask!.openedAt,
      dueAt: initialTask!.dueAt });
    expect(await workflow.listDesignerTasks(designer)).toEqual([expect.objectContaining({ quotationApproved: true,
      quotationApprovalState: "revision_current", requiresClientReapproval: false, canEditQuotation: true })]);
    await expect(decide(resent.clientReview)).rejects.toMatchObject({ code: "ESTIMATE_NOT_REVIEWABLE" });
    expect(await ProjectWorkflowTaskModel.countDocuments({ estimateId: "collab-estimate", kind: "design_plan_upload" })).toBe(1);
    expect(await ProjectWorkflowTaskModel.findById(task!._id).lean()).toEqual(task);
    expect(await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean()).toEqual(initialRound);
    expect(await EstimateModel.findById("other-estimate").lean()).toEqual(otherBefore);
    expect((await repository.findAdminProject(adminActor, "other-project"))?.estimate).toMatchObject({ canAssignDesigner: false, initialEstimateApproval: null });
    expect((await ProjectModel.findById("other-project").lean())!.primaryDesignerId).toBeNull();
  });

  it("separates primary Designer submission preparation from publication of a saved revision", async () => {
    const app = submissionServer();
    const detail = async (actor: string) => (await request(app).get("/leads/collab-lead/estimate").set("Authorization", `Bearer ${actor}`).expect(200)).body.data;
    expect((await detail("sales")).capabilities).toMatchObject({ canPublishQuotation: true, canPrepareQuotationSubmission: false });
    expect(await detail("designer")).toBeNull();
    const pre = await preApprove(); await assignPrimary();
    const approvedHistory = await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean();
    expect((await detail("sales")).capabilities).toMatchObject({ canPublishQuotation: false, canPrepareQuotationSubmission: false });
    expect((await detail("designer")).capabilities).toMatchObject({ canPublishQuotation: false, canPrepareQuotationSubmission: true });
    const saved = await saveDesignerQuantity(11);
    expect(saved.body.data.capabilities).toMatchObject({ canPublishQuotation: true, canPrepareQuotationSubmission: true });
    expect((await detail("designer")).capabilities).toMatchObject({ canPublishQuotation: true, canPrepareQuotationSubmission: true });
    const post = await publishDesigner();
    expect((await detail("designer")).capabilities).toMatchObject({ canPublishQuotation: false, canPrepareQuotationSubmission: false });
    await decide(post.clientReview, "request_changes");
    expect((await detail("designer")).capabilities).toMatchObject({ canPublishQuotation: true, canPrepareQuotationSubmission: true });
    await saveDesignerQuantity(12);
    const resubmitted = await publishDesigner();
    await decide(resubmitted.clientReview);
    expect((await detail("designer")).capabilities).toMatchObject({ canPublishQuotation: false, canPrepareQuotationSubmission: false });
    expect(await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean()).toEqual(approvedHistory);
  });

  it("never advertises submission preparation to secondary, unrelated or removed primary Designers", async () => {
    await preApprove(); await assignPrimary();
    await ProjectModel.updateOne({ _id: "collab-project" }, { $addToSet: { assignedDesignerIds: secondaryDesigner.id } });
    const app = submissionServer();
    const detail = async (actor: string) => (await request(app).get("/leads/collab-lead/estimate").set("Authorization", `Bearer ${actor}`).expect(200)).body.data;
    expect(await detail("secondary")).toBeNull();
    expect(await detail("unrelated")).toBeNull();
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { primaryDesignerId: secondaryDesigner.id } });
    expect((await detail("designer")).capabilities.canPrepareQuotationSubmission).toBe(false);
    expect(await detail("secondary")).toBeNull();
  });

  it("requires matching V3 project, initial approval and an editable working copy for preparation", async () => {
    await preApprove(); await assignPrimary();
    const app = submissionServer();
    const detail = async () => (await request(app).get("/leads/collab-lead/estimate").set("Authorization", "Bearer designer").expect(200)).body.data;
    const initial = await EstimateModel.findById("collab-estimate").lean();
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.status": "ready_for_client" } });
    expect((await detail()).capabilities.canPrepareQuotationSubmission).toBe(false);
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.status": "draft", "estimation.editClosedAt": now.toISOString() } });
    expect((await detail()).capabilities.canPrepareQuotationSubmission).toBe(false);
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.editClosedAt": null, "estimation.preApproval": null } });
    expect((await detail()).capabilities.canPrepareQuotationSubmission).toBe(false);
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: { "estimation.preApproval": initial!.estimation!.preApproval } });
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { estimationWorkflowVersion: 2 } });
    expect((await detail()).capabilities.canPrepareQuotationSubmission).toBe(false);
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
    await saveDesignerQuantity(11);
    const revised = await EstimateModel.findById("collab-estimate").lean();
    const post = await request(app).post("/leads/collab-lead/estimate/submit").set("Authorization", "Bearer designer")
      .send({ expectedVersion: revised!.version }).expect(200);
    expect(post.body.data).toMatchObject({ status: "sent_to_client", approvalRequired: false,
      estimation: { workflowVersion: 3, phase: "post", status: "sent_to_client" } });
    const postRound = await EstimateClientReviewRoundModel.findById(post.body.data.clientReview.id).lean();
    expect(postRound).toMatchObject({ phase: "post", estimateVersion: revised!.version, submittedById: designer.id, salesApproval: null });
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

  it("requires a material primary-Designer revision before a second quotation can be submitted", async () => {
    await preApprove();
    await assignPrimary();
    await expect(publish()).rejects.toMatchObject({ code: "QUOTATION_UNCHANGED" });
    await expect(publishDesigner()).rejects.toMatchObject({ code: "QUOTATION_UNCHANGED" });
    await saveDesignerQuantity(12);
    const published = await publishDesigner();
    const frozen = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    expect(frozen).toMatchObject({ workflowVersion: 3, phase: "post", submittedById: designer.id });
    await decide(published.clientReview);
    const saved = await EstimateModel.findById("collab-estimate").lean();
    expect(saved).toMatchObject({ designPlanStatus: "assigned", designPlanVersion: 0,
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
    await preApprove(); await assignPrimary(); await saveDesignerQuantity(12);
    const published = await publishDesigner(); await decide(published.clientReview);
    const approved = await EstimateModel.findById("collab-estimate").lean();
    const frozen = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    const input = { expectedVersion: approved!.version, reviewRoundId: published.clientReview.id, reason: "Client requested another room", idempotencyKey: "unlock-request-001" };
    const first = await collaboration.unlock(sales, "collab-estimate", input);
    const retry = await collaboration.unlock(sales, "collab-estimate", input);
    expect(first).toMatchObject({ version: approved!.version + 1,
      quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
      quotationApprovalSource: null, currentQuotationApproval: null,
      estimation: { editClosedAt: null, status: "draft", finalApproval: approved!.estimation.finalApproval } });
    expect(retry).toMatchObject({ version: first.version,
      quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
      quotationApprovalSource: null, currentQuotationApproval: null });
    expect(await QuotationUnlockReceiptModel.countDocuments()).toBe(1);
    expect(await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean()).toEqual(frozen);
    await expect(collaboration.unlock(sales, "collab-estimate", { ...input, reason: "Different reason" })).rejects.toMatchObject({ code: "QUOTATION_UNLOCK_CONFLICT" });
  });

  it("returns the canonical approval state when a revised quotation review is withdrawn", async () => {
    await preApprove(); await assignPrimary(); await saveDesignerQuantity(12);
    const pending = await publishDesigner();
    const withdrawn = await collaboration.withdraw(designer, "collab-estimate", {
      expectedVersion: pending.clientReview.estimateVersion, reviewRoundId: pending.clientReview.id,
      reviewRoundVersion: pending.clientReview.version, reason: "Recheck the revised scope"
    });
    expect(withdrawn).toMatchObject({
      quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
      quotationApprovalSource: null, currentQuotationApproval: null,
      estimation: { status: "draft", pendingReviewRoundId: null }
    });
  });

  it("fails current preparation and Procurement closed after a saved unapproved Designer revision", async () => {
    const published = await preApprove();
    await assignPrimary();
    const approved = await EstimateModel.findById("collab-estimate").lean();
    const round = await EstimateClientReviewRoundModel.findById(published.clientReview.id).lean();
    expect(await resolveEstimationPreparationSource(approved!))
      .toMatchObject({ source: { estimateReviewRoundId: published.clientReview.id, kind: "approved_pre" } });
    const currentRounds = await readProcurementDashboardApprovalRounds(["collab-estimate"]);
    expect(currentRounds.get("collab-estimate")?.[0]).toMatchObject({
      id: published.clientReview.id,
      currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: published.clientReview.id }
    });
    expect(approvedProcurementSnapshotFromRows(approved!, currentRounds.get("collab-estimate")!))
      .toMatchObject({ estimateReviewRoundId: published.clientReview.id,
        preparationSource: { kind: "approved_pre", estimateReviewRoundId: published.clientReview.id } });

    await EstimatePreparationSnapshotModel.create({ _id: "stale-released-source", projectId: "collab-project",
      estimateId: "collab-estimate", estimateVersion: approved!.version, requirementsVersion: approved!.estimation.requirementsVersion,
      designScopeRevision: approved!.estimation.designScopeRevision, phase: "post",
      sourceDigest: sha256Hex(JSON.stringify(round!.estimateSnapshot)), snapshot: round!.estimateSnapshot,
      releasedById: superAdmin.id, releasedAt: now });
    await EstimateModel.updateOne({ _id: "collab-estimate" }, { $set: {
      version: approved!.version + 1, status: "client_approved",
      "lineItems.0.quantity": 12, "lineItems.0.amount": 1200, "lineItems.0.amountPaise": 120000,
      subtotal: 1200, gst: 216, total: 1416, subtotalPaise: 120000, gstPaise: 21600, totalPaise: 141600,
      "estimation.phase": "post", "estimation.status": "draft",
      "estimation.pricedRevision": approved!.estimation.pricedRevision + 1,
      "estimation.preparationSnapshotId": "stale-released-source"
    } });
    const revised = await EstimateModel.findById("collab-estimate").lean();

    await expect(resolveEstimationPreparationSource(revised!))
      .rejects.toMatchObject({ code: "ESTIMATE_SOURCE_CONFLICT" });
    await expect(readProcurementDashboardApprovalRounds(["collab-estimate"]))
      .rejects.toMatchObject({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" });
    await expect(readProcurementDashboardPortfolioReport())
      .rejects.toMatchObject({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" });
  });

  it("denies a removed primary and unrelated Sales before any unlock write", async () => {
    await preApprove(); await assignPrimary(); await saveDesignerQuantity(12);
    const published = await publishDesigner(); await decide(published.clientReview);
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
    expect(enabled).toMatchObject({ version: 2,
      quotationApprovalState: "source_issue", currentQuotationApproved: false, requiresClientReapproval: false,
      quotationApprovalSource: null, currentQuotationApproval: null,
      estimation: { workflowVersion: 3, phase: "pre", pricedRevision: 1, preApproval: null, salesApproval: null } });
    expect((await ProjectModel.findById("collab-project").lean())!.estimationWorkflowVersion).toBe(3);
    expect((await ProjectModel.findById("collab-project").lean())!.designWorkflowStages).toEqual(createProjectDesignWorkflow("collab-project"));
    expect(await collaboration.enableQuotation(sales, "collab-estimate", input)).toMatchObject({ version: 2,
      quotationApprovalState: "source_issue", currentQuotationApproved: false, requiresClientReapproval: false,
      quotationApprovalSource: null, currentQuotationApproval: null });
    expect(await AuditEventModel.countDocuments({ action: "estimate_collaboration_enabled" })).toBe(1);
  });

  it("reconciles an existing assignment task on the first authorized design write without resetting its deadline", async () => {
    await ProjectModel.updateOne({ _id: "collab-project" }, { $set: { designWorkflowStages: [] } });
    const preview = await collaboration.preview(sales, "collab-estimate");
    await collaboration.enableQuotation(sales, "collab-estimate", { expectedVersion: 1, targetVersion: 3,
      reason: "Enable operational quotation handoff", previewFingerprint: preview.previewFingerprint });
    const repository = createMongoRepository();
    await expect(assertDesignWorkflowSubmissionAllowed(repository, "collab-project", { phase: "upload" })).rejects.toMatchObject({
      code: "DESIGN_WORKFLOW_BLOCKED", message: expect.stringContaining("Client must approve the current Designer-revised quotation")
    });
    await preApprove(); await assignPrimary();
    expect(await ProjectWorkflowTaskModel.countDocuments({ estimateId: "collab-estimate", kind: "design_plan_upload" })).toBe(0);
    const workflow = createDesignWorkflowStateService(repository, audit, () => now);
    const input = { action: "internal_kickoff_complete" as const, stageId: createProjectDesignWorkflow("collab-project")[0].id,
      expectedVersion: 0, idempotencyKey: "transition-kickoff-check", note: "Record handover", data: { meetingAt: now.toISOString(), designHandoverAcknowledged: true } };
    const proof = { storageReference: "synthetic-kickoff", originalFilename: "kickoff.pdf", mimeType: "application/pdf" as const, byteSize: bytes.length, sha256: sha256Hex(bytes) };
    await expect(workflow.act(designer, "collab-project", input, proof)).resolves.toMatchObject({ version: 1, replayed: false });
    const task = await ProjectWorkflowTaskModel.findOne({ estimateId: "collab-estimate", kind: "design_plan_upload" }).lean();
    expect(task).toMatchObject({ openedAt: now, assigneeUserId: designer.id, status: "open" });
    await expect(workflow.act(designer, "collab-project", input, proof)).resolves.toMatchObject({ version: 1, replayed: true });
    expect(await ProjectWorkflowTaskModel.countDocuments({ estimateId: "collab-estimate", kind: "design_plan_upload" })).toBe(1);
    expect(await ProjectWorkflowTaskModel.findById(task!._id).lean()).toEqual(task);
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

