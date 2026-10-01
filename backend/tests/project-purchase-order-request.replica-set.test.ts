import mongoose, { type ClientSession } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../src/models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../src/models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { buildProjectPurchaseOrderPreparation } from "../src/services/project-purchase-order-preparation.service.js";
import { createProjectPurchaseOrderRequestService } from "../src/services/project-purchase-order-request.service.js";
import { createProjectPurchaseOrderService } from "../src/services/project-purchase-order.service.js";
import { createProjectProcurementService } from "../src/services/project-procurement.service.js";
import { onPurchaseOrderApproved } from "../src/services/vendor-work.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({
  vendorActivation: vi.fn(async () => ({ effectiveStatus: "active", gates: { physicalAddressVerified: true } })),
  vendorActivations: vi.fn(async (vendors: Array<{ _id: string }>) => new Map(vendors.map(vendor => [String(vendor._id),
    { effectiveStatus: "active", gates: { physicalAddressVerified: true } }])))
}));

const now = new Date("2026-10-01T10:00:00.000Z");
const buyer: PublicUser = { id: "request-buyer", name: "Buyer", email: "request-buyer@example.test", role: "procurement" };
const admin: PublicUser = { id: "request-admin", name: "Admin", email: "request-admin@example.test", role: "super_admin" };
const client: PublicUser = { id: "request-client", name: "Client", email: "request-client@example.test", role: "client" };
const audit = createAuditService(createMemoryRepository());
const service = createProjectPurchaseOrderRequestService({ audit, onApproved: onPurchaseOrderApproved, now: () => now });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-purchase-order-request-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel, ProjectProcurementItemModel, ProjectPurchaseOrderModel,
    ProjectPurchaseOrderRevisionModel, ProjectPurchaseOrderRequestModel, ProjectPurchaseOrderRequestRevisionModel,
    VendorWorkAssignmentModel, AuditEventModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([buyer, admin, client].map(user => ({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await seedProject("request-project-a", 10_000, 15_000);
  await seedProject("request-project-b", 23_500, 7_500);
  await AiEstimatorKnowledgeUomModel.create({ _id: "request-meter", code: "M", name: "Meter", decimalScale: 2,
    displayOrder: 1, status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id });
  await AiEstimatorKnowledgeVendorModel.create([
    { _id: "request-vendor-a", code: "V-A", name: "Carpentry", displayOrder: 1,
      status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id },
    { _id: "request-vendor-b", code: "V-B", name: "Electrical", displayOrder: 2,
      status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id }
  ]);
  await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "request-vendor-a" },
    { $set: { "procurementProfile.vendorType": "execution" } });
  await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "request-vendor-b" },
    { $set: { "procurementProfile.vendorType": "supplier" } });
  await ProjectProcurementItemModel.create([
    item("request-project-a", "a", "CA", "line-first", "request-vendor-a", 10_001, 1_250, 20_000),
    item("request-project-a", "b", "CB", "line-second", "request-vendor-b", 20_000, 2_000, 50_000),
    item("request-project-b", "c", "CA", "line-first", "request-vendor-a", 5_001, 1_000, 10_000)
  ]);
});
afterAll(async () => { await replica?.stop(); });

