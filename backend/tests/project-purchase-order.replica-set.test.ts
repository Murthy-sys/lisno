import mongoose, { type ClientSession } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectCompletionDecisionModel } from "../src/models/ProjectCompletionDecision.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectScopeExceptionModel } from "../src/models/ProjectScopeException.js";
import { SiteCompletionReviewModel } from "../src/models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { VendorExecutionReviewModel } from "../src/models/VendorExecutionReview.js";
import { createVendorExecutionService, initializeIssuedExecution } from "../src/services/vendor-execution.service.js";
import type { ExecutionCommand } from "../src/contracts/vendor-execution.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectCompletionService, readProjectCompletionSummary } from "../src/services/project-completion.service.js";
import { createProjectPurchaseOrderService, type PurchaseOrderApproval } from "../src/services/project-purchase-order.service.js";
import { createSiteCompletionService } from "../src/services/site-completion.service.js";
import { onPurchaseOrderApproved } from "../src/services/vendor-work.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));

const now = new Date("2026-10-01T10:00:00.000Z");
const buyer: PublicUser = { id: "buyer-po", name: "Buyer", email: "buyer-po@example.test", role: "procurement" };
const admin: PublicUser = { id: "super-admin-po", name: "Admin", email: "super-po@example.test", role: "super_admin" };
const clientActor: PublicUser = { id: "client-po", name: "Client", email: "client-po@example.test", role: "client" };
const siteActor: PublicUser = { id: "site-manager-po", name: "Site Manager", email: "site-po@example.test", role: "site_manager" };
const vendorActor: PublicUser = { id: "vendor-user-po", name: "Vendor", email: "vendor-user-po@example.test", role: "vendor", vendorId: "vendor-po" };
const otherVendorActor: PublicUser = { id: "other-vendor-user-po", name: "Other Vendor", email: "other-vendor-user-po@example.test", role: "vendor", vendorId: "vendor-other" };
const callback = vi.fn(async (_approval: PurchaseOrderApproval, _session: ClientSession) => {});
const committedReads: unknown[] = [];
const committed = vi.fn(async () => {
  // Await a non-session read inside the hook. A premature transactional wake
  // would observe no committed orders and cannot race the later commit.
  committedReads.push(await ProjectPurchaseOrderModel.find({ status: "approved" }).lean().exec());
});
const service = createProjectPurchaseOrderService({ audit: createAuditService(createMemoryRepository()),
  onApproved: callback, onIssuedCommitted: committed, now: () => now });
const completionService = createProjectCompletionService({ audit: createAuditService(createMemoryRepository()), now: () => now });
const siteCompletionService = createSiteCompletionService({ audit: createAuditService(createMemoryRepository()), now: () => now });
const realOrderService = createProjectPurchaseOrderService({ audit: createAuditService(createMemoryRepository()), onApproved: async (approval, session) => { await onPurchaseOrderApproved(approval, session); await initializeIssuedExecution(approval, session); }, now: () => now });
const executionService = createVendorExecutionService({ audit: createAuditService(createMemoryRepository()), now: () => now });
let commandSequence = 0;
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-purchase-order-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel,
    ProjectProcurementItemModel, ProjectPurchaseOrderModel, ProjectPurchaseOrderRevisionModel,
    ProjectScopeExceptionModel, ProjectCompletionDecisionModel, SiteCompletionStateModel, SiteCompletionReviewModel,
    VendorWorkAssignmentModel, VendorWorkReviewModel, VendorExecutionStateModel, VendorExecutionReviewModel,
    AiEstimatorKnowledgeVendorModel, AuditEventModel, FinanceLedgerEntryModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  callback.mockClear(); committed.mockClear(); committedReads.length = 0; commandSequence = 0;
  await UserModel.create([buyer, admin, clientActor, siteActor, vendorActor, otherVendorActor].map(user => ({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true,
    vendorId: user.id === vendorActor.id ? "vendor-po" : user.id === otherVendorActor.id ? "vendor-other" : null })));
  await project("project-po-a", 10_000);
  await project("project-po-b", 23_500);
  await AiEstimatorKnowledgeVendorModel.create([
    { _id: "vendor-po", code: "VP-1", name: "Trade Vendor", displayOrder: 1,
      status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id },
    { _id: "vendor-other", code: "VP-2", name: "Other Trade Vendor", displayOrder: 2,
      status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id }
  ]);
  await ProjectProcurementItemModel.create(["project-po-a", "project-po-b"].map(projectId => ({
    _id: `item-${projectId}`, projectId, estimateId: `estimate-${projectId}`, estimateVersion: 1,
    estimateReviewRoundId: `round-${projectId}`, sourceSectionId: "CA", sourceLineItemKey: "line-first",
    itemName: "Plywood", itemNameNormalized: "plywood", brand: "Timber", brandNormalized: "timber",
    uomId: "sheet", uomCode: "SHT", uomName: "Sheet", uomSearch: "sht sheet", vendorId: "vendor-po",
    vendorCode: "VP-1", vendorName: "Trade Vendor", vendorSearch: "vp-1 trade vendor",
    pricePaise: 10_000, allocatedWorkPaise: 100_000, version: 1, createdById: buyer.id, updatedById: buyer.id
  })));
  await ProjectProcurementItemModel.create({ _id: "item-project-po-a-other", projectId: "project-po-a", estimateId: "estimate-project-po-a", estimateVersion: 1,
    estimateReviewRoundId: "round-project-po-a", sourceSectionId: "CA", sourceLineItemKey: "line-first",
    itemName: "Plywood", itemNameNormalized: "plywood", brand: "Timber", brandNormalized: "timber",
    uomId: "sheet", uomCode: "SHT", uomName: "Sheet", uomSearch: "sht sheet", vendorId: "vendor-other",
    vendorCode: "VP-2", vendorName: "Other Trade Vendor", vendorSearch: "vp-2 other trade vendor",
    pricePaise: 10_000, allocatedWorkPaise: 100_000, version: 1, createdById: buyer.id, updatedById: buyer.id });
});
afterAll(async () => { await replica?.stop(); });

async function verifyOrder(orderId: string, actor = vendorActor) {
  const assignment = (await VendorWorkAssignmentModel.findOne({ orderId }).lean())!;
  const command = async (user: PublicUser, action: ExecutionCommand["action"], fields: Partial<ExecutionCommand> = {}) => {
    const current = await executionService.detail(user, String(assignment._id));
    return executionService.command(user, String(assignment._id), {
      action, expectedVersion: current.version, idempotencyKey: `completion-command-${++commandSequence}`, ...fields
    });
  };
  await command(actor, "acknowledge");
  await command(actor, "propose_schedule", { startDate: "2026-10-02", finishDate: "2026-10-15" });
  await command(siteActor, "confirm_schedule", { startDate: "2026-10-02", finishDate: "2026-10-15" });
  await command(actor, "report", { status: "in_progress", progress: 100, note: "Assigned work complete" });
  await command(siteActor, "exempt_evidence", { reason: "Photography prohibited by Client; Site Manager inspected work" });
  const submitted = await command(actor, "submit", { note: "Ready for inspection" });
  return command(siteActor, "verify", { submissionId: submitted.submission!.id });
}

