import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newEstimationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectClientInvitationModel, ProjectInitiationReceiptModel } from "../src/models/ProjectClientInvitation.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateRequirementModel } from "../src/models/EstimateRequirement.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectFinanceBaselineRevisionModel } from "../src/models/ProjectFinanceBaselineRevision.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createAuthService, type PublicUser } from "../src/services/auth.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { createProjectClientInvitationService } from "../src/services/project-client-invitation.service.js";
import { createEstimateRequirementsService } from "../src/services/estimate-requirements.service.js";
import { createEstimatePublicationService } from "../src/services/estimate-publication.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { createEstimateClientReviewService } from "../src/services/estimate-client-review.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { createDesignWorkflowStateService } from "../src/services/design-workflow-state.service.js";
import { createProjectProcurementService } from "../src/services/project-procurement.service.js";
import { createProjectPurchaseOrderService } from "../src/services/project-purchase-order.service.js";
import { ensurePendingProjectFinanceBucket } from "../src/services/project-finance.service.js";
import { onPurchaseOrderApproved } from "../src/services/vendor-work.service.js";
import { initializeIssuedExecution } from "../src/services/vendor-execution.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

// Vendor induction is an established prerequisite, independent of estimate approval.
vi.mock("../src/services/vendor-readiness.service.js", () => ({
  vendorActivation: vi.fn(async () => ({ effectiveStatus: "active", gates: { physicalAddressVerified: true } })),
  vendorActivations: vi.fn(async (vendors: Array<{ _id: string }>) => new Map(vendors.map(vendor => [String(vendor._id), { effectiveStatus: "active", gates: { physicalAddressVerified: true } }])))
}));
const at = new Date("2026-10-13T10:00:00.000Z");
const actor = (id: string, role: PublicUser["role"]): PublicUser => ({ id, role, name: `Synthetic ${role}`, email: `${id}@journey.example.test` });
const admin = actor("journey-admin", "super_admin");
const sales = actor("journey-sales", "estimator_sales");
const designer = actor("journey-designer", "designer");
const buyer = actor("journey-buyer", "procurement");
const finance = actor("journey-finance", "finance_head");
const site = actor("journey-site", "site_manager");
const pdfBytes = Buffer.from("%PDF-synthetic-journey");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("collaborative-estimation-journey");
  await Promise.all([ProjectModel, UserModel, LeadModel, ProjectClientInvitationModel, ProjectInitiationReceiptModel,
    ProjectAccessGrantModel, EstimateModel, EstimateRequirementModel, EstimateClientReviewRoundModel, DesignPlanReviewRoundModel,
    DesignWorkflowStateModel, ProjectWorkflowTaskModel, ProjectFinanceBucketModel, ProjectFinanceBaselineRevisionModel,
    AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel,
    ProjectProcurementItemModel, ProjectPurchaseOrderModel, ProjectPurchaseOrderRevisionModel,
    VendorWorkAssignmentModel, VendorExecutionStateModel].map(model => model.syncIndexes()));
}, 120000);
beforeEach(async () => { await replica.clear(); vi.clearAllMocks(); });
afterAll(async () => { await replica?.stop(); });

