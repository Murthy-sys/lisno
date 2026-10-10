import mongoose, { type ClientSession } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel } from "../src/models/ProjectPurchaseOrderModeDecision.js";
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
import { createProjectPurchaseOrderModeDecisionService } from "../src/services/project-purchase-order-mode.service.js";
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
const committedReads: unknown[] = [];
const committed = vi.fn(async () => {
  // Await a non-session read inside the hook. A premature transactional wake
  // would observe no committed orders and cannot race the later commit.
  committedReads.push(await ProjectPurchaseOrderModel.find({ status: "approved" }).lean().exec());
});
const service = createProjectPurchaseOrderRequestService({ audit, onApproved: onPurchaseOrderApproved,
  onIssuedCommitted: committed, now: () => now });
const modeDecisions = createProjectPurchaseOrderModeDecisionService({ audit, now: () => now });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-purchase-order-request-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, ProjectWorkflowTaskModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeRevisionModel,
    AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeTaxVersionModel,
    ProjectProcurementItemModel, ProjectPurchaseOrderModel,
    ProjectPurchaseOrderRevisionModel, ProjectPurchaseOrderRequestModel, ProjectPurchaseOrderRequestRevisionModel,
    ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel,
    VendorWorkAssignmentModel, AuditEventModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  committed.mockClear(); committedReads.length = 0;
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
  for (const projectId of ["request-project-a", "request-project-b"])
    for (const lineKey of ["line-first", "line-second"])
      await modeDecisions.save(buyer, projectId, { sourceLineItemKey: lineKey, expectedVersion: 0,
        expectedEstimateSource: { estimateId: `estimate-${projectId}`, estimateVersion: 1,
          estimateReviewRoundId: `round-${projectId}` },
        idempotencyKey: `legacy-${projectId}-${lineKey}`, mode: null, quantity: null, discountBps: 0,
        markupBasis: "starting", exceptionReason: "Historical approved line has no saved Configuration revision." });
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
async function configureFirstApprovedLine() {
  const mainLineId = "request-main-line";
  const revisionId = "request-config-revision";
  const sections = AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map(sectionKey => ({
    _id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey,
    applicability: ["overview", "advanced", "pricing", "quantity-margin"].includes(sectionKey) ? "configured" : "not_configured",
    payload: sectionKey === "overview" ? { uomId: "request-meter" }
      : sectionKey === "advanced" ? { modeCalculations: { pmc: { baseRatePaise: 10_000,
        lowQuantityLimit: "2", impactBps: 1_000, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 },
        sub_vendor: null, in_house_labor: null, in_house_material: null },
        pmcMarginBps: 1_500, subVendorMarginBps: null }
        : sectionKey === "pricing" ? { priceEntries: [{ operation: "reference", priceEntryId: "request-price-entry",
          priceVersionId: "request-price-version" }] }
          : sectionKey === "quantity-margin" ? { gapBehavior: "no_adjustment", quantitySlabs: [], wastageBps: 0 } : {},
    version: 1, createdById: buyer.id, updatedById: buyer.id, createdAt: now, updatedAt: now
  }));
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId, revisionNumber: 1,
    sections: sections.map(section => ({ sectionKey: section.sectionKey,
      applicability: section.applicability as "configured" | "not_configured", payload: section.payload })) });
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: revisionId, mainLineId, revisionNumber: 1,
    status: "active", contentDigest, version: 2, createdById: buyer.id, updatedById: buyer.id,
    activatedAt: now, activatedById: buyer.id, createdAt: now, updatedAt: now });
  await AiEstimatorKnowledgeSectionModel.collection.insertMany(sections);
  await AiEstimatorKnowledgeTaxVersionModel.collection.insertOne({ _id: "request-tax-version", taxRuleId: "request-tax-rule",
    versionNumber: 1, rateBps: 1_800, treatment: "exclusive", applicability: "purchase",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, status: "active", version: 1,
    createdById: buyer.id, updatedById: buyer.id, createdAt: now, updatedAt: now });
  await AiEstimatorKnowledgePriceVersionModel.collection.insertOne({ _id: "request-price-version", mainLineId, revisionId,
    priceEntryId: "request-price-entry", scopeKey: "fixture", versionNumber: 1, vendorId: "request-vendor-a",
    uomId: "request-meter", specificationId: null, modeId: null, taxRuleId: "request-tax-rule",
    taxVersionId: "request-tax-version", currency: "INR", treatment: "exclusive", inputAmountPaise: 10_001,
    baseAmountPaise: 10_001, taxAmountPaise: 1_800, totalAmountPaise: 11_801,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, status: "active", reviewRequired: false,
    version: 1, createdById: buyer.id, updatedById: buyer.id, createdAt: now, updatedAt: now });
  await EstimateClientReviewRoundModel.collection.updateOne({ _id: "round-request-project-a" }, { $set: {
    "estimateSnapshot.lineItems.0.source": "configuration", "estimateSnapshot.lineItems.0.itemType": "main_line",
    "estimateSnapshot.lineItems.0.catalogueId": mainLineId,
    "estimateSnapshot.lineItems.0.amountPaise": 1_000_000,
    "estimateSnapshot.lineItems.0.roomId": "request-room-a",
    "estimateSnapshot.lineItems.0.mainBasketId": "request-basket-a",
    "estimateSnapshot.lineItems.0.mainBasketName": "Joinery",
    "estimateSnapshot.lineItems.0.subBasketId": "request-sub-a",
    "estimateSnapshot.lineItems.0.subBasketName": "Cabinetry",
    "estimateSnapshot.lineItems.0.mainLineId": mainLineId,
    "estimateSnapshot.lineItems.0.mainLineName": "Timber",
    "estimateSnapshot.lineItems.0.revisionId": revisionId,
    "estimateSnapshot.lineItems.0.sourceItemStatus": "active",
    "estimateSnapshot.lineItems.0.sourceRevisionStatus": "active",
    "estimateSnapshot.lineItems.0.sourceItemVersion": 1,
    "estimateSnapshot.lineItems.0.sourceRevisionVersion": 2,
    "estimateSnapshot.lineItems.0.uomId": "request-meter",
    "estimateSnapshot.lineItems.0.uomCode": "M",
    "estimateSnapshot.lineItems.0.uomDecimalScale": 2,
    "estimateSnapshot.lineItems.0.uomName": "Meter"
  } });
  await ProjectProcurementItemModel.collection.updateMany({ projectId: "request-project-a",
    sourceLineItemKey: "line-first" }, { $set: { sourceSectionId: "request-basket-a" } });
  await modeDecisions.save(buyer, "request-project-a", { sourceLineItemKey: "line-first", expectedVersion: 1,
    expectedEstimateSource: { estimateId: "estimate-request-project-a", estimateVersion: 1,
      estimateReviewRoundId: "round-request-project-a" }, expectedRevisionDigest: contentDigest,
    idempotencyKey: "first-line-configured-mode", mode: "pmc", quantity: "2", discountBps: 0,
    markupBasis: "starting", exceptionReason: null });
}
async function saveRecoveredFirstApprovedLine() {
  await configureFirstApprovedLine();
  // Model the reported mismatch: content changes without a timestamp change.
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "request-config-revision-advanced" },
    { $set: { "payload.modeCalculations.pmc.baseRatePaise": 11_000 } });
  const before = await preparation();
  const pendingMode = before.estimateLines.find(line => line.key === "line-first")?.mode;
  expect(pendingMode).toMatchObject({ state: "unavailable", integrity: { status: "mismatch",
    activatedDigest: expect.any(String), observedDigest: expect.any(String) } });
  const observedDigest = pendingMode!.integrity!.observedDigest;
  const sectionsBeforeSave = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "request-config-revision" }).lean();
  const revisionBeforeSave = await AiEstimatorKnowledgeRevisionModel.findById("request-config-revision").lean();
  const saved = await modeDecisions.save(buyer, "request-project-a", { sourceLineItemKey: "line-first", expectedVersion: 2,
    expectedEstimateSource: { estimateId: "estimate-request-project-a", estimateVersion: 1,
      estimateReviewRoundId: "round-request-project-a" },
    expectedRevisionDigest: pendingMode!.revision!.contentDigest,
    idempotencyKey: "first-line-recovered-mode", mode: "pmc", quantity: "2", discountBps: 0,
    markupBasis: "starting", exceptionReason: null,
    recovery: { expectedObservedDigest: observedDigest,
      reason: "Buyer reviewed the current saved PMC calculation.", acknowledge: true } });
  expect(saved.integrityBasis).toMatchObject({ kind: "observed_unverified", observedDigest,
    activatedDigest: pendingMode!.revision!.contentDigest });
  expect(await AiEstimatorKnowledgeSectionModel.find({ revisionId: "request-config-revision" }).lean()).toEqual(sectionsBeforeSave);
  expect(await AiEstimatorKnowledgeRevisionModel.findById("request-config-revision").lean()).toEqual(revisionBeforeSave);
  const prepared = await preparation();
  expect(prepared.estimateLines.find(line => line.key === "line-first")?.mode).toMatchObject({ state: "ready",
    integrity: { observedDigest }, decision: { integrityBasis: { observedDigest } },
    preview: { settings: { scopes: [{ baseRatePaise: 11_000 }] } } });
  return { prepared, observedDigest, saved };
}
async function preparation(projectId = "request-project-a") {
  return mongoose.connection.transaction(session => buildProjectPurchaseOrderPreparation(projectId, session));
}
async function historicalPreparation(projectId = "request-project-a") {
  return mongoose.connection.transaction(session => buildProjectPurchaseOrderPreparation(projectId, session,
    { at: now, digestVersion: "legacy" }));
}
function submitInput(digest: string, corrected = false) {
  return { expectedPreparationDigest: digest, lines: [
    { procurementItemId: "request-item-a", expectedVersion: corrected ? 2 : 1, gstBasisPoints: 1_800,
      commercialExceptionReason: "Agreed rate and tax for this historical source item.", scopeType: "execution" as const,
      description: "Build joinery", targetDate: "2026-11-15", deliveryLocation: "Villa" },
    { procurementItemId: "request-item-b", expectedVersion: 1, gstBasisPoints: 500,
      commercialExceptionReason: "Agreed rate and tax for this historical source item.", scopeType: "supply" as const,
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

  it("rejects duplicate child IDs even when the array length masks an omitted item", async () => {
    const prepared = await preparation();
    const input = submitInput(prepared.digest);
    const duplicate = { ...input, lines: [input.lines[0]!, input.lines[0]!] };
    const { idempotencyKey: _key, ...quoteInput } = duplicate;
    await expect(service.quote(buyer, "request-project-a", quoteInput)).rejects.toMatchObject({
      status: 400, code: "VALIDATION_ERROR" });
    await expect(service.submit(buyer, "request-project-a", duplicate)).rejects.toMatchObject({
      status: 400, code: "VALIDATION_ERROR" });
    expect(await ProjectPurchaseOrderRequestModel.countDocuments()).toBe(0);
  });

  it("requires documented commercial terms for an unavailable historical price and freezes one snapshot for multiple children", async () => {
    await ProjectProcurementItemModel.create(item("request-project-a", "extra", "CA", "line-first",
      "request-vendor-a", 3_333, 1_000, 5_000));
    const prepared = await preparation();
    const input = submitInput(prepared.digest);
    input.lines.push({ procurementItemId: "request-item-extra", expectedVersion: 1, gstBasisPoints: 500,
      commercialExceptionReason: "Extra material uses the vendor's directly agreed rate and GST.",
      scopeType: "supply", description: "Additional material", targetDate: "2026-11-20", deliveryLocation: "Villa" });
    const { idempotencyKey: _key, ...quoteInput } = input;
    await expect(service.quote(buyer, "request-project-a", { ...quoteInput,
      lines: quoteInput.lines.map((line, index) => index === 2 ? { ...line, commercialExceptionReason: null } : line)
    })).rejects.toMatchObject({ code: "PURCHASE_ORDER_COMMERCIAL_EXCEPTION_REQUIRED" });

    const quote = await service.quote(buyer, "request-project-a", quoteInput);
    expect(quote.modeSnapshots).toHaveLength(2);
    const first = quote.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first");
    expect(first).toMatchObject({ source: "legacy", mode: { state: "exception", decision: { version: 1,
      exceptionReason: expect.stringContaining("Historical approved line") } },
      actualChildren: [{ procurementItemId: "request-item-a" }, { procurementItemId: "request-item-extra" }] });
    expect(first?.actualTotals).toEqual({ netPaise: 15_834, gstPaise: 2_417, totalPaise: 18_251 });
    expect(first?.actualNetMinusConfiguredCostPaise).toBeNull();
    const submitted = await service.submit(buyer, "request-project-a", input);
    expect(submitted.revisions[0]?.modeSnapshotStatus).toBe("captured");
    expect(submitted.revisions[0]?.modeSnapshots).toEqual(quote.modeSnapshots);
    const frozen = await ProjectPurchaseOrderRequestRevisionModel.findById(submitted.submittedRevisionId).lean();
    expect(frozen?.modeSnapshots).toHaveLength(2);
    const approved = await service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "approve-multiple-children",
      decision: "approve", reason: null, budgetOverrideReason: null });
    for (const orderId of approved.approvedOrderIds) {
      const order = await ProjectPurchaseOrderModel.findById(orderId).lean();
      const revision = await ProjectPurchaseOrderRevisionModel.findById(order?.approvedRevisionId).lean();
      expect(order).not.toHaveProperty("modeSnapshots");
      expect(revision).not.toHaveProperty("modeSnapshots");
      expect(revision?.lines.every((line: Record<string, unknown>) =>
        !("mode" in line) && !("commercialExceptionReason" in line))).toBe(true);
    }
  });

  it("rejects a quote after a source-line mode decision changes and reads a historical revision without invented mode values", async () => {
    const stale = await preparation();
    await modeDecisions.save(buyer, "request-project-a", { sourceLineItemKey: "line-first", expectedVersion: 1,
      expectedEstimateSource: { estimateId: "estimate-request-project-a", estimateVersion: 1,
        estimateReviewRoundId: "round-request-project-a" },
      idempotencyKey: "legacy-line-first-updated", mode: null, quantity: null, discountBps: 0,
      markupBasis: "starting", exceptionReason: "Historical approved line still has no pinned configuration data." });
    const { idempotencyKey: _key, ...fields } = submitInput(stale.digest);
    await expect(service.quote(buyer, "request-project-a", fields)).rejects.toMatchObject({
      code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    const current = await preparation();
    const submitted = await service.submit(buyer, "request-project-a", submitInput(current.digest));
    expect(submitted.revisions[0]?.modeSnapshots[0]?.mode.decision?.version).toBe(2);
    await ProjectPurchaseOrderRequestRevisionModel.collection.updateOne({ _id: submitted.submittedRevisionId },
      { $unset: { modeSnapshots: "" } });
    const historical = await service.get(buyer, "request-project-a", submitted.id);
    expect(historical.revisions[0]).toMatchObject({ modeSnapshotStatus: "historical_unavailable", modeSnapshots: [] });
    expect(historical.revisions[0]?.totals).toEqual(submitted.totals);
  });

  it("approves a pending pre-mode request using its original digest while still rejecting changed procurement inputs", async () => {
    const current = await preparation();
    const submitted = await service.submit(buyer, "request-project-a", submitInput(current.digest));
    const historical = await historicalPreparation();
    expect(historical.digest).not.toBe(current.digest);
    // Simulate a revision persisted before mode snapshots and mode decisions existed.
    await ProjectPurchaseOrderRequestRevisionModel.collection.updateOne({ _id: submitted.submittedRevisionId },
      { $set: { preparationDigest: historical.digest }, $unset: { modeSnapshots: "" } });
    await ProjectPurchaseOrderRequestModel.collection.updateOne({ _id: submitted.id },
      { $set: { preparationDigest: historical.digest } });
    await ProjectPurchaseOrderModeDecisionModel.deleteMany({ projectId: "request-project-a" });
    await ProjectProcurementItemModel.collection.updateOne({ _id: "request-item-a" }, { $set: { pricePaise: 10_002 } });
    const approval = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId,
      idempotencyKey: "approve-historical-pending", decision: "approve" as const,
      reason: null, budgetOverrideReason: null };
    await expect(service.decide(admin, submitted.id, approval)).rejects.toMatchObject({
      code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
    await ProjectProcurementItemModel.collection.updateOne({ _id: "request-item-a" }, { $set: { pricePaise: 10_001 } });
    const approved = await service.decide(admin, submitted.id, approval);
    expect(approved.status).toBe("approved");
    expect(approved.approvedOrderIds).toHaveLength(2);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(await committedReads[0]).toEqual(expect.arrayContaining(approved.approvedOrderIds.map(_id =>
      expect.objectContaining({ _id, status: "approved", approvedRevisionId: expect.any(String) }))));
    expect(approved.revisions[0]).toMatchObject({ modeSnapshotStatus: "historical_unavailable", modeSnapshots: [] });
    expect(approved.totals).toEqual(submitted.totals);
  });

  it("freezes one pinned configured calculation and matching price references for two children, then blocks altered settings", async () => {
    await ProjectProcurementItemModel.create(item("request-project-a", "extra", "CA", "line-first",
      "request-vendor-a", 10_001, 1_000, 20_000));
    await configureFirstApprovedLine();
    const prepared = await preparation();
    expect(prepared.estimateLines.find(line => line.key === "line-first")?.mode).toMatchObject({
      state: "ready", preview: { adjustedCostPaise: 22_000, settings: { configuredMarginBps: 1_500,
        scopes: [{ baseRatePaise: 10_000, lowQuantityLimit: "2", impactBps: 1_000 }] } } });
    const original = submitInput(prepared.digest);
    const { commercialExceptionReason: _matchedReason, ...matched } = original.lines[0]!;
    const fields = { ...original, lines: [matched, original.lines[1]!, {
      procurementItemId: "request-item-extra", expectedVersion: 1, gstBasisPoints: 1_800,
      scopeType: "supply" as const, description: "More of the same source material",
      targetDate: "2026-11-20", deliveryLocation: "Villa"
    }] };
    const { idempotencyKey: _key, ...quoteInput } = fields;
    const mismatch = { ...quoteInput, lines: quoteInput.lines.map((line, index) =>
      index === 0 ? { ...line, gstBasisPoints: 500 } : line) };
    await expect(service.quote(buyer, "request-project-a", mismatch)).rejects.toMatchObject({
      code: "PURCHASE_ORDER_COMMERCIAL_EXCEPTION_REQUIRED" });
    const quote = await service.quote(buyer, "request-project-a", quoteInput);
    const configured = quote.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first");
    expect(configured?.mode).not.toHaveProperty("integrity");
    expect(configured?.mode.decision).not.toHaveProperty("integrityBasis");
    expect(configured).toMatchObject({ source: "configuration", mainBasketId: "request-basket-a",
      subBasketId: "request-sub-a", mainLineId: "request-main-line", referenceAsOf: now.toISOString(),
      mode: { state: "ready", revision: { id: "request-config-revision" },
        priceReferences: { "request-item-a": { state: "ready", priceVersionId: "request-price-version",
          taxVersionId: "request-tax-version", unitPricePaise: 10_001, gstBasisPoints: 1_800 },
          "request-item-extra": { state: "ready", priceVersionId: "request-price-version" } } },
      actualChildren: [{ commercialExceptionReason: null }, { commercialExceptionReason: null }] });
    expect(configured?.actualTotals).toEqual({ netPaise: 22_502, gstPaise: 4_050, totalPaise: 26_552 });
    expect(configured?.actualNetMinusConfiguredCostPaise).toBe(502);
    const submitted = await service.submit(buyer, "request-project-a", fields);
    expect(submitted.revisions[0]?.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first")?.mode.preview?.settings)
      .toEqual(configured?.mode.preview?.settings);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "request-config-revision-advanced" },
      { $set: { "payload.pmcMarginBps": 1_700 } });
    await expect(service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "approve-after-config-change",
      decision: "approve", reason: null, budgetOverrideReason: null })).rejects.toMatchObject({
      code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
    const retained = await service.get(buyer, "request-project-a", submitted.id);
    expect(retained.revisions[0]?.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first")?.mode.preview?.settings.configuredMarginBps)
      .toBe(1_500);
  });

  it("invalidates a recovered quote after the observed content changes without an updated timestamp", async () => {
    const projectB = await preparation("request-project-b");
    const { prepared } = await saveRecoveredFirstApprovedLine();
    expect((await preparation("request-project-b")).digest).toBe(projectB.digest);
    const { idempotencyKey: _key, ...fields } = submitInput(prepared.digest);
    const quote = await service.quote(buyer, "request-project-a", fields);
    expect(quote.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first")?.mode.decision?.integrityBasis)
      .toMatchObject({ kind: "observed_unverified", observedDigest: expect.any(String) });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "request-config-revision-advanced" },
      { $set: { "payload.modeCalculations.pmc.baseRatePaise": 12_000 } });
    const changed = await preparation();
    expect(changed.digest).not.toBe(prepared.digest);
    expect(changed.estimateLines.find(line => line.key === "line-first")?.mode?.state).not.toBe("ready");
    await expect(service.quote(buyer, "request-project-a", fields)).rejects.toMatchObject({
      code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    await expect(service.submit(buyer, "request-project-a", submitInput(prepared.digest))).rejects.toMatchObject({
      code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    expect(await ProjectPurchaseOrderRequestModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
  });

  it("requires a separate Super Admin reason for recovered values and keeps vendor orders commercial only", async () => {
    const { prepared } = await saveRecoveredFirstApprovedLine();
    const submitted = await service.submit(buyer, "request-project-a", submitInput(prepared.digest));
    const frozen = submitted.revisions[0]?.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first");
    expect(frozen?.mode.decision?.integrityBasis).toMatchObject({ kind: "observed_unverified",
      reason: "Buyer reviewed the current saved PMC calculation." });
    expect(frozen?.mode.preview?.adjustedCostPaise).toBe(24_200);
    const decision = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId,
      idempotencyKey: "approve-recovered-request", decision: "approve" as const,
      budgetOverrideReason: null };
    await expect(service.decide(admin, submitted.id, { ...decision, reason: null,
      budgetOverrideReason: "Budget variance separately reviewed." })).rejects.toMatchObject({
      code: "PURCHASE_ORDER_RECOVERY_APPROVAL_REASON_REQUIRED" });
    await expect(service.decide(admin, submitted.id, { ...decision, reason: "Too short" })).rejects.toMatchObject({
      code: "PURCHASE_ORDER_RECOVERY_APPROVAL_REASON_REQUIRED" });
    const reason = "I reviewed the unverified saved mode values and vendor terms.";
    const approved = await service.decide(admin, submitted.id, { ...decision, reason });
    expect(approved.status).toBe("approved");
    expect(approved.approvedOrderIds).toHaveLength(2);
    expect(approved.decisions.at(-1)?.reason).toBe(reason);
    expect(approved.totals).toEqual(submitted.totals);
    expect(await AuditEventModel.findOne({ entityId: submitted.id,
      action: "project_purchase_order_request_decided" }).lean()).toMatchObject({ actorId: admin.id, reason });
    for (const orderId of approved.approvedOrderIds) {
      const order = await ProjectPurchaseOrderModel.findById(orderId).lean();
      const vendorRevision = await ProjectPurchaseOrderRevisionModel.findById(order?.approvedRevisionId).lean();
      expect(order).not.toHaveProperty("modeSnapshots");
      expect(vendorRevision).not.toHaveProperty("modeSnapshots");
      expect(vendorRevision?.lines.every((line: Record<string, unknown>) =>
        !("integrityBasis" in line) && !("mode" in line))).toBe(true);
    }
    expect(await service.decide(admin, submitted.id, { ...decision, reason })).toMatchObject({ status: "approved" });
  });

  it("blocks approval if the observed content changes after a recovered request is submitted", async () => {
    const { prepared } = await saveRecoveredFirstApprovedLine();
    const submitted = await service.submit(buyer, "request-project-a", submitInput(prepared.digest));
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "request-config-revision-advanced" },
      { $set: { "payload.modeCalculations.pmc.baseRatePaise": 12_000 } });
    await expect(service.decide(admin, submitted.id, { expectedVersion: submitted.version,
      submittedRevisionId: submitted.submittedRevisionId, idempotencyKey: "approve-stale-recovered-request",
      decision: "approve", reason: "I reviewed the buyer's saved value recovery.", budgetOverrideReason: null }))
      .rejects.toMatchObject({ code: "PURCHASE_ORDER_PREPARATION_CONFLICT" });
    expect(await ProjectPurchaseOrderModel.countDocuments({ projectId: "request-project-a" })).toBe(0);
    expect((await service.get(buyer, "request-project-a", submitted.id)).status).toBe("pending_approval");
  });

  it("freezes price references only for children in a later request after one child was individually ordered", async () => {
    await ProjectProcurementItemModel.create(item("request-project-a", "extra", "CA", "line-first",
      "request-vendor-a", 10_001, 1_000, 20_000));
    await configureFirstApprovedLine();
    const individual = createProjectPurchaseOrderService({ audit, onApproved: onPurchaseOrderApproved, now: () => now });
    const draft = await individual.create(buyer, "request-project-a", { vendorId: "request-vendor-a", terms: "First delivery",
      idempotencyKey: "manual-configured-child", lines: [{ procurementItemId: "request-item-a", quantityMilliUnits: 1_250,
        unitPricePaise: 10_001, gstBasisPoints: 1_800, scopeType: "execution", description: "Initial joinery",
        targetDate: "2026-11-15", deliveryLocation: "Villa" }] });
    const sent = await individual.submit(buyer, "request-project-a", draft.id,
      { expectedVersion: draft.version, idempotencyKey: "manual-configured-child-submit" });
    await individual.decide(admin, "request-project-a", draft.id, { expectedVersion: sent.version,
      submittedRevisionId: sent.submittedRevisionId!, idempotencyKey: "manual-configured-child-approve",
      decision: "approve", reason: null, budgetOverrideReason: null });
    const prepared = await preparation();
    expect(Object.keys(prepared.estimateLines.find(line => line.key === "line-first")?.mode?.priceReferences ?? {}))
      .toEqual(["request-item-a", "request-item-extra"]);
    const input = { expectedPreparationDigest: prepared.digest, lines: [
      { procurementItemId: "request-item-extra", expectedVersion: 1, gstBasisPoints: 1_800,
        scopeType: "supply" as const, description: "Follow-up configured material", targetDate: "2026-11-20",
        deliveryLocation: "Villa" },
      submitInput(prepared.digest).lines[1]!
    ], vendorTerms: [{ vendorId: "request-vendor-a", terms: "Follow-up delivery" },
      { vendorId: "request-vendor-b", terms: "Delivery included" }] };
    const quote = await service.quote(buyer, "request-project-a", input);
    const configured = quote.modeSnapshots.find(snapshot => snapshot.sourceLineItemKey === "line-first");
    expect(configured?.actualChildren.map(child => child.procurementItemId)).toEqual(["request-item-extra"]);
    expect(Object.keys(configured?.mode.priceReferences ?? {})).toEqual(["request-item-extra"]);
    const submitted = await service.submit(buyer, "request-project-a",
      { ...input, idempotencyKey: "later-configured-child-request" });
    expect(Object.keys(submitted.revisions[0]?.modeSnapshots.find(snapshot =>
      snapshot.sourceLineItemKey === "line-first")?.mode.priceReferences ?? {})).toEqual(["request-item-extra"]);
  });

  it("keeps approved request history when new procurement items need a later project request", async () => {
    const first = await service.submit(buyer, "request-project-a", submitInput((await preparation()).digest));
    await service.decide(admin, first.id, { expectedVersion: first.version, submittedRevisionId: first.submittedRevisionId,
      idempotencyKey: "approve-first-project-request", decision: "approve", reason: null, budgetOverrideReason: null });
    await ProjectProcurementItemModel.create(item("request-project-a", "later", "CA", "line-first", "request-vendor-a", 2_500, 1_000, 5_000));
    const preview = await preparation();
    const later = await service.submit(buyer, "request-project-a", { expectedPreparationDigest: preview.digest,
      lines: [{ procurementItemId: "request-item-later", expectedVersion: 1, gstBasisPoints: 500,
        commercialExceptionReason: "Second purchase uses an explicitly agreed vendor rate and tax.",
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
    expect(committed).toHaveBeenCalledTimes(1);
    expect(await committedReads[0]).toEqual(expect.arrayContaining(approved.approvedOrderIds.map(_id =>
      expect.objectContaining({ _id, status: "approved", approvedRevisionId: expect.any(String) }))));
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
    expect(committed).toHaveBeenCalledTimes(2);
    expect(await committedReads[1]).toHaveLength(2);
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
    const failing = createProjectPurchaseOrderRequestService({ audit, now: () => now, onIssuedCommitted: committed,
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
    expect(committed).not.toHaveBeenCalled();
  });
});