interface ExtraApprovedLine {
  id: string;
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  rate: number;
  quantity: number;
  included: boolean;
  amount: number;
}

async function project(projectId: string, subtotal: number, additionalLines: ExtraApprovedLine[] = []) {
  const estimateId = `estimate-${projectId}`;
  const lineItems = [{ id: "line-first", catalogueId: "CA01", roomName: "Living Room", specification: "Approved plywood",
    unit: "sqft", rate: subtotal, quantity: 1, included: true, amount: subtotal }, ...additionalLines];
  const approvedSubtotal = subtotal + additionalLines.filter(line => line.included).reduce((sum, line) => sum + line.amount, 0);
  await ProjectModel.create({ _id: projectId, name: projectId, clientId: clientActor.id, clientName: "Client", clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test", clientMobile: "9000000000", clientAddress: "Bengaluru", status: "active",
    location: "Bengaluru", plannedStartAt: now, plannedEndAt: new Date("2026-12-17T10:00:00.000Z") });
  await EstimateModel.create({ _id: estimateId, leadId: `lead-${projectId}`, ownerId: buyer.id, version: 2,
    status: "client_approved", propertyType: "villa", rooms: [], scopes: [], lineItems,
    subtotal: approvedSubtotal, gst: approvedSubtotal * 0.18, total: approvedSubtotal * 1.18, approvalRequired: false, projectId,
    reviews: [{ actorId: buyer.id, action: "client_approved", note: "Approved", occurredAt: now }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: now,
    designPlanApprovedById: buyer.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: now });
  await EstimateClientReviewRoundModel.create({ _id: `round-${projectId}`, estimateId, leadId: `lead-${projectId}`,
    projectId: null, estimateVersion: 1, sendGeneration: 1,
    dedupeKey: (projectId.endsWith("a") ? "a" : projectId.endsWith("b") ? "b" : "c").repeat(64),
    recipientEmail: "client@example.test", recipientEmailNormalized: "client@example.test",
    estimateSnapshot: { clientName: "Client", projectName: projectId, location: "Bengaluru", propertyType: "villa",
      lineItems, subtotal: approvedSubtotal, gst: approvedSubtotal * 0.18, total: approvedSubtotal * 1.18 }, pdfFilename: "approved.pdf",
    pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "c".repeat(64), pdfStorageReference: "approved.pdf",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: now,
    deliveredAt: now, assignedAdminId: admin.id, status: "approved", decision: "approve",
    decisionSource: "admin_proof", decisionNote: "Approved", decidedById: admin.id, decidedAt: now, version: 2 });
  await ProjectWorkflowTaskModel.create({ _id: `task-${projectId}`, dedupeKey: `${estimateId}:procurement`, projectId,
    estimateId, designPlanVersion: 1, kind: "procurement", title: "Prepare procurement", assigneeRole: "procurement",
    assigneeUserId: buyer.id, status: "open", progress: 0, version: 1, openedAt: now });
  await ProjectWorkflowTaskModel.create({ _id: `site-task-${projectId}`, dedupeKey: `${estimateId}:site_execution`, projectId,
    estimateId, designPlanVersion: 1, kind: "site_execution", title: "Coordinate site work", assigneeRole: "site_manager",
    assigneeUserId: siteActor.id, status: "open", progress: 0, version: 1, openedAt: now });
}
const line = { procurementItemId: "item-project-po-a", quantityMilliUnits: 1_250, unitPricePaise: 10_000,
  gstBasisPoints: 1_800, scopeType: "execution" as const, description: "Install plywood", targetDate: "2026-10-31",
  deliveryLocation: "Project site" };
const otherVendorLine = { ...line, procurementItemId: "item-project-po-a-other" };

describe("purchase order Mongo transactions", () => {
  it("rejects gross commitments above the recorded item allocation and unverified cross-project allocations above ₹50,000", async () => {
    await ProjectProcurementItemModel.updateOne({ _id: line.procurementItemId }, { $set: { allocatedWorkPaise: 14_749 } });
    const first = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Install",
      idempotencyKey: "create-allocation-guard" });
    const submitted = await service.submit(buyer, "project-po-a", first.id, { expectedVersion: first.version,
      idempotencyKey: "submit-allocation-guard" });
    const decision = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!,
      idempotencyKey: "approve-allocation-guard", decision: "approve" as const, reason: null, budgetOverrideReason: null };
    await expect(service.decide(admin, "project-po-a", first.id, decision)).rejects.toMatchObject({ code: "PURCHASE_ORDER_ALLOCATION_CONFLICT" });
    await ProjectProcurementItemModel.updateOne({ _id: line.procurementItemId }, { $set: { allocatedWorkPaise: 3_000_000 } });
    await ProjectProcurementItemModel.updateOne({ _id: "item-project-po-b" }, { $set: { allocatedWorkPaise: 2_100_000 } });
    await expect(service.decide(admin, "project-po-a", first.id, decision)).rejects.toMatchObject({ code: "PURCHASE_ORDER_VENDOR_ALLOCATION_CAP_CONFLICT" });
    expect(await ProjectPurchaseOrderModel.findById(first.id).lean()).toMatchObject({ status: "pending_approval", approvedRevisionId: null });
  });

  it("keeps the approved estimate and ledger unchanged, snapshots one submitted revision, and creates assignments only on approval", async () => {
    const created = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Complete on site", idempotencyKey: "create-order-a" });
    expect(created.status).toBe("draft");
    expect(await ProjectProcurementItemModel.findById(line.procurementItemId).lean()).toMatchObject({ commitmentEpoch: 1, version: 1 });
    await expect(service.vendorRead(vendorActor, created.id)).rejects.toMatchObject({ status: 404 });
    expect(await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Complete on site", idempotencyKey: "create-order-a" })).toMatchObject({ id: created.id });
    const submitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-order-a" });
    expect(submitted.status).toBe("pending_approval");
    expect(submitted.revisions).toHaveLength(1);
    expect(submitted.revisions[0]?.lines[0]).toMatchObject({ procurementItemId: line.procurementItemId,
      sourceLineItemKey: "line-first", roomName: "Living Room", netPaise: 12_500, gstPaise: 2_250, totalPaise: 14_750 });
    expect(await ProjectProcurementItemModel.findById(line.procurementItemId).lean()).toMatchObject({ commitmentEpoch: 2, version: 1 });
    expect(callback).not.toHaveBeenCalled();
    expect(committed).not.toHaveBeenCalled();
    expect(await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-order-a" })).toMatchObject({ revision: 1 });
    const decision = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "approve-order-a", decision: "approve" as const, reason: null, budgetOverrideReason: null };
    const approved = await service.decide(admin, "project-po-a", created.id, decision);
    expect(approved.status).toBe("approved");
    expect(committed).toHaveBeenCalledTimes(1);
    expect(await committedReads[0]).toEqual([expect.objectContaining({ _id: created.id, status: "approved",
      approvedRevisionId: approved.approvedRevisionId })]);
    expect(await service.vendorRead(vendorActor, created.id)).toMatchObject({ id: created.id, revision: 1, terms: "Complete on site", lines: [{ sourceLineItemKey: "line-first" }] });
    await expect(service.vendorRead(otherVendorActor, created.id)).rejects.toMatchObject({ status: 404 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toMatchObject({ orderId: created.id, projectId: "project-po-a", vendorId: "vendor-po", revision: 1 });
    expect(await service.decide(admin, "project-po-a", created.id, decision)).toMatchObject({ approvedRevisionId: approved.approvedRevisionId });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(2);
    expect(await committedReads[1]).toEqual([expect.objectContaining({ _id: created.id, status: "approved" })]);
    expect(await service.commitments(buyer, "project-po-a")).toEqual({ approvedEstimatePaise: 1_000_000, committedPaise: 12_500,
      committedGstPaise: 2_250, committedTotalPaise: 14_750, remainingPaise: 987_500 });
    expect(await service.commitments(buyer, "project-po-b")).toEqual({ approvedEstimatePaise: 2_350_000, committedPaise: 0,
      committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 2_350_000 });
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await EstimateModel.findById("estimate-project-po-a").lean()).toMatchObject({ subtotal: 10_000, total: 11_800 });
    expect(await ProjectPurchaseOrderRevisionModel.countDocuments({ orderId: created.id })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: created.id, action: "project_purchase_order_decided" })).toBe(1);
    await ProjectPurchaseOrderModel.collection.updateOne({ _id: created.id }, { $set: { approvedNetPaise: null } });
    await expect(service.commitments(buyer, "project-po-a")).rejects.toMatchObject({ code: "PURCHASE_ORDER_COMMITMENT_CONFLICT" });
  });

  it("blocks stale decisions and rolls back approval if assignment creation fails", async () => {
    const created = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Complete on site", idempotencyKey: "create-order-b" });
    const submitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-order-b" });
    await expect(service.decide(buyer, "project-po-a", created.id, { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "wrong-actor", decision: "approve", reason: null, budgetOverrideReason: null })).rejects.toMatchObject({ status: 403 });
    await expect(service.decide(admin, "project-po-a", created.id, { expectedVersion: created.version, submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "stale-actor", decision: "approve", reason: null, budgetOverrideReason: null })).rejects.toMatchObject({ code: "PURCHASE_ORDER_VERSION_CONFLICT" });
    callback.mockRejectedValueOnce(new Error("assignment failed"));
    await expect(service.decide(admin, "project-po-a", created.id, { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "approve-order-b", decision: "approve", reason: null, budgetOverrideReason: null })).rejects.toThrow("assignment failed");
    expect(await ProjectPurchaseOrderModel.findById(created.id).lean()).toMatchObject({ status: "pending_approval", version: submitted.version, approvedRevisionId: null });
    expect(await AuditEventModel.countDocuments({ entityId: created.id, action: "project_purchase_order_decided" })).toBe(0);
    expect(committed).not.toHaveBeenCalled();
  });

  it("requires a reasoned override only when net commitments exceed the pre-GST approved procurement budget", async () => {
    await ProjectProcurementItemModel.updateOne({ _id: line.procurementItemId }, { $set: { allocatedWorkPaise: 1_300_000 } });
    const expensive = { ...line, quantityMilliUnits: 110_000, unitPricePaise: 10_000 };
    const created = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [expensive], terms: "Complete on site", idempotencyKey: "create-order-c" });
    const submitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-order-c" });
    const decision = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "approve-order-c", decision: "approve" as const, reason: null, budgetOverrideReason: null };
    await expect(service.decide(admin, "project-po-a", created.id, decision)).rejects.toMatchObject({ code: "PURCHASE_ORDER_BUDGET_OVERRIDE_REQUIRED" });
    expect(callback).not.toHaveBeenCalled();
    const approved = await service.decide(admin, "project-po-a", created.id, { ...decision, budgetOverrideReason: "Client approved special materials" });
    expect(approved.approvedNetPaise).toBe(1_100_000);
    expect((await service.commitments(admin, "project-po-a")).remainingPaise).toBe(-100_000);
    expect(await AuditEventModel.findOne({ entityId: created.id, action: "project_purchase_order_decided" }).lean()).toMatchObject({ reason: "Client approved special materials" });
  });

  it("allows distinct orders for one vendor while preserving project-scoped create idempotency", async () => {
    const firstInput = { vendorId: "vendor-po", lines: [line], terms: "First phase", idempotencyKey: "same-vendor-first-phase" };
    const first = await service.create(buyer, "project-po-a", firstInput);
    const second = await service.create(buyer, "project-po-a", { ...firstInput, terms: "Second phase", idempotencyKey: "same-vendor-second-phase" });
    expect(second.id).not.toBe(first.id);
    expect(second.vendor.id).toBe(first.vendor.id);
    expect((await service.list(buyer, "project-po-a", { limit: 20, offset: 0 })).total).toBe(2);
    expect(await service.create(buyer, "project-po-a", firstInput)).toMatchObject({ id: first.id });
    await expect(service.create(buyer, "project-po-a", { ...firstInput, terms: "Changed terms" }))
      .rejects.toMatchObject({ code: "PURCHASE_ORDER_IDEMPOTENCY_CONFLICT" });
  });

  it("serializes approvals across vendors so concurrent orders cannot evade the budget override", async () => {
    await ProjectProcurementItemModel.updateMany({ projectId: "project-po-a" }, { $set: { allocatedWorkPaise: 800_000 } });
    const amount = { ...line, quantityMilliUnits: 60_000 };
    const first = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [amount], terms: "Carpentry", idempotencyKey: "create-concurrent-first" });
    const second = await service.create(buyer, "project-po-a", { vendorId: "vendor-other", lines: [{ ...otherVendorLine, quantityMilliUnits: 60_000 }], terms: "Finishing", idempotencyKey: "create-concurrent-second" });
    const submittedFirst = await service.submit(buyer, "project-po-a", first.id, { expectedVersion: first.version, idempotencyKey: "submit-concurrent-first" });
    const submittedSecond = await service.submit(buyer, "project-po-a", second.id, { expectedVersion: second.version, idempotencyKey: "submit-concurrent-second" });
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
    const entered = new Promise<void>(resolve => { firstEntered = resolve; });
    const gatedService = createProjectPurchaseOrderService({ audit: createAuditService(createMemoryRepository()), now: () => now,
      onApproved: async approval => { if (approval.orderId === first.id) { firstEntered(); await holdFirst; } } });
    const approveFirst = gatedService.decide(admin, "project-po-a", first.id, { expectedVersion: submittedFirst.version,
      submittedRevisionId: submittedFirst.submittedRevisionId!, idempotencyKey: "approve-concurrent-first", decision: "approve", reason: null, budgetOverrideReason: null });
    await entered;
    const approveSecond = gatedService.decide(admin, "project-po-a", second.id, { expectedVersion: submittedSecond.version,
      submittedRevisionId: submittedSecond.submittedRevisionId!, idempotencyKey: "approve-concurrent-second", decision: "approve", reason: null, budgetOverrideReason: null });
    releaseFirst();
    const results = await Promise.allSettled([approveFirst, approveSecond]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: { status: "approved" } });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "PURCHASE_ORDER_BUDGET_OVERRIDE_REQUIRED" } });
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "project-po-a", status: "approved" })).toBe(1);
    expect((await service.commitments(admin, "project-po-a")).committedPaise).toBe(600_000);
    expect(await ProjectModel.findById("project-po-a").lean()).toMatchObject({ purchaseOrderApprovalEpoch: 1 });
  });

  it("revokes a vendor's approved order access when its master becomes inactive", async () => {
    const created = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Install", idempotencyKey: "create-vendor-revocation" });
    const submitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-vendor-revocation" });
    await service.decide(admin, "project-po-a", created.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "approve-vendor-revocation", decision: "approve", reason: null, budgetOverrideReason: null });
    expect(await service.vendorRead(vendorActor, created.id)).toMatchObject({ id: created.id });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-po" }, { $set: { status: "inactive" } });
    await expect(service.vendorRead(vendorActor, created.id)).rejects.toMatchObject({ status: 404, code: "PURCHASE_ORDER_NOT_FOUND" });
  });

  it("preserves a returned submitted revision while a corrected draft is resubmitted", async () => {
    const created = await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "First terms", idempotencyKey: "create-order-d" });
    const submitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: created.version, idempotencyKey: "submit-order-d1" });
    const rejected = await service.decide(admin, "project-po-a", created.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "request-changes-d", decision: "request_changes",
      reason: "Revise the installation date", budgetOverrideReason: null });
    expect(rejected.status).toBe("changes_requested");
    const correctedLine = { ...line, targetDate: "2026-11-05" };
    const updated = await service.update(buyer, "project-po-a", created.id, { expectedVersion: rejected.version,
      idempotencyKey: "update-order-d", lines: [correctedLine], terms: "Revised terms" });
    const resubmitted = await service.submit(buyer, "project-po-a", created.id, { expectedVersion: updated.version, idempotencyKey: "submit-order-d2" });
    expect(resubmitted.revisions).toHaveLength(2);
    expect(resubmitted.revisions[0]).toMatchObject({ revision: 1, terms: "First terms", lines: [{ targetDate: line.targetDate }] });
    expect(resubmitted.revisions[1]).toMatchObject({ revision: 2, terms: "Revised terms", lines: [{ targetDate: correctedLine.targetDate }] });
    expect(await ProjectPurchaseOrderRevisionModel.countDocuments({ orderId: created.id })).toBe(2);
    await expect(service.update(buyer, "project-po-a", created.id, { expectedVersion: updated.version,
      idempotencyKey: "update-order-d2", lines: [line], terms: "Old" })).rejects.toMatchObject({ code: "PURCHASE_ORDER_VERSION_CONFLICT" });
  });

  it("atomically cuts an active legacy project over to vendor-client completion on its first order", async () => {
    await ProjectModel.updateOne({ _id: "project-po-a" }, { $set: { completionAuthority: "legacy_staff", completionAuthorityVersion: 1 } });
    await ProjectWorkflowTaskModel.create({ _id: "legacy-trade-a", dedupeKey: "legacy-trade-a", projectId: "project-po-a",
      estimateId: "estimate-project-po-a", designPlanVersion: 1, kind: "trade_execution", title: "Old staff carpentry task",
      assigneeRole: "worker_carpenter", assigneeUserId: null, status: "open", progress: 0, version: 1, openedAt: now });
    await service.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Complete on site", idempotencyKey: "create-order-cutover" });
    expect(await ProjectModel.findById("project-po-a").lean()).toMatchObject({ completionAuthority: "vendor_client", completionAuthorityVersion: 1 });
    expect(await ProjectWorkflowTaskModel.findById("legacy-trade-a").lean()).toMatchObject({
      status: "open", supersededReason: "vendor_client_cutover", supersededAt: now
    });
    expect(await AuditEventModel.findOne({ entityType: "project", entityId: "project-po-a", action: "project_completion_authority_changed" }).lean()).toMatchObject({
      oldValues: { completionAuthority: "legacy_staff" }, newValues: { completionAuthority: "vendor_client", source: "purchase_order_created", supersededTradeTaskCount: 1 }
    });
    await ProjectModel.updateOne({ _id: "project-po-b" }, { $set: { status: "completed" } });
    await expect(service.create(buyer, "project-po-b", { vendorId: "vendor-po", lines: [{ ...line, procurementItemId: "item-project-po-b" }],
      terms: "No reopening", idempotencyKey: "create-completed" })).rejects.toMatchObject({ code: "PURCHASE_ORDER_PROJECT_NOT_ACTIVE" });
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "project-po-b" })).toBe(0);
  });
});