describe("collaborative estimation service journey", () => {
  it("joins the invited project, resolves a client request, approves both phases, confirms payment and explicitly issues vendor work", async () => {
    await UserModel.insertMany([admin, sales, designer, buyer, finance, site].map(user => ({ _id: user.id, ...user,
      emailNormalized: user.email, passwordHash: "synthetic-unused", active: true, accountKind: "standard", version: 1,
      sessionVersion: 1, managerId: null, authorizedClientIds: [] })));
    const repository = createMongoRepository();
    const audit = createAuditService(repository);
    const auth = createAuthService(repository, { jwtSecret: "journey-only-secret-more-than-32-characters", jwtExpiresInSeconds: 900 });
    const tokens: string[] = [];
    const invitations = createProjectClientInvitationService({ repository, audit, auth, clock: () => at,
      mailer: { deliveryKind: "local_test", async sendInvitation(message) { tokens.push(message.rawToken); } } });
    const projects = createAdminProjectService(repository, audit, () => at, invitations);
    const project = await projects.initiate(admin, { initiationKey: "journey-project-initiation", clientName: "Synthetic Client",
      clientEmail: "client@journey.example.test", clientMobile: "0000000000", projectName: "Synthetic Journey Residence",
      propertyType: "2BHK", nextAction: "Estimate", nextActionAt: at.toISOString(), estimatorId: sales.id });
    expect(tokens).toHaveLength(1);
    expect(await repository.findProjectById(project.id)).toMatchObject({ clientId: null, estimationWorkflowVersion: 2 });
    const password = "JourneySyntheticPassword!23";
    await invitations.acceptNew({ token: tokens[0]!, password, passwordConfirmation: password }, { remoteAddress: "127.0.0.1" });
    const clientRecord = (await repository.findUserByEmail("client@journey.example.test"))!;
    const client = actor(clientRecord.id, "client"); client.email = clientRecord.email; client.name = clientRecord.name;
    expect(await repository.findProjectById(project.id)).toMatchObject({ clientId: client.id });

    await AiEstimatorKnowledgeBasketModel.create({ _id: "journey-basket", name: "Joinery", nameNormalized: "joinery", status: "active", version: 1, displayOrder: 1, createdById: admin.id, updatedById: admin.id });
    const requirements = createEstimateRequirementsService({ audit, now: () => at });
    const requested = await requirements.create(client, project.id, { mainBasketId: "journey-basket", text: "Add a wardrobe with shelves", expectedRequirementsVersion: 0, idempotencyKey: "journey-client-requirement" });
    expect(requested.mainBaskets).toEqual([{ id: "journey-basket", name: "Joinery" }]);
    const lead = (await LeadModel.findOne({ projectId: project.id }).lean())!;
    const estimateId = "journey-estimate";
    // Saved staff pricing is a fixture. All requirement resolutions and commercial approvals below use real services.
    await EstimateModel.create({ _id: estimateId, leadId: lead._id, ownerId: sales.id, projectId: project.id, version: 1,
      status: "draft", propertyType: "2BHK", rooms: [{ id: "bedroom-1", label: "Bedroom 1" }], scopes: ["interiors"],
      lineItems: [{ id: "journey-line", source: "legacy", catalogueId: "CA01", mainBasketId: "journey-basket", roomId: "bedroom-1", roomName: "Bedroom 1", specification: "Wardrobe with shelves", unit: "sqft", rate: 100, quantity: 10, amount: 1000, amountPaise: 100000, included: true }],
      subtotal: 1000, gst: 180, total: 1180, subtotalPaise: 100000, gstPaise: 18000, totalPaise: 118000, estimation: newEstimationLifecycle(1) });
    const resolved = await requirements.resolve(sales, project.id, requested.requirements[0]!.id, { expectedRequirementsVersion: 1, expectedVersion: 1, status: "included", lineItemIds: ["journey-line"], reason: "Included in the wardrobe scope" });
    expect(resolved.requirements[0]?.status).toBe("included");
    const storage = { savePdfSnapshot: vi.fn(async ({ filename }: { filename: string }) => ({ filename, storageReference: `synthetic/${crypto.randomUUID()}`, mimeType: "application/pdf", byteSize: pdfBytes.length, sha256: sha256Hex(pdfBytes) })), deleteQuietly: vi.fn(async () => {}), read: vi.fn(async () => pdfBytes) } as unknown as EstimateClientReviewStorage;
    const reviews = createEstimateClientReviewService({ storage });
    const publication = createEstimatePublicationService({ audit, storage, pdf: { generate: vi.fn(async () => ({ filename: "synthetic.pdf", bytes: pdfBytes })) } as never,
      reviews: { ...reviews, resolveReviewAssignee: async () => ({ assignedAdminId: admin.id, source: "super_admin_fallback" }) }, deliverInitial: async () => { throw new Error("Synthetic external delivery disabled"); }, now: () => at });
    const decisions = createEstimateDecisionService({ audit, reviews, estimateDesigns: { approvalReadinessForDecision: vi.fn() }, finance: { ensurePending: ensurePendingProjectFinanceBucket }, now: () => at });
    const publish = async () => publication.publishEstimateToClient({ estimateId, leadId: String(lead._id), actorId: sales.id,
      expectedEstimateVersion: (await EstimateModel.findById(estimateId).lean())!.version, expectedStatus: "draft" });
    const approve = (round: { id: string; version: number }) => decisions.decide({ estimateId, round: { id: round.id, expectedVersion: round.version }, decision: "approve", note: "Approved", context: { actor: client, source: "client_portal", proof: null } });
    const pre = await publish(); await approve(pre.clientReview);
    expect(await EstimateModel.findById(estimateId).lean()).toMatchObject({ estimation: { phase: "post", preApproval: { reviewRoundId: pre.clientReview.id }, finalApproval: null } });
    expect(await ProjectFinanceBucketModel.findOne({ projectId: project.id }).lean()).toMatchObject({ status: "pending_design" });

    const workflow = createProjectWorkflowService({ audit, storage: { read: async () => pdfBytes } as never, mailer: { deliveryKind: "disabled" }, portalUrl: "https://portal.example.test/client", now: () => at });
    const tasks = await workflow.listProjectWorkflowTasks(admin, project.id);
    for (const [kind, user] of [["procurement", buyer], ["site_execution", site]] as const) {
      const task = tasks.find(row => row.kind === kind)!;
      await workflow.overrideWorkerAssignment({ actor: admin, projectId: project.id, taskId: task.id, expectedVersion: task.version, workerId: user.id });
    }
    // Established uploaded/submitted drawing fixture; design approval itself is real and binds the current scope revision.
    await ProjectModel.updateOne({ _id: project.id }, { $set: { assignedDesignerIds: [designer.id] } });
    await EstimateModel.updateOne({ _id: estimateId }, { $set: { designPlanStatus: "ready_for_client", designPlanVersion: 1, designPlanDesignerId: designer.id } });
    await EstimateDesignDrawingModel.collection.insertOne({ _id: "journey-drawing", estimateId, uploadId: "journey-upload", active: true } as never);
    await EstimateDesignRevisionModel.collection.insertOne({ _id: "journey-drawing-revision", drawingId: "journey-drawing", sourcePageId: "journey-page", revisionNumber: 1, reviewStatus: "submitted" } as never);
    await DesignPlanReviewRoundModel.create({ _id: "journey-design-round", estimateId, projectId: project.id, leadId: lead._id,
      projectName: project.name, clientName: client.name, recipientEmail: client.email, designPlanVersion: 1, designScopeRevision: 1,
      submittedRevisionIds: ["journey-drawing-revision"], attachments: [{ uploadId: "journey-upload", filename: "plan.pdf", mimeType: "application/pdf", byteSize: pdfBytes.length, sha256: sha256Hex(pdfBytes), storageReference: "synthetic/plan.pdf" }],
      submittedById: designer.id, submittedAt: at, assignedAdminId: admin.id, deliveryStatus: "disabled", status: "pending", version: 1 });
    await workflow.decideDesignReviewAsAdmin({ actor: admin, roundId: "journey-design-round", expectedVersion: 1, decision: "approve", note: "Signed client design approval", proof: { storageReference: "synthetic/design-approval.pdf", originalFilename: "approval.pdf", mimeType: "application/pdf", byteSize: pdfBytes.length, sha256: sha256Hex(pdfBytes) } });
    expect(await ProjectModel.findById(project.id).lean()).toMatchObject({ status: "planning" });
    const final = await publish(); await approve(final.clientReview);
    expect(await EstimateModel.findById(estimateId).lean()).toMatchObject({ estimation: { editClosedAt: at.toISOString(), finalApproval: { reviewRoundId: final.clientReview.id, designReviewRoundId: "journey-design-round", requirementsVersion: 2 } } });
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toBeNull();

    await AiEstimatorKnowledgeUomModel.create({ _id: "journey-uom", code: "SFT", name: "Square foot", decimalScale: 0, displayOrder: 1, status: "active", version: 1, createdById: admin.id, updatedById: admin.id });
    await AiEstimatorKnowledgeVendorModel.create({ _id: "journey-vendor", code: "JV-1", name: "Synthetic Vendor", displayOrder: 1, status: "active", version: 1, createdById: admin.id, updatedById: admin.id });
    const procurement = createProjectProcurementService({ audit, now: () => at });
    const item = await procurement.create(buyer, project.id, { estimateId, estimateVersion: final.clientReview.estimateVersion, sourceLineItemKey: "journey-line", itemName: "Wardrobe installation", brand: "Synthetic", uomId: "journey-uom", vendorId: "journey-vendor", pricePaise: 5000, allocatedWorkPaise: 20000, plannedOrderQuantityMilliUnits: 1000 });
    const orders = createProjectPurchaseOrderService({ audit, onApproved: async (approval, session) => { await onPurchaseOrderApproved(approval, session); await initializeIssuedExecution(approval, session); }, now: () => at });
    const draft = await orders.create(buyer, project.id, { vendorId: "journey-vendor", lines: [{ procurementItemId: item.id, quantityMilliUnits: 1000, unitPricePaise: 5000, gstBasisPoints: 1800, scopeType: "execution", description: "Install wardrobe", targetDate: "2026-11-01", deliveryLocation: "Synthetic residence" }], terms: "Complete agreed installation", idempotencyKey: "journey-order-create" });
    const submitted = await orders.submit(buyer, project.id, draft.id, { expectedVersion: draft.version, idempotencyKey: "journey-order-submit" });
    const ready = await orders.decide(admin, project.id, draft.id, { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!, decision: "approve", reason: null, budgetOverrideReason: null, idempotencyKey: "journey-order-approve" });
    expect(ready.status).toBe("ready_to_issue");
    await expect(orders.issue(buyer, project.id, ready.id, { expectedVersion: ready.version, idempotencyKey: "journey-early-issue" })).rejects.toMatchObject({ code: "WORK_ORDER_NOT_READY" });
    expect(await VendorWorkAssignmentModel.countDocuments()).toBe(0);
    const designState = createDesignWorkflowStateService(repository, audit, () => at);
    const payment = { action: "confirm_initial_payment" as const, expectedVersion: 0, idempotencyKey: "journey-final-payment", data: {}, note: "Synthetic receipt reference" };
    await expect(designState.act(finance, project.id, payment, null)).rejects.toMatchObject({ code: "PAYMENT_CONFIRMATION_NOT_ALLOWED" });
    const confirmed = await designState.act(admin, project.id, payment, null);
    expect(await designState.act(admin, project.id, payment, null)).toMatchObject({ version: confirmed.version, replayed: true });
    expect(await DesignWorkflowStateModel.findById(project.id).lean()).toMatchObject({ initialPaymentReviewRoundId: final.clientReview.id, initialPaymentDesignReviewRoundId: "journey-design-round" });
    expect(await ProjectFinanceBucketModel.findOne({ projectId: project.id }).lean()).toMatchObject({ status: "open" });
    expect(await ProjectModel.findById(project.id).lean()).toMatchObject({ status: "active" });
    expect(await VendorWorkAssignmentModel.countDocuments()).toBe(0);
    const issued = await orders.issue(buyer, project.id, ready.id, { expectedVersion: ready.version, idempotencyKey: "journey-explicit-issue" });
    expect(issued).toMatchObject({ status: "approved", approvedRevisionId: submitted.submittedRevisionId });
    expect(await VendorWorkAssignmentModel.countDocuments({ projectId: project.id, orderId: ready.id })).toBe(1);
    expect(await VendorExecutionStateModel.countDocuments({ projectId: project.id })).toBe(1);
    expect(await ProjectModel.findById(project.id).lean()).toMatchObject({ completionAuthority: "vendor_client" });
    expect(await EstimateClientReviewRoundModel.findById(pre.clientReview.id).lean()).toMatchObject({ status: "approved", phase: "pre" });
  });
});