async function seedProject(id: string, first: number, second: number) {
  const estimateId = `estimate-${id}`;
  const lineItems = [
    { id: "line-first", catalogueId: "CA01", roomName: "Living", specification: "Timber", unit: "sqft", rate: first, quantity: 1, included: true, amount: first },
    { id: "line-second", catalogueId: "CB01", roomName: "Dining", specification: "Wiring", unit: "sqft", rate: second, quantity: 1, included: true, amount: second }
  ];
  const subtotal = first + second;
  await ProjectModel.create({ _id: id, name: id, clientId: client.id, clientName: "Client", clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test", clientMobile: "9000000000", clientAddress: "Bengaluru", status: "active",
    location: "Bengaluru", plannedStartAt: now, plannedEndAt: new Date("2026-12-17T10:00:00.000Z") });
  await EstimateModel.create({ _id: estimateId, leadId: `lead-${id}`, ownerId: buyer.id, version: 2, status: "client_approved",
    propertyType: "villa", rooms: [], scopes: [], lineItems, subtotal, gst: subtotal * 0.18, total: subtotal * 1.18,
    approvalRequired: false, projectId: id, reviews: [{ actorId: buyer.id, action: "client_approved", note: "Approved", occurredAt: now }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: now, designPlanApprovedById: buyer.id,
    designPlanApprovalSource: "admin_proof", clientDecisionAt: now });
  await EstimateClientReviewRoundModel.create({ _id: `round-${id}`, estimateId, leadId: `lead-${id}`, projectId: null,
    estimateVersion: 1, sendGeneration: 1, dedupeKey: (id.endsWith("a") ? "a" : "b").repeat(64),
    recipientEmail: "client@example.test", recipientEmailNormalized: "client@example.test",
    estimateSnapshot: { clientName: "Client", projectName: id, location: "Bengaluru", propertyType: "villa",
      lineItems, subtotal, gst: subtotal * 0.18, total: subtotal * 1.18 }, pdfFilename: "approved.pdf", pdfMimeType: "application/pdf",
    pdfByteSize: 1, pdfSha256: "c".repeat(64), pdfStorageReference: "approved.pdf", deliveryStatus: "sent",
    deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: now, deliveredAt: now,
    assignedAdminId: admin.id, status: "approved", decision: "approve", decisionSource: "admin_proof",
    decisionNote: "Approved", decidedById: admin.id, decidedAt: now, version: 2 });
  await ProjectWorkflowTaskModel.create({ _id: `task-${id}`, dedupeKey: `${estimateId}:procurement`, projectId: id,
    estimateId, designPlanVersion: 1, kind: "procurement", title: "Prepare procurement", assigneeRole: "procurement",
    assigneeUserId: buyer.id, status: "open", progress: 0, version: 1, openedAt: now });
}
function item(projectId: string, suffix: string, sectionId: string, lineKey: string, vendorId: string,
  pricePaise: number, quantityMilliUnits: number, allocatedWorkPaise: number) {
  return { _id: `request-item-${suffix}`, projectId, estimateId: `estimate-${projectId}`, estimateVersion: 1,
    estimateReviewRoundId: `round-${projectId}`, sourceSectionId: sectionId, sourceLineItemKey: lineKey,
    itemName: `Item ${suffix}`, itemNameNormalized: `item ${suffix}`, brand: "Test", brandNormalized: "test",
    uomId: "request-meter", uomCode: "M", uomName: "Meter", uomSearch: "m meter", vendorId,
    vendorCode: vendorId === "request-vendor-a" ? "V-A" : "V-B", vendorName: vendorId === "request-vendor-a" ? "Carpentry" : "Electrical",
    vendorSearch: vendorId, pricePaise, plannedOrderQuantityMilliUnits: quantityMilliUnits, allocatedWorkPaise,
    version: 1, createdById: buyer.id, updatedById: buyer.id };
}
async function preparation(projectId = "request-project-a") {
  return mongoose.connection.transaction(session => buildProjectPurchaseOrderPreparation(projectId, session));
}
function submitInput(digest: string, corrected = false) {
  return { expectedPreparationDigest: digest, lines: [
    { procurementItemId: "request-item-a", expectedVersion: corrected ? 2 : 1, gstBasisPoints: 1_800, scopeType: "execution" as const,
      description: "Build joinery", targetDate: "2026-11-15", deliveryLocation: "Villa" },
    { procurementItemId: "request-item-b", expectedVersion: 1, gstBasisPoints: 500, scopeType: "supply" as const,
      description: "Deliver wiring", targetDate: "2026-11-20", deliveryLocation: "Villa" }
  ], vendorTerms: [{ vendorId: "request-vendor-a", terms: "On site" }, { vendorId: "request-vendor-b", terms: "Delivery included" }],
  idempotencyKey: corrected ? "submit-corrected-request" : "submit-project-request" };
}

describe("project purchase-order request transactions", () => {
  it("invalidates the quick-order source when the project's delivery location changes", async () => {
    const before = await preparation();
    await ProjectModel.updateOne({ _id: "request-project-a" }, { $set: { location: "Updated project site" } });
    const after = await preparation();
    expect(after.orderDefaults.deliveryLocation).toBe("Updated project site");
    expect(after.digest).not.toBe(before.digest);
    const { idempotencyKey: _key, ...fields } = submitInput(before.digest);
    await expect(service.quote(buyer, "request-project-a", fields)).rejects.toMatchObject({ code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
  });

  it("quotes exact line, section, vendor and grand GST amounts without creating an order or task", async () => {
    const preview = await preparation();
    expect(preview.orderDefaults).toEqual({ targetDate: "2026-12-17", deliveryLocation: "Bengaluru" });
    expect(preview.sections.flatMap(section => section.items).map(item => item.vendor?.vendorType)).toEqual(["execution", "supplier"]);
    const { idempotencyKey: _key, ...fields } = submitInput(preview.digest);
    const beforeProject = await ProjectModel.findById("request-project-a").lean();
    const beforeItem = await ProjectProcurementItemModel.findById("request-item-a").lean();
    const quote = await service.quote(buyer, "request-project-a", fields);
    expect(quote.totals).toEqual({ netPaise: 52_501, gstPaise: 4_250, totalPaise: 56_751 });
    expect(quote.sectionTotals.map(section => section.totals.totalPaise)).toEqual([14_751, 42_000]);
    expect(quote.vendorTotals.map(vendor => vendor.totals.totalPaise)).toEqual([14_751, 42_000]);
    expect(quote.lines.map(line => line.totalPaise)).toEqual([14_751, 42_000]);
    expect(quote.preparationDigest).toBe(preview.digest);
    expect(await ProjectPurchaseOrderRequestModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModel.countDocuments()).toBe(0);
    expect(await VendorWorkAssignmentModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "project_purchase_order_request_submitted" })).toBe(0);
    expect((await ProjectModel.findById("request-project-a").lean())?.completionAuthority).toBe(beforeProject?.completionAuthority);
    expect((await ProjectProcurementItemModel.findById("request-item-a").lean())?.commitmentEpoch).toBe(beforeItem?.commitmentEpoch);
    await expect(service.quote(buyer, "request-project-a", { ...fields,
      expectedPreparationDigest: "f".repeat(64) })).rejects.toMatchObject({ code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    await expect(service.quote(client, "request-project-a", fields)).rejects.toMatchObject({ status: 403 });
    await expect(service.quote(buyer, "request-project-b", fields)).rejects.toMatchObject({ code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    const submitted = await service.submit(buyer, "request-project-a", { ...fields, idempotencyKey: "submit-after-quote" });
    expect(submitted.totals).toEqual(quote.totals);
    expect(submitted.sectionTotals).toEqual(quote.sectionTotals);
    expect(submitted.vendorTotals).toEqual(quote.vendorTotals);
  });

  it("keeps approved request history when new procurement items need a later project request", async () => {
    const first = await service.submit(buyer, "request-project-a", submitInput((await preparation()).digest));
    await service.decide(admin, first.id, { expectedVersion: first.version, submittedRevisionId: first.submittedRevisionId,
      idempotencyKey: "approve-first-project-request", decision: "approve", reason: null, budgetOverrideReason: null });
    await ProjectProcurementItemModel.create(item("request-project-a", "later", "CA", "line-first", "request-vendor-a", 2_500, 1_000, 5_000));
    const preview = await preparation();
    const later = await service.submit(buyer, "request-project-a", { expectedPreparationDigest: preview.digest,
      lines: [{ procurementItemId: "request-item-later", expectedVersion: 1, gstBasisPoints: 500,
        scopeType: "supply", description: "Later material", targetDate: "2026-11-25", deliveryLocation: "Villa" }],
      vendorTerms: [{ vendorId: "request-vendor-a", terms: "Second delivery" }], idempotencyKey: "submit-later-request" });
    expect(later.id).not.toBe(first.id);
    expect(later.revisions[0]?.lines).toHaveLength(1);
    expect((await service.list(buyer, "request-project-a", { limit: 20, offset: 0 })).total).toBe(2);
  });

  it("excludes previously approved individual lines while retaining zero-total sections in a new request", async () => {
    const individual = createProjectPurchaseOrderService({ audit, onApproved: onPurchaseOrderApproved, now: () => now });
    const draft = await individual.create(buyer, "request-project-a", { vendorId: "request-vendor-a", terms: "Initial joinery",
      idempotencyKey: "manual-first-vendor", lines: [{ procurementItemId: "request-item-a", quantityMilliUnits: 1_250,
        unitPricePaise: 10_001, gstBasisPoints: 1_800, scopeType: "execution", description: "Initial joinery",
        targetDate: "2026-11-15", deliveryLocation: "Villa" }] });
    const submittedManual = await individual.submit(buyer, "request-project-a", draft.id,
      { expectedVersion: draft.version, idempotencyKey: "manual-submit-first" });
    await individual.decide(admin, "request-project-a", draft.id, { expectedVersion: submittedManual.version,
      submittedRevisionId: submittedManual.submittedRevisionId!, idempotencyKey: "manual-approve-first",
      decision: "approve", reason: null, budgetOverrideReason: null });
    const preview = await preparation();
    expect(preview.sections.find(section => section.id === "CA")?.items[0]?.blockers).toContainEqual(expect.objectContaining({ code: "ALREADY_ORDERED" }));
    const proposed = await service.submit(buyer, "request-project-a", { expectedPreparationDigest: preview.digest,
      lines: [submitInput(preview.digest).lines[1]!], vendorTerms: [{ vendorId: "request-vendor-b", terms: "Delivery included" }],
      idempotencyKey: "request-after-manual" });
    expect(proposed.revisions[0]?.lines).toHaveLength(1);
    expect(proposed.sectionTotals.find(section => section.sectionId === "CA")?.totals.netPaise).toBe(0);
    expect(proposed.sectionTotals.find(section => section.sectionId === "CB")?.totals.netPaise).toBe(40_000);
    expect(proposed.projectName).toBe("request-project-a");
  });

  it("omits a historical zero-value child from a new project request while retaining its approved individual order", async () => {
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "round-request-project-a" }, { $push: {
      "estimateSnapshot.lineItems": { id: "line-zero", catalogueId: "CC01", roomName: "Bedroom",
        specification: "No-cost gypsum", unit: "sqft", rate: 0, quantity: 400, included: true, amount: 0 }
    } });
    await ProjectProcurementItemModel.create(item("request-project-a", "zero", "CC", "line-zero",
      "request-vendor-a", 1_000, 1_000, 2_000));
    await ProjectProcurementItemModel.collection.updateOne({ _id: "request-item-zero" },
      { $set: { sourceSectionId: "WRONG" } });
    await expect(preparation()).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_SOURCE_CONFLICT" });
    await ProjectProcurementItemModel.collection.updateOne({ _id: "request-item-zero" },
      { $set: { sourceSectionId: "CC" } });
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "historical-zero-order", projectId: "request-project-a",
      status: "approved", draftLines: [{ procurementItemId: "request-item-zero" }],
      approvedRevisionId: "historical-zero-revision", approvedNetPaise: 1_000, approvedGstPaise: 180,
      approvedTotalPaise: 1_180, cancelledAt: null } as any);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "historical-zero-revision",
      projectId: "request-project-a", orderId: "historical-zero-order",
      lines: [{ procurementItemId: "request-item-zero", sourceLineItemKey: "line-zero" }] } as any);
    const historicalOrder = await ProjectPurchaseOrderModel.findById("historical-zero-order").lean();
    const historicalRevision = await ProjectPurchaseOrderRevisionModel.findById("historical-zero-revision").lean();

    const preview = await preparation();
    expect(preview).toMatchObject({ approvedEstimatePaise: 2_500_000, committedPaise: 1_000,
      committedGstPaise: 180, committedTotalPaise: 1_180, itemCount: 2, readyItemCount: 2,
      netPaise: 52_501, blockers: [] });
    expect(preview.sections.map(section => [section.id, section.estimatedPaise, section.netPaise,
      section.items.map(entry => entry.id)])).toEqual([
      ["CA", 1_000_000, 12_501, ["request-item-a"]],
      ["CB", 1_500_000, 40_000, ["request-item-b"]],
      ["CC", 0, 0, []]
    ]);
    const { idempotencyKey: _key, ...quoteInput } = submitInput(preview.digest);
    await expect(service.quote(buyer, "request-project-a", { ...quoteInput, lines: [
      ...quoteInput.lines, { ...quoteInput.lines[0]!, procurementItemId: "request-item-zero" }
    ] })).rejects.toMatchObject({ code: "PURCHASE_ORDER_REQUEST_ITEM_SET_CONFLICT" });
    const quote = await service.quote(buyer, "request-project-a", quoteInput);
    expect(quote.lines.map(line => line.procurementItemId)).toEqual(["request-item-a", "request-item-b"]);
    expect(quote.sectionTotals.find(section => section.sectionId === "CC")?.totals.totalPaise).toBe(0);

    const submitted = await service.submit(buyer, "request-project-a", submitInput(preview.digest));
    expect(submitted.revisions[0]?.lines.map(line => line.procurementItemId)).toEqual(["request-item-a", "request-item-b"]);
    await service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "approve-after-zero-history",
      decision: "approve", reason: null, budgetOverrideReason: null });
    expect(await ProjectPurchaseOrderModel.findById("historical-zero-order").lean()).toEqual(historicalOrder);
    expect(await ProjectPurchaseOrderRevisionModel.findById("historical-zero-revision").lean()).toEqual(historicalRevision);
  });

  it("reviews one project package then atomically creates private vendor POs and work, leaving the other project unchanged", async () => {
    const preview = await preparation();
    expect(preview.netPaise).toBe(52_501);
    expect(preview.sections.find(section => section.id === "CA")?.netPaise).toBe(12_501);
    const submitted = await service.submit(buyer, "request-project-a", submitInput(preview.digest));
    expect(submitted.status).toBe("pending_approval");
    expect(submitted.vendorTotals).toHaveLength(2);
    expect(submitted.sectionTotals).toHaveLength(2);
    expect(submitted.totals).toEqual({ netPaise: 52_501, gstPaise: 4_250, totalPaise: 56_751 });
    expect((await service.pending(admin, { limit: 20, offset: 0 })).total).toBe(1);
    expect((await service.list(buyer, "request-project-a", { limit: 20, offset: 0 })).total).toBe(1);
    await expect(service.list(client, "request-project-a", { limit: 20, offset: 0 })).rejects.toMatchObject({ status: 403 });
    expect(await service.submit(buyer, "request-project-a", submitInput(preview.digest))).toMatchObject({ id: submitted.id });
    const decision = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId,
      idempotencyKey: "approve-project-request", decision: "approve" as const, reason: null, budgetOverrideReason: null };
    const approved = await service.decide(admin, submitted.id, decision);
    expect(approved.status).toBe("approved");
    expect(approved.approvedOrderIds).toHaveLength(2);
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-a", status: "approved" })).toBe(2);
    expect(await VendorWorkAssignmentModel.countDocuments({ projectId: "request-project-a" })).toBe(2);
    const generated = await ProjectPurchaseOrderModel.findById(approved.approvedOrderIds[0]).lean();
    const individual = createProjectPurchaseOrderService({ audit, onApproved: onPurchaseOrderApproved, now: () => now });
    await expect(individual.amend(buyer, "request-project-a", approved.approvedOrderIds[0]!, {
      expectedVersion: generated!.version, reason: "Change material", idempotencyKey: "amend-grouped-vendor-order"
    })).rejects.toMatchObject({ code: "PURCHASE_ORDER_REQUEST_AMENDMENT_BLOCKED" });
    expect((await ProjectPurchaseOrderModel.findById(approved.approvedOrderIds[0]).lean())?.status).toBe("approved");
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-b" })).toBe(0);
    expect(await service.decide(admin, submitted.id, decision)).toMatchObject({ id: submitted.id, status: "approved" });
    expect(await ProjectPurchaseOrderRequestRevisionModel.countDocuments({ requestId: submitted.id })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: submitted.id, action: "project_purchase_order_request_decided" })).toBe(1);
  });

  it("keeps an approved vendor allocation attached to its original item across projects", async () => {
    const submitted = await service.submit(buyer, "request-project-a", submitInput((await preparation()).digest));
    await service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "approve-before-allocation-edit",
      decision: "approve", reason: null, budgetOverrideReason: null });
    const procurement = createProjectProcurementService({ audit, now: () => now });
    const original = { itemName: "Item a", brand: "Test", uomId: "request-meter", vendorId: "request-vendor-a",
      pricePaise: 10_001, plannedOrderQuantityMilliUnits: 1_250, expectedVersion: 1 };
    await expect(procurement.update(buyer, "request-project-a", "request-item-a", {
      ...original, vendorId: "request-vendor-b", allocatedWorkPaise: 20_000
    })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_APPROVED_ALLOCATION_LOCKED" });
    await expect(procurement.update(buyer, "request-project-a", "request-item-a", {
      ...original, allocatedWorkPaise: 19_000
    })).rejects.toMatchObject({ code: "PROCUREMENT_ITEM_APPROVED_ALLOCATION_LOCKED" });
    expect(await ProjectProcurementItemModel.findById("request-item-a").lean()).toMatchObject({
      vendorId: "request-vendor-a", allocatedWorkPaise: 20_000, version: 1
    });
    expect(await ProjectProcurementItemModel.findById("request-item-c").lean()).toMatchObject({
      projectId: "request-project-b", vendorId: "request-vendor-a", allocatedWorkPaise: 10_000
    });
  });

  it("rejects stale source and preserves the returned revision before corrected resubmission", async () => {
    const submitted = await service.submit(buyer, "request-project-a", submitInput((await preparation()).digest));
    await ProjectProcurementItemModel.updateOne({ _id: "request-item-a" }, { $set: { plannedOrderQuantityMilliUnits: 2_000, allocatedWorkPaise: 25_000, version: 2 } });
    await expect(service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "stale-approval", decision: "approve",
      reason: null, budgetOverrideReason: null })).rejects.toMatchObject({ code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    const returned = await service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "changes-requested", decision: "request_changes",
      reason: "Update quantity", budgetOverrideReason: null });
    const corrected = await service.submit(buyer, "request-project-a", { ...submitInput((await preparation()).digest, true), expectedRequestVersion: returned.version });
    expect(corrected.revisions).toHaveLength(2);
    expect(corrected.revisions[0]?.lines.find(line => line.procurementItemId === "request-item-a")?.quantityMilliUnits).toBe(1_250);
    expect(corrected.revisions[1]?.lines.find(line => line.procurementItemId === "request-item-a")?.quantityMilliUnits).toBe(2_000);
  });

  it("rolls back every vendor order, assignment, and decision when one vendor task creation fails", async () => {
    const submitted = await service.submit(buyer, "request-project-a", submitInput((await preparation()).digest));
    const failing = createProjectPurchaseOrderRequestService({ audit, now: () => now,
      onApproved: async (approval, session: ClientSession) => {
        await onPurchaseOrderApproved(approval, session);
        if (approval.vendorId === "request-vendor-b") throw new Error("second vendor task failed");
      } });
    await expect(failing.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "fail-second-task", decision: "approve",
      reason: null, budgetOverrideReason: null })).rejects.toThrow("second vendor task failed");
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
    expect(await VendorWorkAssignmentModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
    expect(await ProjectPurchaseOrderRequestModel.findById(submitted.id).lean()).toMatchObject({ status: "pending_approval", version: 1 });
  });
});