describe("project final completion Mongo transactions", () => {
  it("keeps zero-value scope in the approved lineage while only positive uncovered scope blocks handoff", async () => {
    await project("project-po-zero", 10_000, [
      { id: "line-zero", catalogueId: "CA02", roomName: "Master Bedroom", specification: "Gypsum plain",
        unit: "sqft", rate: 0, quantity: 300, included: true, amount: 0 },
      { id: "line-positive-zero-quantity", catalogueId: "EL01", roomName: "Kitchen", specification: "Electrical testing",
        unit: "nos", rate: 100, quantity: 0, included: true, amount: 100 }
    ]);
    await ProjectProcurementItemModel.create({ _id: "item-project-po-zero", projectId: "project-po-zero",
      estimateId: "estimate-project-po-zero", estimateVersion: 1, estimateReviewRoundId: "round-project-po-zero",
      sourceSectionId: "CA", sourceLineItemKey: "line-first", itemName: "Plywood", itemNameNormalized: "plywood",
      brand: "Timber", brandNormalized: "timber", uomId: "sheet", uomCode: "SHT", uomName: "Sheet", uomSearch: "sht sheet",
      vendorId: "vendor-po", vendorCode: "VP-1", vendorName: "Trade Vendor", vendorSearch: "vp-1 trade vendor",
      pricePaise: 10_000, allocatedWorkPaise: 100_000, version: 1, createdById: buyer.id, updatedById: buyer.id });
    const created = await realOrderService.create(buyer, "project-po-zero", { vendorId: "vendor-po",
      lines: [{ ...line, procurementItemId: "item-project-po-zero" }], terms: "Install approved plywood",
      idempotencyKey: "zero-scope-order" });
    const submitted = await realOrderService.submit(buyer, "project-po-zero", created.id,
      { expectedVersion: created.version, idempotencyKey: "zero-scope-submit" });
    await realOrderService.decide(admin, "project-po-zero", created.id,
      { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!,
        idempotencyKey: "zero-scope-approve", decision: "approve", reason: null, budgetOverrideReason: null });
    const mixed = await completionService.summary(admin, "project-po-zero");
    expect(mixed.scope).toMatchObject([
      { sourceLineItemKey: "line-first", roomName: "Living Room", specification: "Approved plywood",
        status: "approved_order", amountPaise: 1_000_000 },
      { sourceLineItemKey: "line-zero", roomName: "Master Bedroom", specification: "Gypsum plain",
        status: "not_required", amountPaise: 0, approvedOrderLineCount: 0, exception: null },
      { sourceLineItemKey: "line-positive-zero-quantity", roomName: "Kitchen", specification: "Electrical testing",
        status: "uncovered", amountPaise: 10_000 }
    ]);
    expect(mixed.blockers.filter(blocker => blocker.code === "SCOPE_UNCOVERED"))
      .toEqual([{ code: "SCOPE_UNCOVERED", sourceLineItemKey: "line-positive-zero-quantity",
        message: expect.stringContaining("Kitchen · Electrical testing") }]);
    const saved = await siteCompletionService.progress(siteActor, "project-po-zero", { expectedVersion: 0,
      idempotencyKey: "zero-scope-progress", progress: 100, note: "Installed approved plywood" });
    expect(saved).toMatchObject({ progress: 100, canSubmit: false });
    const afterProgress = await completionService.summary(admin, "project-po-zero");
    const recorded = await completionService.except(admin, "project-po-zero", {
      sourceLineItemKey: "line-positive-zero-quantity", kind: "not_applicable",
      reason: "Electrical testing is outside the confirmed work scope", expectedAuthorityVersion: afterProgress.completionAuthorityVersion,
      idempotencyKey: "zero-scope-positive-exception" });
    const corrected = await completionService.summary(admin, "project-po-zero");
    expect(corrected.scope.map(row => row.status)).toEqual(["approved_order", "not_required", "exception"]);
    expect(corrected.blockers.some(blocker => blocker.code === "SCOPE_UNCOVERED")).toBe(false);
    expect(await ProjectScopeExceptionModel.countDocuments({ projectId: "project-po-zero" })).toBe(1);
    expect((await siteCompletionService.read(siteActor, "project-po-zero", "site_manager")).canSubmit).toBe(false);
    await verifyOrder(created.id);
    expect((await siteCompletionService.read(siteActor, "project-po-zero", "site_manager")).canSubmit).toBe(true);
    const sent = await siteCompletionService.submit(siteActor, "project-po-zero", { expectedVersion: saved.version,
      idempotencyKey: "zero-scope-site-submit", note: "Installed approved plywood" });
    await siteCompletionService.decide(clientActor, "project-po-zero", { expectedVersion: sent.review!.version,
      idempotencyKey: "zero-scope-client-accept", decision: "approve", reason: null });
    const ready = await completionService.summary(admin, "project-po-zero");
    expect(ready).toMatchObject({ readyForCompletion: true, pendingOwner: "super_admin" });
    const completed = await completionService.complete(admin, "project-po-zero", {
      expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: "zero-scope-complete" });
    expect(await ProjectCompletionDecisionModel.findById(completed.id).lean()).toMatchObject({
      sourceLineItemKeys: ["line-first", "line-zero", "line-positive-zero-quantity"], exceptionIds: [recorded.id] });
  });

  it("preserves explicit exception and approved-order precedence for a zero-value scope line", async () => {
    await project("project-po-zero", 10_000, [{ id: "line-zero", catalogueId: "CA02", roomName: "Master Bedroom",
      specification: "Gypsum plain", unit: "sqft", rate: 0, quantity: 300, included: true, amount: 0 }]);
    await ProjectModel.updateOne({ _id: "project-po-zero" },
      { $set: { completionAuthority: "vendor_client", completionAuthorityVersion: 1 } });
    const initial = await completionService.summary(admin, "project-po-zero");
    expect(initial.scope.find(row => row.sourceLineItemKey === "line-zero")).toMatchObject({
      status: "not_required", amountPaise: 0, approvedOrderLineCount: 0, exception: null });
    expect(await ProjectScopeExceptionModel.countDocuments({ projectId: "project-po-zero" })).toBe(0);
    const exception = await completionService.except(admin, "project-po-zero", {
      sourceLineItemKey: "line-zero", kind: "not_applicable", reason: "The client kept the existing gypsum finish",
      expectedAuthorityVersion: initial.completionAuthorityVersion, idempotencyKey: "zero-line-explicit-exception" });
    expect((await completionService.summary(admin, "project-po-zero")).scope.find(row => row.sourceLineItemKey === "line-zero"))
      .toMatchObject({ status: "exception", exception: { id: exception.id } });
    await ProjectProcurementItemModel.create({ _id: "item-zero-line", projectId: "project-po-zero",
      estimateId: "estimate-project-po-zero", estimateVersion: 1, estimateReviewRoundId: "round-project-po-zero",
      sourceSectionId: "CA", sourceLineItemKey: "line-zero", itemName: "Gypsum", itemNameNormalized: "gypsum",
      brand: "Plain", brandNormalized: "plain", uomId: "sheet", uomCode: "SHT", uomName: "Sheet", uomSearch: "sht sheet",
      vendorId: "vendor-po", vendorCode: "VP-1", vendorName: "Trade Vendor", vendorSearch: "vp-1 trade vendor",
      pricePaise: 100, allocatedWorkPaise: 10_000, version: 1, createdById: buyer.id, updatedById: buyer.id });
    const created = await realOrderService.create(buyer, "project-po-zero", { vendorId: "vendor-po",
      lines: [{ ...line, procurementItemId: "item-zero-line", quantityMilliUnits: 1_000, unitPricePaise: 100,
        description: "Document existing gypsum finish" }], terms: "Record existing finish",
      idempotencyKey: "zero-line-order" });
    const submitted = await realOrderService.submit(buyer, "project-po-zero", created.id,
      { expectedVersion: created.version, idempotencyKey: "zero-line-submit" });
    await realOrderService.decide(admin, "project-po-zero", created.id,
      { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId!,
        idempotencyKey: "zero-line-approve", decision: "approve", reason: null, budgetOverrideReason: null });
    expect((await completionService.summary(admin, "project-po-zero")).scope.find(row => row.sourceLineItemKey === "line-zero"))
      .toMatchObject({ status: "approved_order", approvedOrderLineCount: 1, exception: { id: exception.id } });
  });

  it("rejects a malformed null approved amount instead of classifying it as zero", async () => {
    await ProjectModel.updateOne({ _id: "project-po-b" }, { $set: { completionAuthority: "vendor_client", completionAuthorityVersion: 1 } });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "round-project-po-b" },
      { $set: { "estimateSnapshot.lineItems.0.amount": null } });
    await expect(completionService.summary(admin, "project-po-b"))
      .rejects.toMatchObject({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT", status: 409 });
  });

  it("requires Site Manager re-verification when a later purchase order adds vendor work", async () => {
    const firstOrder = await realOrderService.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line],
      terms: "First work", idempotencyKey: "scope-first-order" });
    const firstSubmitted = await realOrderService.submit(buyer, "project-po-a", firstOrder.id,
      { expectedVersion: firstOrder.version, idempotencyKey: "scope-first-submit" });
    await realOrderService.decide(admin, "project-po-a", firstOrder.id,
      { expectedVersion: firstSubmitted.version, submittedRevisionId: firstSubmitted.submittedRevisionId!,
        idempotencyKey: "scope-first-approve", decision: "approve", reason: null, budgetOverrideReason: null });
    await verifyOrder(firstOrder.id);
    const saved = await siteCompletionService.progress(siteActor, "project-po-a", { expectedVersion: 0,
      idempotencyKey: "scope-site-progress", progress: 100, note: "First work inspected" });
    expect(saved).toMatchObject({ progress: 100, needsReverification: false, canSubmit: true });
    expect((await SiteCompletionStateModel.findById("project-po-a").lean())?.verifiedAssignmentIds).toHaveLength(1);

    const secondOrder = await realOrderService.create(buyer, "project-po-a", { vendorId: "vendor-other", lines: [otherVendorLine],
      terms: "Later work", idempotencyKey: "scope-second-order" });
    const secondSubmitted = await realOrderService.submit(buyer, "project-po-a", secondOrder.id,
      { expectedVersion: secondOrder.version, idempotencyKey: "scope-second-submit" });
    await realOrderService.decide(admin, "project-po-a", secondOrder.id,
      { expectedVersion: secondSubmitted.version, submittedRevisionId: secondSubmitted.submittedRevisionId!,
        idempotencyKey: "scope-second-approve", decision: "approve", reason: null, budgetOverrideReason: null });
    const stale = await siteCompletionService.read(siteActor, "project-po-a", "site_manager");
    expect(stale).toMatchObject({ progress: 100, needsReverification: true, canSubmit: false });
    await expect(siteCompletionService.submit(siteActor, "project-po-a", { expectedVersion: saved.version,
      idempotencyKey: "scope-stale-submit", note: "First work inspected" })).rejects.toMatchObject({ code: "SITE_COMPLETION_CONFLICT" });
    await verifyOrder(secondOrder.id, otherVendorActor);
    const renewed = await siteCompletionService.progress(siteActor, "project-po-a", { expectedVersion: saved.version,
      idempotencyKey: "scope-site-reverify", progress: 100, note: "Both work sections inspected" });
    expect(renewed).toMatchObject({ progress: 100, needsReverification: false, canSubmit: true });
    expect((await SiteCompletionStateModel.findById("project-po-a").lean())?.verifiedAssignmentIds).toHaveLength(2);
  });

  it("serializes a new order against Site Manager completion submission", async () => {
    await completionService.except(admin, "project-po-b", { sourceLineItemKey: "line-first", kind: "externally_fulfilled",
      reason: "Client retained the existing room fixtures", expectedAuthorityVersion: 1, idempotencyKey: "external-scope-race" });
    const saved = await siteCompletionService.progress(siteActor, "project-po-b", { expectedVersion: 0,
      idempotencyKey: "site-progress-race", progress: 100, note: "Ready for inspection" });
    const results = await Promise.allSettled([
      siteCompletionService.submit(siteActor, "project-po-b", { expectedVersion: saved.version,
        idempotencyKey: "site-submit-race", note: "Ready for inspection" }),
      realOrderService.create(buyer, "project-po-b", { vendorId: "vendor-po",
        lines: [{ ...line, procurementItemId: "item-project-po-b" }], terms: "Late scope",
        idempotencyKey: "order-race-site-submit" })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const reviewCount = await SiteCompletionReviewModel.countDocuments({ projectId: "project-po-b" });
    const orderCount = await ProjectPurchaseOrderModel.countDocuments({ projectId: "project-po-b" });
    expect([reviewCount, orderCount].sort()).toEqual([0, 1]);
  });

  it("keeps the Client legacy project screen free of an inapplicable completion task", async () => {
    await ProjectModel.updateOne({ _id: "project-po-b" }, { $set: { completionAuthority: "legacy_staff" } });
    expect(await siteCompletionService.read(clientActor, "project-po-b", "client"))
      .toMatchObject({ review: null, canSubmit: false, status: "draft" });
    await expect(siteCompletionService.read(siteActor, "project-po-b", "site_manager"))
      .rejects.toMatchObject({ code: "SITE_COMPLETION_CONFLICT" });
  });

  it("saves and submits 100% Site Manager progress with an empty note", async () => {
    await completionService.except(admin, "project-po-b", { sourceLineItemKey: "line-first", kind: "not_applicable",
      reason: "The existing room fixtures stay in place", expectedAuthorityVersion: 1, idempotencyKey: "blank-note-scope-exception" });
    const saved = await siteCompletionService.progress(siteActor, "project-po-b", { expectedVersion: 0,
      idempotencyKey: "blank-note-site-progress", progress: 100, note: "" });
    expect(saved).toMatchObject({ progress: 100, note: "", status: "draft", canSubmit: true });
    expect(await SiteCompletionStateModel.findById("project-po-b").lean())
      .toMatchObject({ progress: 100, note: "", verifiedAssignmentIds: [] });
    expect(await siteCompletionService.read(siteActor, "project-po-b", "site_manager"))
      .toMatchObject({ progress: 100, note: "", canSubmit: true });

    const submitted = await siteCompletionService.submit(siteActor, "project-po-b", { expectedVersion: saved.version,
      idempotencyKey: "blank-note-site-submit", note: "" });
    expect(submitted).toMatchObject({ status: "pending_client", note: "", review: { round: 1, note: "", status: "pending" } });
    expect(await SiteCompletionReviewModel.findById(submitted.review!.id).lean())
      .toMatchObject({ projectId: "project-po-b", note: "", progress: 100, status: "pending" });
  });

  it("returns a Client change request to Site Manager and keeps each review round", async () => {
    await completionService.except(admin, "project-po-b", { sourceLineItemKey: "line-first", kind: "not_applicable",
      reason: "The existing room fixtures stay in place", expectedAuthorityVersion: 1, idempotencyKey: "external-scope-change-loop" });
    await expect(siteCompletionService.progress(buyer, "project-po-b", { expectedVersion: 0,
      idempotencyKey: "wrong-manager-progress", progress: 100, note: "" })).rejects.toMatchObject({ status: 403 });
    const firstProgress = await siteCompletionService.progress(siteActor, "project-po-b", { expectedVersion: 0,
      idempotencyKey: "first-site-progress", progress: 100, note: "Inspect room" });
    const first = await siteCompletionService.submit(siteActor, "project-po-b", { expectedVersion: firstProgress.version,
      idempotencyKey: "first-site-submit", note: "Inspect room" });
    const decision = { expectedVersion: first.review!.version, idempotencyKey: "client-request-site-changes",
      decision: "request_changes" as const, reason: "Repair the edge trim" };
    const returned = await siteCompletionService.decide(clientActor, "project-po-b", decision);
    expect(returned).toMatchObject({ status: "changes_requested", progress: 0, review: { status: "changes_requested" } });
    expect((await SiteCompletionStateModel.findById("project-po-b").lean())?.verifiedAssignmentIds).toBeNull();
    expect((await siteCompletionService.decide(clientActor, "project-po-b", decision)).version).toBe(returned.version);
    expect((await completionService.summary(admin, "project-po-b")).pendingOwner).toBe("site_manager");
    const updated = await siteCompletionService.progress(siteActor, "project-po-b", { expectedVersion: returned.version,
      idempotencyKey: "second-site-progress", progress: 100, note: "Edge trim repaired" });
    const second = await siteCompletionService.submit(siteActor, "project-po-b", { expectedVersion: updated.version,
      idempotencyKey: "second-site-submit", note: "Edge trim repaired" });
    expect(second.review).toMatchObject({ round: 2, status: "pending" });
    expect(await SiteCompletionReviewModel.countDocuments({ projectId: "project-po-b" })).toBe(2);
    expect(await SiteCompletionReviewModel.findOne({ projectId: "project-po-b", round: 1 }).lean())
      .toMatchObject({ status: "changes_requested", decision: { reason: "Repair the edge trim" } });
    await siteCompletionService.decide(clientActor, "project-po-b", { expectedVersion: second.review!.version,
      idempotencyKey: "client-accept-second-round", decision: "approve", reason: null });
    expect((await completionService.summary(admin, "project-po-b")).readyForCompletion).toBe(true);
  });

  it("shows an admin queue, blocks uncovered scope, and completes reasoned external scope once", async () => {
    await ProjectModel.create({ _id: "project-awaiting-estimate", name: "Awaiting estimate", clientId: clientActor.id,
      clientName: "Client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test",
      clientMobile: "9000000000", clientAddress: "Bengaluru", status: "active", location: "Bengaluru",
      plannedStartAt: now, plannedEndAt: new Date("2026-12-17T10:00:00.000Z") });
    const queue = await completionService.queue(admin, { limit: 20, offset: 0 });
    expect(queue.total).toBe(2);
    expect(queue.items.every(item => item.readyForCompletion === false && item.pendingOwner === "procurement")).toBe(true);
    const initial = await completionService.summary(admin, "project-po-b");
    expect(initial.scope).toMatchObject([{ sourceLineItemKey: "line-first", status: "uncovered" }]);
    expect(initial.blockers).toContainEqual(expect.objectContaining({ code: "SCOPE_UNCOVERED",
      message: expect.stringContaining("Living Room · Approved plywood") }));
    await expect(completionService.complete(admin, "project-po-b", { expectedAuthorityVersion: 1, idempotencyKey: "complete-too-early" })).rejects.toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
    const exceptionInput = { sourceLineItemKey: "line-first", kind: "externally_fulfilled" as const,
      reason: "Client retained the existing room fixtures", expectedAuthorityVersion: 1, idempotencyKey: "external-scope-b" };
    const exception = await completionService.except(admin, "project-po-b", exceptionInput);
    expect(await completionService.except(admin, "project-po-b", exceptionInput)).toEqual(exception);
    expect(exception.resultingAuthorityVersion).toBe(2);
    expect((await completionService.summary(admin, "project-po-b")).pendingOwner).toBe("site_manager");
    const pendingOrder = await realOrderService.create(buyer, "project-po-b", { vendorId: "vendor-po",
      lines: [{ ...line, procurementItemId: "item-project-po-b" }], terms: "Pending alternative scope", idempotencyKey: "pending-order-b" });
    expect((await completionService.summary(admin, "project-po-b")).blockers).toContainEqual(expect.objectContaining({ code: "ORDER_PENDING" }));
    await expect(completionService.complete(admin, "project-po-b", { expectedAuthorityVersion: 2,
      idempotencyKey: "complete-while-order-pending" })).rejects.toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
    await realOrderService.cancel(admin, "project-po-b", pendingOrder.id, { expectedVersion: pendingOrder.version,
      idempotencyKey: "cancel-pending-order-b", reason: "Client retained the existing fixtures" });
    const progressInput = { expectedVersion: 0, idempotencyKey: "site-progress-b", progress: 100, note: "Existing fixtures retained" };
    const [saved, repeatedProgress] = await Promise.all([
      siteCompletionService.progress(siteActor, "project-po-b", progressInput),
      siteCompletionService.progress(siteActor, "project-po-b", progressInput)
    ]);
    expect(repeatedProgress.version).toBe(saved.version);
    expect(saved).toMatchObject({ progress: 100, canSubmit: true, status: "draft" });
    expect((await completionService.summary(admin, "project-po-b")).pendingOwner).toBe("site_manager");
    const submitInput = { expectedVersion: saved.version, idempotencyKey: "site-submit-b", note: "Existing fixtures retained" };
    const [submittedSite, repeatedSubmit] = await Promise.all([
      siteCompletionService.submit(siteActor, "project-po-b", submitInput),
      siteCompletionService.submit(siteActor, "project-po-b", submitInput)
    ]);
    expect(repeatedSubmit.review?.id).toBe(submittedSite.review?.id);
    expect(await SiteCompletionReviewModel.countDocuments({ projectId: "project-po-b" })).toBe(1);
    expect(submittedSite).toMatchObject({ status: "pending_client", review: { round: 1, status: "pending" } });
    expect((await completionService.summary(admin, "project-po-b")).pendingOwner).toBe("client");
    const accepted = await siteCompletionService.decide(clientActor, "project-po-b", { expectedVersion: submittedSite.review!.version,
      idempotencyKey: "site-accept-b", decision: "approve", reason: null });
    expect(accepted.status).toBe("client_approved");
    await expect(realOrderService.create(buyer, "project-po-b", { vendorId: "vendor-po",
      lines: [{ ...line, procurementItemId: "item-project-po-b" }], terms: "Late order",
      idempotencyKey: "late-order-after-client" })).rejects.toMatchObject({ code: "SITE_COMPLETION_IN_REVIEW" });
    const ready = await completionService.summary(admin, "project-po-b");
    expect(ready).toMatchObject({ readyForCompletion: true, pendingOwner: "super_admin" });
    const completed = await completionService.complete(admin, "project-po-b", { expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: "complete-external-b" });
    expect(await completionService.complete(admin, "project-po-b", { expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: "complete-external-b" })).toEqual(completed);
    expect(await ProjectModel.findById("project-po-b").lean()).toMatchObject({ status: "completed", actualEndAt: now,
      completionDecisionId: completed.id, completionAuthorityVersion: ready.completionAuthorityVersion + 1 });
    expect(await ProjectCompletionDecisionModel.findOne({ projectId: "project-po-b" }).lean()).toMatchObject({
      exceptionIds: [exception.id], acceptedAssignmentIds: [], sourceLineItemKeys: ["line-first"], siteCompletionReviewId: submittedSite.review!.id });
    expect(await ProjectScopeExceptionModel.countDocuments({ projectId: "project-po-b" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: "project-po-b", action: "project_completion_recorded" })).toBe(1);
    expect((await completionService.queue(admin, { limit: 20, offset: 0 })).total).toBe(1);
    await expect(completionService.complete(admin, "project-po-b", { expectedAuthorityVersion: ready.completionAuthorityVersion, idempotencyKey: "different-completion" })).rejects.toMatchObject({ code: "PROJECT_ALREADY_COMPLETED" });
    await expect(siteCompletionService.progress(siteActor, "project-po-b", { expectedVersion: saved.version,
      idempotencyKey: "site-after-closure", progress: 100, note: "Too late" })).rejects.toMatchObject({ status: 409 });
  });

  it("requires the exact approved PO task and project-level Client acceptance before the final decision", async () => {
    const order = await realOrderService.create(buyer, "project-po-a", { vendorId: "vendor-po", lines: [line], terms: "Complete on site", idempotencyKey: "create-for-closure" });
    const submitted = await realOrderService.submit(buyer, "project-po-a", order.id, { expectedVersion: order.version, idempotencyKey: "submit-for-closure" });
    expect((await completionService.summary(admin, "project-po-a")).blockers).toContainEqual(expect.objectContaining({ code: "ORDER_PENDING" }));
    const approved = await realOrderService.decide(admin, "project-po-a", order.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId!, idempotencyKey: "approve-for-closure", decision: "approve", reason: null, budgetOverrideReason: null });
    const pending = await completionService.summary(admin, "project-po-a");
    expect(pending.readyForCompletion).toBe(false);
    expect(pending.vendorWork).toMatchObject({ totalAssignments: 1, approvedAssignments: 0, pendingAssignments: 1 });
    expect(pending.pendingOwner).toBe("site_manager");
    const assignment = await VendorWorkAssignmentModel.findOne({ orderId: order.id }).lean();
    expect(assignment).toBeTruthy();
    const verified = await verifyOrder(order.id);
    const saved = await siteCompletionService.progress(siteActor, "project-po-a", { expectedVersion: 0,
      idempotencyKey: "site-progress-a", progress: 100, note: "Cabinet installed" });
    await expect(completionService.complete(admin, "project-po-a", { expectedAuthorityVersion: (await completionService.summary(admin, "project-po-a")).completionAuthorityVersion,
      idempotencyKey: "premature-closure-a" })).rejects.toMatchObject({ code: "PROJECT_COMPLETION_BLOCKED" });
    const submittedSite = await siteCompletionService.submit(siteActor, "project-po-a", { expectedVersion: saved.version,
      idempotencyKey: "site-submit-a", note: "Cabinet installed" });
    expect((await SiteCompletionReviewModel.findById(submittedSite.review!.id).lean())?.sections[0]).toMatchObject({
      executionVerificationId: verified.verification!.id, executionRound: verified.executionRound,
      executionSubmissionVersion: verified.submission!.version
    });
    await expect(realOrderService.amend(buyer, "project-po-a", order.id, { expectedVersion: approved.version,
      idempotencyKey: "amend-during-client-completion", reason: "Change after handoff" }))
      .rejects.toMatchObject({ code: "SITE_COMPLETION_IN_REVIEW" });
    await expect(siteCompletionService.decide(vendorActor, "project-po-a", { expectedVersion: submittedSite.review!.version,
      idempotencyKey: "wrong-client-a", decision: "approve", reason: null })).rejects.toMatchObject({ status: 403 });
    await siteCompletionService.decide(clientActor, "project-po-a", { expectedVersion: submittedSite.review!.version,
      idempotencyKey: "client-accept-a", decision: "approve", reason: null });
    const ready = await mongoose.connection.transaction(session => readProjectCompletionSummary("project-po-a", session));
    expect(ready.readyForCompletion).toBe(true);
    expect(ready.pendingOwner).toBe("super_admin");
    const completed = await completionService.complete(admin, "project-po-a", { expectedAuthorityVersion: ready.completionAuthorityVersion,
      idempotencyKey: "complete-vendor-a" });
    expect(await ProjectCompletionDecisionModel.findById(completed.id).lean()).toMatchObject({
      approvedRevisionIds: [approved.approvedRevisionId], acceptedAssignmentIds: [], siteCompletionReviewId: submittedSite.review!.id });
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
  });
});
