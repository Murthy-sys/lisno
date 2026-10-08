import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel } from "../src/models/ProjectPurchaseOrderModeDecision.js";
import { ProcurementBasketBaseRateModel, ProcurementBasketBaseRateReceiptModel } from "../src/models/ProcurementBasketBaseRate.js";
import { ProcurementBasketEnquiryModel } from "../src/models/ProcurementBasketTender.js";
import { ProjectPurchaseOrderRequestModel } from "../src/models/ProjectPurchaseOrderRequest.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProcurementBasketService } from "../src/services/procurement-basket.service.js";
import { createProcurementBasketBaseRateService } from "../src/services/procurement-basket-base-rate.service.js";
import { buildBasketBoqLines, currentBasket } from "../src/services/procurement-basket-tender-support.service.js";
import { createProjectPurchaseOrderModeDecisionService, resolvePurchaseOrderModes } from "../src/services/project-purchase-order-mode.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-04T10:00:00.000Z");
const buyer: PublicUser = { id: "mode-buyer", name: "Buyer", email: "mode-buyer@example.test", role: "procurement" };
const client: PublicUser = { id: "mode-client", name: "Client", email: "mode-client@example.test", role: "client" };
const other: PublicUser = { id: "mode-other", name: "Other", email: "mode-other@example.test", role: "designer" };
const audit = createAuditService(createMemoryRepository());
const service = createProjectPurchaseOrderModeDecisionService({ audit, now: () => at });
const projectRates = createProcurementBasketBaseRateService({ audit, now: () => at });
const settings = { baseRatePaise: 10_000, lowQuantityLimit: "2", impactBps: 1_000,
  minimumMarkupBps: 1_000, startingMarkupBps: 2_000 };
const advanced = { modeCalculations: { pmc: settings, sub_vendor: null, in_house_labor: null, in_house_material: null },
  pmcMarginBps: 1_500, subVendorMarginBps: null };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-purchase-order-mode-tests");
  await Promise.all([UserModel, ProjectModel, EstimateModel, EstimateClientReviewRoundModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel,
    AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgePriceVersionModel,
    AiEstimatorKnowledgeTaxVersionModel, ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel,
    ProjectPurchaseOrderRequestModel, AuditEventModel, ProcurementBasketBaseRateModel,
    ProcurementBasketBaseRateReceiptModel, ProcurementBasketEnquiryModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([buyer, client, other].map((user) => ({ _id: user.id, name: user.name,
    email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await seedConfiguration();
  await seedProject();
});
afterAll(async () => { await replica?.stop(); });

function sectionsFor(revisionId: string) {
  return AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
    _id: `${revisionId}-${sectionKey}`, mainLineId: "line-a", revisionId, sectionKey,
    applicability: ["overview", "advanced", "pricing", "quantity-margin"].includes(sectionKey) ? "configured" : "not_configured",
    payload: sectionKey === "overview" ? { uomId: "mode-uom" }
      : sectionKey === "advanced" ? advanced
        : sectionKey === "pricing" ? { priceEntries: [{ operation: "reference", priceEntryId: "price-entry", priceVersionId: "price-version" }] }
          : sectionKey === "quantity-margin" ? { gapBehavior: "no_adjustment", quantitySlabs: [], wastageBps: 500 } : {},
    version: 1, createdById: buyer.id, updatedById: buyer.id
  }));
}

const approvedRevisionDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
  sections: sectionsFor("revision-a").map((row) => ({
    sectionKey: row.sectionKey as typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS[number],
    applicability: row.applicability as "configured" | "not_configured", payload: row.payload
  })) });
const expectedEstimateSource = { estimateId: "mode-estimate", estimateVersion: 1,
  estimateReviewRoundId: "mode-round" };

async function seedConfiguration() {
  await AiEstimatorKnowledgeUomModel.create({ _id: "mode-uom", code: "SQFT", name: "Square foot", decimalScale: 2,
    displayOrder: 1, status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id });
  await AiEstimatorKnowledgeMainLineModel.create({ _id: "line-a", basketId: "basket-a", subBasketId: "sub-a",
    name: "POP", displayOrder: 1, status: "active", activeRevisionId: "revision-a", draftRevisionId: null,
    version: 1, createdById: buyer.id, updatedById: buyer.id });
  const rows = sectionsFor("revision-a");
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "revision-a", mainLineId: "line-a", revisionNumber: 1,
    status: "active", contentDigest: approvedRevisionDigest, version: 2, createdById: buyer.id, updatedById: buyer.id,
    activatedAt: at, activatedById: buyer.id, createdAt: at, updatedAt: at });
  await AiEstimatorKnowledgeSectionModel.collection.insertMany(rows.map((row) => ({ ...row, createdAt: at, updatedAt: at })));
  await AiEstimatorKnowledgeTaxVersionModel.collection.insertOne({ _id: "tax-version", taxRuleId: "tax-rule", versionNumber: 1,
    rateBps: 500, treatment: "inclusive", applicability: "purchase", effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null, status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id, createdAt: at, updatedAt: at });
  await AiEstimatorKnowledgePriceVersionModel.collection.insertOne({ _id: "price-version", mainLineId: "line-a", revisionId: "revision-a",
    priceEntryId: "price-entry", scopeKey: "fixture", versionNumber: 1, vendorId: "vendor-a", uomId: "mode-uom",
    specificationId: null, modeId: null, taxRuleId: "tax-rule", taxVersionId: "tax-version", currency: "INR", treatment: "inclusive",
    inputAmountPaise: 1_050, baseAmountPaise: 1_000, taxAmountPaise: 50, totalAmountPaise: 1_050,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, status: "active", reviewRequired: false,
    version: 1, createdById: buyer.id, updatedById: buyer.id, createdAt: at, updatedAt: at });
}

async function seedProject() {
  const line = { id: "approved-line", source: "configuration", itemType: "main_line", catalogueId: "line-a",
    roomId: "room-a", roomName: "Living", specification: null, unit: "SQFT", rate: 500, ratePaise: 50_000,
    quantity: 2, included: true, amount: 1_000, amountPaise: 100_000,
    mainBasketId: "basket-a", mainBasketName: "Ceiling", subBasketId: "sub-a", subBasketName: "False Ceiling",
    mainLineId: "line-a", mainLineName: "POP", revisionId: "revision-a", sourceItemStatus: "active",
    sourceRevisionStatus: "active", sourceItemVersion: 1, sourceRevisionVersion: 2,
    uomId: "mode-uom", uomCode: "SQFT", uomDecimalScale: 2, uomName: "Square foot" };
  await ProjectModel.create({ _id: "mode-project", name: "Mode project", clientId: client.id, clientName: "Client",
    clientEmail: client.email, clientEmailNormalized: client.email, clientMobile: "9000000000", clientAddress: "Bengaluru",
    status: "active", location: "Bengaluru", plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00.000Z") });
  await EstimateModel.create({ _id: "mode-estimate", leadId: "mode-lead", ownerId: buyer.id, version: 2, status: "client_approved",
    propertyType: "villa", rooms: [], scopes: [], lineItems: [line], subtotal: 1_000, gst: 180, total: 1_180,
    approvalRequired: false, projectId: "mode-project", reviews: [{ actorId: buyer.id, action: "client_approved", note: "Approved", occurredAt: at }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: buyer.id,
    designPlanApprovalSource: "admin_proof", clientDecisionAt: at });
  await EstimateClientReviewRoundModel.create({ _id: "mode-round", estimateId: "mode-estimate", leadId: "mode-lead", projectId: null,
    estimateVersion: 1, sendGeneration: 1, dedupeKey: "d".repeat(64), recipientEmail: client.email,
    recipientEmailNormalized: client.email, estimateSnapshot: { clientName: "Client", projectName: "Mode project",
      location: "Bengaluru", propertyType: "villa", lineItems: [line], subtotal: 1_000, gst: 180, total: 1_180,
      subtotalPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "c".repeat(64),
    pdfStorageReference: "approved.pdf", deliveryStatus: "sent", deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1, deliveryAttemptedAt: at, deliveredAt: at, assignedAdminId: buyer.id,
    status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "Approved",
    decidedById: buyer.id, decidedAt: at, version: 2 });
}

async function seedSecondApprovedProject(): Promise<void> {
  const firstRound = await EstimateClientReviewRoundModel.findById("mode-round").lean();
  const firstLine = firstRound?.estimateSnapshot.lineItems[0];
  if (!firstLine) throw new Error("The first approved line fixture is missing.");
  const line = { ...firstLine, quantity: 3, amount: 1_500, amountPaise: 150_000 };
  await ProjectModel.create({ _id: "mode-project-b", name: "Mode project B", clientId: client.id, clientName: "Client",
    clientEmail: client.email, clientEmailNormalized: client.email, clientMobile: "9000000000", clientAddress: "Mumbai",
    status: "active", location: "Mumbai", plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00.000Z") });
  await EstimateModel.create({ _id: "mode-estimate-b", leadId: "mode-lead-b", ownerId: buyer.id, version: 2,
    status: "client_approved", propertyType: "villa", rooms: [], scopes: [], lineItems: [line],
    subtotal: 1_500, gst: 270, total: 1_770, approvalRequired: false, projectId: "mode-project-b",
    reviews: [{ actorId: buyer.id, action: "client_approved", note: "Approved", occurredAt: at }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: buyer.id,
    designPlanApprovalSource: "admin_proof", clientDecisionAt: at });
  await EstimateClientReviewRoundModel.create({ _id: "mode-round-b", estimateId: "mode-estimate-b",
    leadId: "mode-lead-b", projectId: null, estimateVersion: 1, sendGeneration: 1,
    dedupeKey: "e".repeat(64), recipientEmail: client.email, recipientEmailNormalized: client.email,
    estimateSnapshot: { clientName: "Client", projectName: "Mode project B", location: "Mumbai",
      propertyType: "villa", lineItems: [line], subtotal: 1_500, gst: 270, total: 1_770,
      subtotalPaise: 150_000, gstPaise: 27_000, totalPaise: 177_000,
      selectedMainBasketIds: ["basket-a"],
      selectedMainBasketClassifications: [{ mainBasketId: "basket-a", classification: "standard" }] },
    pdfFilename: "approved-b.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1,
    pdfSha256: "e".repeat(64), pdfStorageReference: "approved-b.pdf", deliveryStatus: "sent",
    deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: at, deliveredAt: at,
    assignedAdminId: buyer.id, status: "approved", decision: "approve", decisionSource: "admin_proof",
    decisionNote: "Approved", decidedById: buyer.id, decidedAt: at, version: 2 });
}

const source = { estimateId: "mode-estimate", estimateVersion: 1, estimateReviewRoundId: "mode-round",
  allLineItems: [{ key: "approved-line", included: true, source: "configuration" as const, amountPaise: 100_000,
    mainLineId: "line-a", revisionId: "revision-a", sourceRevisionStatus: "active" as const,
    sourceRevisionVersion: 2, uomId: "mode-uom", uomCode: "SQFT", uomDecimalScale: 2 }] };

async function changeSavedPmcRateWithoutTimestamp(baseRatePaise: number): Promise<string> {
  const before = await AiEstimatorKnowledgeSectionModel.findById("revision-a-advanced").lean();
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
    { $set: { "payload.modeCalculations.pmc.baseRatePaise": baseRatePaise } });
  const after = await AiEstimatorKnowledgeSectionModel.findById("revision-a-advanced").lean();
  expect(after?.updatedAt).toEqual(before?.updatedAt);
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
  return createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
    sections: sections.map((row) => ({ sectionKey: row.sectionKey,
      applicability: row.applicability, payload: row.payload })) });
}

async function changeSavedSubVendorRateWithoutTimestamp(baseRatePaise: number): Promise<string> {
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
    { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": baseRatePaise } });
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
  return createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
    sections: sections.map((row) => ({ sectionKey: row.sectionKey,
      applicability: row.applicability, payload: row.payload })) });
}

async function enableSavedSubVendorScope(): Promise<string> {
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
    { $set: { "payload.modeCalculations.sub_vendor": settings, "payload.subVendorMarginBps": 3_000 } });
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
    sections: sections.map((row) => ({ sectionKey: row.sectionKey,
      applicability: row.applicability, payload: row.payload })) });
  await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: { contentDigest } });
  return contentDigest;
}

async function configureProjectRateFixture(): Promise<void> {
  await enableSavedSubVendorScope();
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
    { $set: { "payload.modeCalculations.sub_vendor.baseRatePaise": 7_500,
      "payload.modeCalculations.sub_vendor.lowQuantityLimit": "1" } });
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
    sections: sections.map(row => ({ sectionKey: row.sectionKey,
      applicability: row.applicability, payload: row.payload })) });
  await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: { contentDigest } });
  await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
    "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
    "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }],
    "estimateSnapshot.lineItems.0.quantity": 1
  } });
}

async function saveCurrentDraft(advancedPayload: Record<string, unknown>, name = "Updated POP"): Promise<void> {
  const rows = sectionsFor("revision-b").map(row => row.sectionKey === "advanced"
    ? { ...row, payload: advancedPayload } : row);
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "revision-b", mainLineId: "line-a",
    revisionNumber: 2, status: "draft", contentDigest: null, version: 1, createdById: buyer.id,
    updatedById: buyer.id, createdAt: at, updatedAt: at });
  await AiEstimatorKnowledgeSectionModel.collection.insertMany(rows.map(row => ({ ...row, createdAt: at, updatedAt: at })));
  await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" },
    { $set: { draftRevisionId: "revision-b", name } });
}

async function activateCurrentDraft(): Promise<void> {
  const rows = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-b" }).lean();
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 2,
    sections: rows.map(row => ({ sectionKey: row.sectionKey, applicability: row.applicability, payload: row.payload })) });
  await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-b" },
    { $set: { status: "active", contentDigest, activatedAt: at, activatedById: buyer.id } });
  await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" },
    { $set: { status: "superseded", supersededAt: at, supersededById: buyer.id } });
  await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" },
    { $set: { activeRevisionId: "revision-b", draftRevisionId: null } });
}

function projectRateInput(basket: Awaited<ReturnType<ReturnType<typeof createProcurementBasketService>["get"]>>,
  baseRatePaise: number | null, expectedVersion: number, idempotencyKey: string) {
  return { sourceLineItemKey: "approved-line", baseRatePaise, expectedVersion,
    expectedEstimateSource: basket.estimateSource,
    expectedPreparationDigest: basket.preparationDigest, idempotencyKey };
}

describe("project-only Standard Main Basket Base amount", () => {
  it("saves, isolates, clears and recalculates a POP rate from pinned low-quantity settings", async () => {
    await configureProjectRateFixture();
    await seedSecondApprovedProject();
    const baskets = createProcurementBasketService();
    const first = await baskets.get(buyer, "mode-project", "basket-a");
    const otherBefore = await baskets.get(buyer, "mode-project-b", "basket-a");
    expect(first.lines[0]).toMatchObject({ baseUnitRatePaise: 7_500,
      projectRate: { version: 0, overridePaise: null },
      standardCost: { baseCostPaise: 7_500, adjustedCostPaise: 8_250 } });
    expect(first.standardCost?.totalPaise).toBe(8_250);
    const saved = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(first, 8_000, 0, "pop-project-rate-001"));
    expect(saved).toMatchObject({ projectId: "mode-project", mainBasketId: "basket-a",
      projectRate: { version: 1, overridePaise: 8_000 } });
    const updated = await baskets.get(buyer, "mode-project", "basket-a");
    expect(updated.lines[0]).toMatchObject({ mainLineName: "POP", approvedQuantity: "1", baseUnitRatePaise: 8_000,
      projectRate: { version: 1, overridePaise: 8_000 },
      standardCost: { baseCostPaise: 8_000, adjustedCostPaise: 8_800 } });
    expect(updated.standardCost?.totalPaise).toBe(8_800);
    expect(updated.preparationDigest).not.toBe(first.preparationDigest);
    const vendorLines = buildBasketBoqLines(updated, [{ sourceLineItemKey: "approved-line",
      description: "POP", quantityMilliUnits: 1_000, scopeType: "execution",
      targetDate: "2026-12-01", deliveryLocation: "Site" }]);
    expect(JSON.stringify(vendorLines)).not.toMatch(/baseRate|projectRate|overridePaise|standardCost/u);
    expect(await baskets.get(buyer, "mode-project-b", "basket-a")).toEqual(otherBefore);
    expect((await AiEstimatorKnowledgeSectionModel.findById("revision-a-advanced").lean())
      ?.payload.modeCalculations.sub_vendor.baseRatePaise).toBe(7_500);
    await expect(projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(first, 9_000, 1, "pop-project-rate-stale")))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    await expect(projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(updated, 9_000, 0, "pop-project-rate-version")))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_BASE_RATE_VERSION_CONFLICT" });
    const replay = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(first, 8_000, 0, "pop-project-rate-001"));
    expect(replay).toEqual(saved);
    await expect(projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(first, 9_000, 0, "pop-project-rate-001")))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    const zero = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(updated, 0, 1, "pop-project-rate-zero"));
    expect(zero.projectRate).toEqual({ version: 2, overridePaise: 0 });
    const atZero = await baskets.get(buyer, "mode-project", "basket-a");
    expect(atZero.lines[0]).toMatchObject({ baseUnitRatePaise: 0,
      standardCost: { baseCostPaise: 0, adjustedCostPaise: 0 } });
    const cleared = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(atZero, null, 2, "pop-project-rate-clear"));
    expect(cleared.projectRate).toEqual({ version: 3, overridePaise: null });
    const reset = await baskets.get(buyer, "mode-project", "basket-a");
    expect(reset.lines[0]).toMatchObject({ baseUnitRatePaise: 7_500,
      projectRate: { version: 3, overridePaise: null },
      standardCost: { adjustedCostPaise: 8_250 } });
    expect(reset.preparationDigest).not.toBe(first.preparationDigest);
    expect(await ProcurementBasketBaseRateModel.countDocuments({ projectId: "mode-project" })).toBe(1);
    expect(await ProcurementBasketBaseRateReceiptModel.countDocuments({ projectId: "mode-project" })).toBe(3);
  });

  it("rejects unauthorized, wrong source, and frozen award or issued baskets", async () => {
    await configureProjectRateFixture();
    const baskets = createProcurementBasketService();
    const first = await baskets.get(buyer, "mode-project", "basket-a");
    const fields = projectRateInput(first, 8_000, 0, "pop-rate-frozen-001");
    await expect(projectRates.save(other, "mode-project", "basket-a", fields))
      .rejects.toMatchObject({ status: 403 });
    await expect(projectRates.save(buyer, "mode-project", "basket-b", fields))
      .rejects.toMatchObject({ status: 404 });
    await expect(projectRates.save(buyer, "mode-project", "basket-a", {
      ...fields, sourceLineItemKey: "another-line", idempotencyKey: "pop-rate-wrong-line" }))
      .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_BASE_RATE_LINE_UNAVAILABLE" });
    for (const status of ["award_pending", "issued"]) {
      await ProcurementBasketEnquiryModel.collection.insertOne({ _id: `blocked-${status}`,
        projectId: "mode-project", mainBasketId: "basket-a", status,
        estimateSource: first.estimateSource });
      await expect(projectRates.save(buyer, "mode-project", "basket-a", {
        ...fields, idempotencyKey: `pop-rate-${status}` }))
        .rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_BASE_RATE_LOCKED" });
      await ProcurementBasketEnquiryModel.collection.deleteOne({ _id: `blocked-${status}` });
    }
    expect(await ProcurementBasketBaseRateModel.countDocuments()).toBe(0);
  });

  it("allows a new approved source to change its rate despite an older issued enquiry", async () => {
    await configureProjectRateFixture();
    const baskets = createProcurementBasketService();
    const current = await baskets.get(buyer, "mode-project", "basket-a");
    await ProcurementBasketEnquiryModel.collection.insertMany([
      { _id: "issued-previous-estimate", estimateSource: { ...current.estimateSource,
        estimateId: "previous-estimate" } },
      { _id: "issued-previous-version", estimateSource: { ...current.estimateSource,
        estimateVersion: current.estimateSource.estimateVersion + 1 } },
      { _id: "issued-previous-round", estimateSource: { ...current.estimateSource,
        estimateReviewRoundId: "previous-round" } }
    ].map(row => ({ ...row, projectId: "mode-project", mainBasketId: "basket-a", status: "issued",
      createIdempotencyKey: row._id })));
    const saved = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(current, 8_000, 0, "new-approval-project-rate"));
    expect(saved.projectRate).toEqual({ version: 1, overridePaise: 8_000 });
    expect((await baskets.get(buyer, "mode-project", "basket-a")).standardCost?.totalPaise).toBe(8_800);
  });

  it("serializes concurrent edits and rejects a missing pinned Sub-vendor scope", async () => {
    await configureProjectRateFixture();
    const baskets = createProcurementBasketService();
    const first = await baskets.get(buyer, "mode-project", "basket-a");
    const attempts = await Promise.allSettled([
      projectRates.save(buyer, "mode-project", "basket-a",
        projectRateInput(first, 8_000, 0, "pop-concurrent-rate-a")),
      projectRates.save(buyer, "mode-project", "basket-a",
        projectRateInput(first, 8_100, 0, "pop-concurrent-rate-b"))
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await ProcurementBasketBaseRateModel.countDocuments()).toBe(1);
    expect(await ProcurementBasketBaseRateReceiptModel.countDocuments()).toBe(1);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
      { $set: { "payload.modeCalculations.sub_vendor": null } });
    const unavailable = await baskets.get(buyer, "mode-project", "basket-a");
    expect(unavailable.boqReady).toBe(false);
    await expect(projectRates.save(buyer, "mode-project", "basket-a", {
      ...projectRateInput(unavailable, 9_000, 1, "pop-missing-subvendor"),
      expectedVersion: 1 })).rejects.toMatchObject({
      status: 409, code: "PROCUREMENT_BASKET_BASE_RATE_LINE_UNAVAILABLE" });
    expect(await ProcurementBasketBaseRateModel.countDocuments()).toBe(1);
  });
});

describe("current saved Configuration for Standard Main Baskets", () => {
  it("shows a same-ID UOM master name change without rewriting the approved unit", async () => {
    await configureProjectRateFixture();
    const baskets = createProcurementBasketService();
    const before = await baskets.get(buyer, "mode-project", "basket-a");
    expect(before.lines[0]).toMatchObject({ approvedUnit: "SQFT",
      mode: { uom: { id: "mode-uom", code: "SQFT", name: "Square foot" } } });
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "mode-uom" },
      { $set: { name: "Square foot updated" } });
    const after = await baskets.get(buyer, "mode-project", "basket-a");
    expect(after.lines[0]).toMatchObject({ approvedUnit: "SQFT",
      mode: { uom: { id: "mode-uom", code: "SQFT", name: "Square foot updated" } } });
    expect(after.preparationDigest).not.toBe(before.preparationDigest);
  });

  it("refreshes an active Main Line's saved draft in two projects while preserving a project override and BOQ activation gate", async () => {
    await configureProjectRateFixture();
    await seedSecondApprovedProject();
    const baskets = createProcurementBasketService();
    const original = await baskets.get(buyer, "mode-project", "basket-a");
    await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(original, 8_000, 0, "draft-shared-override-001"));
    const overridden = await baskets.get(buyer, "mode-project", "basket-a");
    const approvedEstimate = await EstimateModel.findById("mode-estimate").lean();
    await saveCurrentDraft({ ...advanced, modeCalculations: { ...advanced.modeCalculations,
      sub_vendor: { ...settings, baseRatePaise: 12_000, lowQuantityLimit: "3", impactBps: 2_000 } } });
    const first = await baskets.get(buyer, "mode-project", "basket-a");
    const second = await baskets.get(buyer, "mode-project-b", "basket-a");
    expect(first).toMatchObject({ boqReady: false, approvedEstimatePaise: 100_000,
      standardCost: { complete: true, totalPaise: 9_600 }, lines: [{ mainLineId: "line-a",
        mainLineName: "Updated POP", baseUnitRatePaise: 8_000,
        mode: { revision: { id: "revision-b", status: "draft" } } }] });
    expect(second).toMatchObject({ boqReady: false, approvedEstimatePaise: 150_000,
      standardCost: { complete: true, totalPaise: 43_200 }, lines: [{ mainLineName: "Updated POP",
        baseUnitRatePaise: 12_000 }] });
    expect(first.preparationDigest).not.toBe(overridden.preparationDigest);
    await expect(mongoose.connection.transaction(session => currentBasket("mode-project", "basket-a", session,
      overridden.preparationDigest))).rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-b-advanced" },
      { $set: { "payload.modeCalculations.sub_vendor.impactBps": 1_000 } });
    const savedAgain = await baskets.get(buyer, "mode-project", "basket-a");
    expect(savedAgain).toMatchObject({ boqReady: false, standardCost: { totalPaise: 8_800 } });
    expect(savedAgain.preparationDigest).not.toBe(first.preparationDigest);
    await activateCurrentDraft();
    const activated = await baskets.get(buyer, "mode-project", "basket-a");
    expect(activated).toMatchObject({ boqReady: true, standardCost: { totalPaise: 8_800 },
      lines: [{ mode: { revision: { id: "revision-b", status: "active" } } }] });
    expect(await EstimateModel.findById("mode-estimate").lean()).toEqual(approvedEstimate);
  });

  it("prices a draft-only Painting item after a section save and then its activation without changing the approved estimate", async () => {
    await configureProjectRateFixture();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.lineItems.0.sourceRevisionStatus": "draft",
      "estimateSnapshot.lineItems.0.sourceRevisionVersion": 2
    } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, { $set: {
      status: "draft", activeRevisionId: null, draftRevisionId: "revision-a"
    } });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: {
      status: "draft", version: 3, contentDigest: null, activatedAt: null, activatedById: null
    } });
    const approvedEstimate = await EstimateModel.findById("mode-estimate").lean();
    const baskets = createProcurementBasketService();
    const saved = await baskets.get(buyer, "mode-project", "basket-a");
    expect(saved).toMatchObject({ boqReady: false, standardCost: { complete: true, totalPaise: 8_250 },
      lines: [{ baseUnitRatePaise: 7_500, standardCost: { adjustedCostPaise: 8_250 },
        mode: { revision: { id: "revision-a", status: "draft", version: 3 } } }] });
    expect(saved.lines[0]?.standardCost?.issues).toEqual([]);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" }, { $set: {
      "payload.modeCalculations.sub_vendor.baseRatePaise": 9_000
    } });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: { version: 4 } });
    const revised = await baskets.get(buyer, "mode-project", "basket-a");
    expect(revised).toMatchObject({ standardCost: { complete: true, totalPaise: 9_900 },
      lines: [{ baseUnitRatePaise: 9_000, standardCost: { adjustedCostPaise: 9_900 } }] });
    expect(revised.preparationDigest).not.toBe(saved.preparationDigest);
    const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
    const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
      sections: sections.map(row => ({ sectionKey: row.sectionKey, applicability: row.applicability,
        payload: row.payload })) });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: {
      status: "active", version: 5, contentDigest, activatedAt: at, activatedById: buyer.id
    } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, { $set: {
      status: "active", activeRevisionId: "revision-a", draftRevisionId: null
    } });
    const activated = await baskets.get(buyer, "mode-project", "basket-a");
    expect(activated).toMatchObject({ boqReady: true, standardCost: { totalPaise: 9_900 },
      lines: [{ baseUnitRatePaise: 9_000, mode: { revision: { id: "revision-a", status: "active" } } }] });
    expect(activated.preparationDigest).not.toBe(revised.preparationDigest);
    expect(await EstimateModel.findById("mode-estimate").lean()).toEqual(approvedEstimate);
  });

  it("saves and clears a project Base amount for calculable draft Painting while BOQ stays blocked", async () => {
    await configureProjectRateFixture();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.lineItems.0.sourceRevisionStatus": "draft",
      "estimateSnapshot.lineItems.0.sourceRevisionVersion": 2
    } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, { $set: {
      status: "draft", activeRevisionId: null, draftRevisionId: "revision-a"
    } });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: {
      status: "draft", version: 3, contentDigest: null, activatedAt: null, activatedById: null
    } });
    const baskets = createProcurementBasketService();
    const initial = await baskets.get(buyer, "mode-project", "basket-a");
    expect(initial).toMatchObject({ boqReady: false, standardCost: { totalPaise: 8_250 },
      lines: [{ baseUnitRatePaise: 7_500 }] });
    const saved = await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(initial, 8_000, 0, "painting-draft-rate-001"));
    expect(saved.projectRate).toEqual({ version: 1, overridePaise: 8_000 });
    const overridden = await baskets.get(buyer, "mode-project", "basket-a");
    expect(overridden).toMatchObject({ boqReady: false, standardCost: { totalPaise: 8_800 },
      lines: [{ baseUnitRatePaise: 8_000, standardCost: { adjustedCostPaise: 8_800 } }] });
    expect(() => buildBasketBoqLines(overridden, [{ sourceLineItemKey: "approved-line",
      description: "Painting", quantityMilliUnits: 1_000, scopeType: "execution",
      targetDate: "2026-12-01", deliveryLocation: "Site" }]))
      .toThrowError(expect.objectContaining({ code: "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" }));
    await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(overridden, null, 1, "painting-draft-rate-clear-001"));
    const cleared = await baskets.get(buyer, "mode-project", "basket-a");
    expect(cleared).toMatchObject({ boqReady: false, standardCost: { totalPaise: 8_250 },
      lines: [{ baseUnitRatePaise: 7_500 }] });
    expect((await AiEstimatorKnowledgeSectionModel.findById("revision-a-advanced").lean())
      ?.payload.modeCalculations.sub_vendor.baseRatePaise).toBe(7_500);
    expect(await ProcurementBasketBaseRateReceiptModel.countDocuments({ projectId: "mode-project" })).toBe(2);
  });

  it("uses a newer active revision, keeps a project-only override, and rejects stale BOQ preparation", async () => {
    await configureProjectRateFixture();
    await seedSecondApprovedProject();
    const baskets = createProcurementBasketService();
    const original = await baskets.get(buyer, "mode-project", "basket-a");
    await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(original, 8_000, 0, "painting-override-001"));
    const overridden = await baskets.get(buyer, "mode-project", "basket-a");
    const approvedEstimate = await EstimateModel.findById("mode-estimate").lean();
    const otherEstimate = await EstimateModel.findById("mode-estimate-b").lean();
    const newSections = sectionsFor("revision-b").map(row => row.sectionKey === "advanced"
      ? { ...row, payload: { ...advanced, modeCalculations: { ...advanced.modeCalculations,
        sub_vendor: { ...settings, baseRatePaise: 12_000, impactBps: 2_000, lowQuantityLimit: "1" } } } }
      : row);
    const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 2,
      sections: newSections.map(row => ({ sectionKey: row.sectionKey as typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS[number],
        applicability: row.applicability as "configured" | "not_configured", payload: row.payload })) });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "revision-b", mainLineId: "line-a",
      revisionNumber: 2, status: "active", contentDigest, version: 2, createdById: buyer.id,
      updatedById: buyer.id, activatedAt: at, activatedById: buyer.id, createdAt: at, updatedAt: at });
    await AiEstimatorKnowledgeSectionModel.collection.insertMany(newSections.map(row => ({ ...row,
      createdAt: at, updatedAt: at })));
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: {
      status: "superseded", version: 3, supersededAt: at, supersededById: buyer.id
    } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, { $set: {
      activeRevisionId: "revision-b", version: 2
    } });
    const current = await baskets.get(buyer, "mode-project", "basket-a");
    const other = await baskets.get(buyer, "mode-project-b", "basket-a");
    expect(current).toMatchObject({ approvedEstimatePaise: 100_000, boqReady: true,
      standardCost: { complete: true, totalPaise: 9_600 }, lines: [{ baseUnitRatePaise: 8_000,
        standardCost: { adjustedCostPaise: 9_600 }, mode: { revision: { id: "revision-b" } } }] });
    expect(other).toMatchObject({ approvedEstimatePaise: 150_000,
      standardCost: { totalPaise: 36_000 }, lines: [{ baseUnitRatePaise: 12_000,
        mode: { revision: { id: "revision-b" } } }] });
    expect(current.preparationDigest).not.toBe(overridden.preparationDigest);
    await expect(mongoose.connection.transaction(session => currentBasket("mode-project", "basket-a", session,
      overridden.preparationDigest))).rejects.toMatchObject({ status: 409, code: "PROCUREMENT_BASKET_SOURCE_CHANGED" });
    await projectRates.save(buyer, "mode-project", "basket-a",
      projectRateInput(current, null, 1, "painting-override-clear-001"));
    const cleared = await baskets.get(buyer, "mode-project", "basket-a");
    expect(cleared).toMatchObject({ standardCost: { totalPaise: 14_400 },
      lines: [{ baseUnitRatePaise: 12_000, standardCost: { adjustedCostPaise: 14_400 } }] });
    const currentEstimate = await EstimateModel.findById("mode-estimate").lean();
    expect(currentEstimate).toMatchObject({ lineItems: approvedEstimate!.lineItems,
      subtotal: approvedEstimate!.subtotal, gst: approvedEstimate!.gst,
      total: approvedEstimate!.total });
    expect(await EstimateModel.findById("mode-estimate-b").lean()).toEqual(otherEstimate);
  });

  it("does not use another Configuration item or an incompatible current UOM", async () => {
    await configureProjectRateFixture();
    const baskets = createProcurementBasketService();
    await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: "line-other", basketId: "basket-other",
      subBasketId: "sub-other", name: "POP", nameNormalized: "pop", displayOrder: 1, status: "active",
      activeRevisionId: "revision-other", draftRevisionId: null, version: 1, createdById: buyer.id,
      updatedById: buyer.id, createdAt: at, updatedAt: at });
    await AiEstimatorKnowledgeMainLineModel.collection.deleteOne({ _id: "line-a" });
    const missing = await baskets.get(buyer, "mode-project", "basket-a");
    expect(missing).toMatchObject({ boqReady: false, standardCost: { complete: false },
      lines: [{ baseUnitRatePaise: null, standardCost: { issues: [{ code: "CONFIGURATION_ITEM_UNAVAILABLE" }] } }] });
    await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: "line-a", basketId: "basket-a",
      subBasketId: "sub-a", name: "POP", nameNormalized: "pop", displayOrder: 1, status: "active",
      activeRevisionId: "revision-a", draftRevisionId: null, version: 1, createdById: buyer.id,
      updatedById: buyer.id, createdAt: at, updatedAt: at });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-overview" }, { $set: {
      "payload.uomId": "another-uom"
    } });
    const incompatible = await baskets.get(buyer, "mode-project", "basket-a");
    expect(incompatible).toMatchObject({ boqReady: false, standardCost: { complete: false },
      lines: [{ baseUnitRatePaise: null, standardCost: { issues: [{ code: "CONFIGURATION_UOM_CHANGED" }] } }] });
  });
});

describe("pinned mode resolution and price references", () => {
  it("isolates provisional Standard costs and saved decisions across unequal projects with shared basket and line IDs", async () => {
    const revisionDigest = await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    await seedSecondApprovedProject();
    const basketService = createProcurementBasketService();
    const estimateA = await EstimateModel.findById("mode-estimate").lean();
    const estimateB = await EstimateModel.findById("mode-estimate-b").lean();
    const beforeA = await basketService.get(buyer, "mode-project", "basket-a");
    const beforeB = await basketService.get(buyer, "mode-project-b", "basket-a");
    expect(beforeA).toMatchObject({ approvedEstimatePaise: 100_000, automaticSubVendor: true, boqReady: true, readyLineCount: 0,
      workingTotalPaise: 0, workingTotalComplete: false,
      standardCost: { totalPaise: 22_000, complete: true, provisional: true },
      lines: [{ sourceLineItemKey: "approved-line", approvedQuantity: "2",
        mode: { state: "selection_required", decision: null, preview: null } }] });
    expect(beforeB).toMatchObject({ approvedEstimatePaise: 150_000, automaticSubVendor: true, boqReady: true, readyLineCount: 0,
      workingTotalPaise: 0, workingTotalComplete: false,
      standardCost: { totalPaise: 30_000, complete: true, provisional: true },
      lines: [{ sourceLineItemKey: "approved-line", approvedQuantity: "3",
        mode: { state: "selection_required", decision: null, preview: null } }] });
    expect(beforeA.standardCost!.totalPaise).not.toBe(beforeB.standardCost!.totalPaise);

    await service.save(buyer, "mode-project", { sourceLineItemKey: "approved-line", expectedVersion: 0,
      expectedEstimateSource, expectedRevisionDigest: revisionDigest, idempotencyKey: "project-a-pmc-mode-001",
      mode: "pmc", quantity: "4", discountBps: 0, markupBasis: "starting", exceptionReason: null });
    const afterA = await basketService.get(buyer, "mode-project", "basket-a");
    const afterB = await basketService.get(buyer, "mode-project-b", "basket-a");
    expect(afterA).toMatchObject({ approvedEstimatePaise: 100_000, automaticSubVendor: true, boqReady: true, readyLineCount: 1,
      workingTotalComplete: true, standardCost: { totalPaise: 22_000, complete: true, provisional: true },
      lines: [{ standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2" } }] });
    expect(afterA.workingTotalPaise).toBeGreaterThan(afterA.standardCost!.totalPaise!);
    expect(afterA.preparationDigest).toBe(beforeA.preparationDigest);
    expect(afterB).toMatchObject({ approvedEstimatePaise: 150_000, readyLineCount: 0,
      workingTotalPaise: 0, workingTotalComplete: false,
      standardCost: { totalPaise: 30_000, complete: true, provisional: true },
      lines: [{ standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "3" } }] });
    expect(afterB.preparationDigest).toBe(beforeB.preparationDigest);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments({ projectId: "mode-project-b" })).toBe(0);
    expect(await EstimateModel.findById("mode-estimate").lean()).toMatchObject({
      subtotal: estimateA!.subtotal, gst: estimateA!.gst, total: estimateA!.total,
      lineItems: estimateA!.lineItems, procurementSourceEpoch: 1 });
    expect(await EstimateModel.findById("mode-estimate-b").lean()).toEqual(estimateB);
  });
  it("keeps explicitly Standard on approved Sub-vendor cost despite an older saved PMC mode", async () => {
    const revisionDigest = await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    const basketService = createProcurementBasketService();
    const beforeRevision = await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean();
    const beforeSections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean();
    const first = await basketService.get(buyer, "mode-project", "basket-a");
    expect(first).toMatchObject({ classification: "standard", automaticSubVendor: true, boqReady: true,
      includedLineCount: 1, readyLineCount: 0,
      workingTotalComplete: false, standardCost: { complete: true, provisional: true,
        pricedLineCount: 1, totalPaise: 22_000 },
      lines: [{ mode: { state: "selection_required", decision: null, preview: null },
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 10_000 }],
          baseCostPaise: 20_000, adjustedCostPaise: 22_000 } }] });
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean()).toEqual(beforeRevision);
    expect(await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()).toEqual(beforeSections);

    await service.save(buyer, "mode-project", { sourceLineItemKey: "approved-line", expectedVersion: 0,
      expectedEstimateSource, expectedRevisionDigest: revisionDigest, idempotencyKey: "saved-pmc-override-001",
      mode: "pmc", quantity: "3", discountBps: 0, markupBasis: "starting", exceptionReason: null });
    const saved = await basketService.get(buyer, "mode-project", "basket-a");
    expect(saved).toMatchObject({ classification: "standard", automaticSubVendor: true, boqReady: true, readyLineCount: 1,
      standardCost: { complete: true, provisional: true, totalPaise: 22_000 },
      lines: [{ approvedQuantity: "2", mode: { state: "ready", decision: { mode: "pmc", quantity: "3" } },
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 10_000 }],
          baseCostPaise: 20_000, adjustedCostPaise: 22_000 } }] });
    expect(saved.preparationDigest).toBe(first.preparationDigest);

    await changeSavedPmcRateWithoutTimestamp(12_500);
    const stale = await basketService.get(buyer, "mode-project", "basket-a");
    expect(stale).toMatchObject({ automaticSubVendor: true, boqReady: true,
      standardCost: { complete: true, provisional: true, totalPaise: 22_000, pricedLineCount: 1 },
      lines: [{ standardCost: {
        state: "observed_unverified", mode: "sub_vendor", baseCostPaise: 20_000, adjustedCostPaise: 22_000,
        issues: [{ code: "PINNED_DIGEST_MISMATCH" }] } }] });
    expect(stale.preparationDigest).not.toBe(saved.preparationDigest);
  });

  it("uses the observed pinned Sub-vendor cost through the BOQ gate after digest drift", async () => {
    const activatedDigest = await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    const observedDigest = await changeSavedSubVendorRateWithoutTimestamp(12_500);
    expect(observedDigest).not.toBe(activatedDigest);
    const basket = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(basket).toMatchObject({ classification: "standard", automaticSubVendor: true, boqReady: true, readyLineCount: 0,
      workingTotalComplete: false, standardCost: { totalPaise: 27_500, complete: true,
        provisional: true, pricedLineCount: 1 },
      lines: [{ baseUnitRatePaise: 12_500,
        mode: { state: "unavailable", decision: null, preview: null,
        issues: [{ code: "PINNED_DIGEST_MISMATCH" }],
        integrity: { status: "mismatch", activatedDigest, observedDigest } },
      standardCost: { state: "observed_unverified", mode: "sub_vendor", calculationQuantity: "2",
        baseRates: [{ scope: "sub_vendor", ratePaise: 12_500 }],
        baseCostPaise: 25_000, adjustedCostPaise: 27_500,
        issues: [{ code: "PINNED_DIGEST_MISMATCH" }] } }] });
    expect(basket.lines[0]?.standardCost?.issues).toHaveLength(1);
    const boqLines = buildBasketBoqLines(basket, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }]);
    expect(boqLines[0]).toMatchObject({ sourceLineItemKey: "approved-line", uomId: "mode-uom", uomCode: "SQFT" });
    expect(boqLines[0]).not.toHaveProperty("baseCostPaise");
    expect(boqLines[0]).not.toHaveProperty("adjustedCostPaise");
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("keeps Standard cost visible without any selling mode margin, including after observed Configuration drift", async () => {
    await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" }, {
      $set: { "payload.modeCalculations.pmc": null }, $unset: { "payload.subVendorMarginBps": "" }
    });
    const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
    const activatedDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
      sections: sections.map((row) => ({ sectionKey: row.sectionKey,
        applicability: row.applicability, payload: row.payload })) });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" },
      { $set: { contentDigest: activatedDigest } });
    const baskets = createProcurementBasketService();
    const saved = await baskets.get(buyer, "mode-project", "basket-a");
    expect(saved).toMatchObject({ readyLineCount: 0, workingTotalComplete: false,
      standardCost: { totalPaise: 22_000, complete: true, provisional: true },
      lines: [{ baseUnitRatePaise: 10_000,
        mode: { state: "unavailable", decision: null, preview: null },
        standardCost: { state: "suggested", baseCostPaise: 20_000, adjustedCostPaise: 22_000 } }] });

    const observedDigest = await changeSavedSubVendorRateWithoutTimestamp(12_500);
    const observed = await baskets.get(buyer, "mode-project", "basket-a");
    expect(observed).toMatchObject({ readyLineCount: 0, workingTotalComplete: false,
      standardCost: { totalPaise: 27_500, complete: true, provisional: true },
      lines: [{ baseUnitRatePaise: 12_500,
        mode: { state: "unavailable", decision: null, preview: null,
        integrity: { status: "mismatch", activatedDigest, observedDigest } },
        standardCost: { state: "observed_unverified", baseCostPaise: 25_000,
          adjustedCostPaise: 27_500, issues: [{ code: "PINNED_DIGEST_MISMATCH" }] } }] });
    expect(observed.boqReady).toBe(true);
    expect(() => buildBasketBoqLines(observed, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).not.toThrow();
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
  });

  it("does not invent a Standard cost when mismatched pinned Configuration has no Sub-Vendor settings", async () => {
    await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
      { $set: { "payload.modeCalculations.sub_vendor": null } });
    const basket = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(basket).toMatchObject({ readyLineCount: 0, standardCost: { totalPaise: null,
      complete: false, provisional: false, pricedLineCount: 0 },
      lines: [{ baseUnitRatePaise: null,
        mode: { state: "unavailable", preview: null }, standardCost: {
        state: "unavailable", baseCostPaise: null, adjustedCostPaise: null,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED" }, { code: "PINNED_DIGEST_MISMATCH" }] } }] });
    expect(basket.boqReady).toBe(false);
    expect(() => buildBasketBoqLines(basket, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).toThrowError(expect.objectContaining({ code: "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" }));
  });

  it("prices a one-unit POP line at ₹75 plus the saved 10% low-quantity impact without a mode decision", async () => {
    await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }],
      "estimateSnapshot.lineItems.0.quantity": 1
    } });
    const before = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    const observedDigest = await changeSavedSubVendorRateWithoutTimestamp(7_500);
    const after = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(after).toMatchObject({ automaticSubVendor: true, boqReady: true,
      standardCost: { totalPaise: 8_250, complete: true },
      lines: [{ mainLineName: "POP", approvedQuantity: "1", baseUnitRatePaise: 7_500,
        mode: { state: "unavailable", decision: null, integrity: { observedDigest } },
        standardCost: { state: "observed_unverified", calculationQuantity: "1",
          baseCostPaise: 7_500, adjustedCostPaise: 8_250 } }] });
    expect(after.preparationDigest).not.toBe(before.preparationDigest);
    expect(buildBasketBoqLines(after, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 1_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).toHaveLength(1);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
  });

  it("keeps a valid zero Sub-vendor base rate orderable when the approved estimate amount is positive", async () => {
    await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "standard" }]
    } });
    await changeSavedSubVendorRateWithoutTimestamp(0);
    const basket = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(basket).toMatchObject({ approvedEstimatePaise: 100_000, automaticSubVendor: true, boqReady: true,
      standardCost: { totalPaise: 0, complete: true, pricedLineCount: 1 },
      lines: [{ baseUnitRatePaise: 0, standardCost: { state: "observed_unverified",
        mode: "sub_vendor", baseCostPaise: 0, adjustedCostPaise: 0 } }] });
    expect(buildBasketBoqLines(basket, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).toHaveLength(1);
  });

  it("keeps an unclassified historical basket on its manual BOQ mode gate", async () => {
    await enableSavedSubVendorScope();
    const basket = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(basket).toMatchObject({ classification: "standard", automaticSubVendor: false, boqReady: false,
      standardCost: { complete: true }, lines: [{ mode: { state: "selection_required" } }] });
    expect(() => buildBasketBoqLines(basket, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).toThrowError(expect.objectContaining({ code: "PROCUREMENT_BASKET_MODE_REQUIRED" }));
  });

  it("keeps a Special Main Basket on explicit selection even with valid Sub-Vendor settings", async () => {
    await enableSavedSubVendorScope();
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "special" }]
    } });
    const basket = await createProcurementBasketService().get(buyer, "mode-project", "basket-a");
    expect(basket).toMatchObject({ classification: "special", automaticSubVendor: false, boqReady: false,
      standardCost: null,
      lines: [{ mode: { state: "selection_required", decision: null, preview: null }, standardCost: null }] });
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
  });
  it("recalculates a saved Special mode from an active item's new draft without changing its project choice", async () => {
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "mode-round" }, { $set: {
      "estimateSnapshot.selectedMainBasketIds": ["basket-a"],
      "estimateSnapshot.selectedMainBasketClassifications": [{ mainBasketId: "basket-a", classification: "special" }]
    } });
    const saved = await service.save(buyer, "mode-project", {
      sourceLineItemKey: "approved-line", expectedVersion: 0, idempotencyKey: "special-draft-mode-001",
      expectedEstimateSource, expectedRevisionDigest: approvedRevisionDigest,
      mode: "pmc", quantity: "2", discountBps: 500, markupBasis: "minimum", exceptionReason: null
    });
    const baskets = createProcurementBasketService();
    const original = await baskets.get(buyer, "mode-project", "basket-a");
    expect(original.boqReady).toBe(true);
    await saveCurrentDraft({ ...advanced, modeCalculations: { ...advanced.modeCalculations,
      pmc: { ...settings, baseRatePaise: 15_000, lowQuantityLimit: "2", impactBps: 2_000 } } });
    const draft = await baskets.get(buyer, "mode-project", "basket-a");
    expect(draft).toMatchObject({ classification: "special", boqReady: false,
      approvedEstimatePaise: 100_000, workingTotalComplete: true,
      lines: [{ mainLineName: "Updated POP", baseUnitRatePaise: 15_000,
        mode: { state: "ready", decision: { id: saved.id, version: 1, mode: "pmc",
          quantity: "2", discountBps: 500, markupBasis: "minimum" },
        revision: { id: "revision-b", status: "draft" },
        preview: { mode: "pmc", quantity: "2", baseCostPaise: 30_000,
          adjustedCostPaise: 36_000, discountBps: 500 } } }] });
    expect(draft.preparationDigest).not.toBe(original.preparationDigest);
    expect(() => buildBasketBoqLines(draft, [{ sourceLineItemKey: "approved-line", description: "POP",
      quantityMilliUnits: 2_000, scopeType: "execution", targetDate: "2026-12-01",
      deliveryLocation: "Site" }])).toThrowError(expect.objectContaining({ code: "PROCUREMENT_BASKET_MODE_REQUIRED" }));
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-b-advanced" },
      { $set: { "payload.modeCalculations.pmc": null } });
    const incomplete = await baskets.get(buyer, "mode-project", "basket-a");
    expect(incomplete).toMatchObject({ boqReady: false,
      lines: [{ baseUnitRatePaise: null, mode: { state: "unavailable", preview: null,
        revision: { id: "revision-b", status: "draft" }, issues: [{ code: "MODE_NOT_CONFIGURED" }] } }] });
    expect(incomplete.preparationDigest).not.toBe(draft.preparationDigest);
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-b-advanced" },
      { $set: { "payload.modeCalculations.pmc": { ...settings, baseRatePaise: 15_000,
        lowQuantityLimit: "2", impactBps: 2_000 } } });
    await activateCurrentDraft();
    const activated = await baskets.get(buyer, "mode-project", "basket-a");
    expect(activated).toMatchObject({ boqReady: true,
      lines: [{ mode: { decision: { id: saved.id, version: 1 },
        revision: { id: "revision-b", status: "active" },
        preview: { baseCostPaise: 30_000, adjustedCostPaise: 36_000 } } }] });
    expect(activated.preparationDigest).not.toBe(draft.preparationDigest);
  });
  it("resolves the exact revision, normalizes inclusive vendor price, and leaves Configuration untouched", async () => {
    const before = await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean();
    const result = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session, {
      at, children: [{ id: "child-a", sourceLineItemKey: "approved-line", vendorId: "vendor-a", uomId: "mode-uom" }],
      proposals: new Map([["approved-line", { mode: "pmc" as const, quantity: "2", discountBps: 0,
        markupBasis: "starting" as const, exceptionReason: null }]])
    }));
    expect(result.get("approved-line")).toMatchObject({ state: "ready", options: [{ key: "pmc" }],
      preview: { adjustedCostPaise: 22_000, sellingPaise: expect.any(Number) },
      priceReferences: { "child-a": { state: "ready", priceVersionId: "price-version", taxVersionId: "tax-version",
        unitPricePaise: 1_000, gstBasisPoints: 500, treatment: "inclusive" } } });
    expect(await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean()).toEqual(before);
  });

  it("uses current Configuration despite old snapshot revision fields, but blocks altered active content and UOM scale", async () => {
    const withLine = (overrides: Record<string, unknown>) => ({ ...source, allLineItems: [{ ...source.allLineItems[0]!, ...overrides }] });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "revision-draft", mainLineId: "line-a", revisionNumber: 2,
      status: "draft", contentDigest: null, version: 3, createdById: buyer.id, updatedById: buyer.id,
      createdAt: at, updatedAt: at });
    const draft = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project",
      withLine({ revisionId: "revision-draft", sourceRevisionStatus: "draft", sourceRevisionVersion: 2 }), session));
    expect(draft.get("approved-line")).toMatchObject({ state: "selection_required",
      revision: { id: "revision-a", status: "active" } });
    const missing = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project",
      withLine({ revisionId: "missing" }), session));
    expect(missing.get("approved-line")).toMatchObject({ state: "selection_required",
      revision: { id: "revision-a", status: "active" } });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
      { $set: { "payload.pmcMarginBps": 1_700 } });
    const altered = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(altered.get("approved-line")?.issues[0]?.code).toBe("PINNED_DIGEST_MISMATCH");
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "mode-uom" }, { $set: { decimalScale: 3 } });
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
      { $set: { "payload.pmcMarginBps": 1_500 } });
    const changedUom = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(changedUom.get("approved-line")?.issues[0]?.code).toBe("PINNED_UOM_CHANGED");
  });

  it("does not treat expired prices or inactive tax versions as a usable vendor rate", async () => {
    await AiEstimatorKnowledgePriceVersionModel.collection.updateOne({ _id: "price-version" },
      { $set: { effectiveTo: new Date("2026-09-01T00:00:00.000Z") } });
    const children = [{ id: "child-a", sourceLineItemKey: "approved-line", vendorId: "vendor-a", uomId: "mode-uom" }];
    const expired = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session, { at, children }));
    expect(expired.get("approved-line")?.priceReferences["child-a"]?.issues[0]?.code).toBe("PRICE_NOT_EFFECTIVE");
    await AiEstimatorKnowledgePriceVersionModel.collection.updateOne({ _id: "price-version" }, { $set: { effectiveTo: null } });
    await AiEstimatorKnowledgeTaxVersionModel.collection.updateOne({ _id: "tax-version" }, { $set: { status: "inactive" } });
    const tax = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session, { at, children }));
    expect(tax.get("approved-line")?.priceReferences["child-a"]?.issues[0]?.code).toBe("TAX_NOT_EFFECTIVE");
  });

  it("names a scoped price whose specification identity is absent from the procurement child", async () => {
    await AiEstimatorKnowledgePriceVersionModel.collection.updateOne({ _id: "price-version" },
      { $set: { specificationId: "specification-a" } });
    const result = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session, {
      at, children: [{ id: "child-a", sourceLineItemKey: "approved-line", vendorId: "vendor-a", uomId: "mode-uom" }]
    }));
    expect(result.get("approved-line")?.priceReferences["child-a"]).toMatchObject({
      state: "unavailable", issues: [{ code: "PRICE_SCOPE_UNRESOLVED" }]
    });
  });

  it("marks a pinned revision with no configured mode as unavailable for a documented exception", async () => {
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "revision-a-advanced" },
      { $set: { payload: { modeCalculations: { pmc: null, sub_vendor: null,
        in_house_labor: null, in_house_material: null }, pmcMarginBps: null, subVendorMarginBps: null } } });
    const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).lean();
    const contentDigest = createKnowledgeRevisionDigest({ mainLineId: "line-a", revisionNumber: 1,
      sections: sections.map((row) => ({ sectionKey: row.sectionKey,
        applicability: row.applicability, payload: row.payload })) });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" }, { $set: { contentDigest } });
    const result = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(result.get("approved-line")).toMatchObject({ state: "unavailable", options: [] });
  });
});

describe("read-only procurement mode preview", () => {
  const previewInput = { estimateSource: { estimateId: "mode-estimate", estimateVersion: 1,
    estimateReviewRoundId: "mode-round" }, sourceLineItemKey: "approved-line", expectedVersion: 0,
    mode: "pmc" as const, quantity: "2", discountBps: 0, markupBasis: "starting" as const };

  it("uses the pinned revision and leaves estimate, decisions, audit and Configuration untouched", async () => {
    const before = await Promise.all([
      EstimateModel.findById("mode-estimate").lean(),
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ]);
    const result = await service.preview(buyer, "mode-project", previewInput);
    expect(result).toMatchObject({ projectId: "mode-project", estimateSource: previewInput.estimateSource,
      sourceLineItemKey: "approved-line", decisionVersion: 0, revision: { id: "revision-a" },
      uom: { id: "mode-uom", code: "SQFT", decimalScale: 2 },
      preview: { mode: "pmc", quantity: "2", baseCostPaise: 20_000,
        adjustedCostPaise: 22_000, sellingPaise: expect.any(Number) },
      scopes: [{ scope: "pmc", baseRatePaise: 10_000, baseSubtotalPaise: 20_000,
        lowQuantityLimit: "2", configuredImpactBps: 1_000, thresholdMet: true,
        appliedImpactBps: 1_000, adjustedUnitRatePaise: 11_000, adjustedCostPaise: 22_000,
        lowQuantityImpactPaise: 2_000, marginBps: 1_500,
        sellingPaise: expect.any(Number) }], issues: [] });
    expect(result.scopes[0]!.sellingPaise).toBe(result.preview?.sellingPaise);
    expect(await Promise.all([
      EstimateModel.findById("mode-estimate").lean(),
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ])).toEqual(before);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("returns line issues without a provisional amount and rejects stale source or decision versions", async () => {
    const invalid = await service.preview(buyer, "mode-project", { ...previewInput, quantity: "2.001" });
    expect(invalid).toMatchObject({ preview: null, scopes: [],
      issues: [{ code: "INVALID_QUANTITY_PRECISION" }] });
    await expect(service.preview(buyer, "mode-project", { ...previewInput,
      estimateSource: { ...previewInput.estimateSource, estimateReviewRoundId: "old-round" } }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_SOURCE_CONFLICT" });
    await expect(service.preview(buyer, "mode-project", { ...previewInput, expectedVersion: 1 }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_VERSION_CONFLICT" });
    await expect(service.preview(other, "mode-project", previewInput)).rejects.toMatchObject({ status: 403 });
    await expect(service.preview(client, "mode-project", previewInput)).rejects.toMatchObject({ status: 403 });
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
});

describe("explicit unverified saved-value recovery", () => {
  const previewInput = { estimateSource: expectedEstimateSource, sourceLineItemKey: "approved-line",
    expectedVersion: 0, mode: "pmc" as const, quantity: "2", discountBps: 0, markupBasis: "starting" as const };
  const saveInput = { sourceLineItemKey: "approved-line", expectedVersion: 0,
    expectedEstimateSource, expectedRevisionDigest: approvedRevisionDigest,
    idempotencyKey: "recovery-decision-0001", mode: "pmc" as const, quantity: "2",
    discountBps: 0, markupBasis: "starting" as const, exceptionReason: null };

  it("exposes current mode candidates without making a raw rate change orderable", async () => {
    const observedDigest = await changeSavedPmcRateWithoutTimestamp(12_500);
    expect(observedDigest).not.toBe(approvedRevisionDigest);
    const before = await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ]);
    const modes = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(modes.get("approved-line")).toMatchObject({ state: "unavailable", options: [], preview: null,
      issues: [{ code: "PINNED_DIGEST_MISMATCH" }], revision: { contentDigest: approvedRevisionDigest },
      integrity: { status: "mismatch", activatedDigest: approvedRevisionDigest, observedDigest,
        candidateAvailability: expect.arrayContaining([{ key: "pmc", label: "PMC", available: true, issues: [] }]) } });
    await expect(service.preview(buyer, "mode-project", previewInput))
      .rejects.toMatchObject({ status: 422, code: "PURCHASE_ORDER_MODE_RECOVERY_REQUIRED" });
    await expect(service.preview(buyer, "mode-project", { ...previewInput, expectedObservedDigest: "0".repeat(64) }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_OBSERVED_DIGEST_CONFLICT" });
    const preview = await service.preview(buyer, "mode-project", { ...previewInput, expectedObservedDigest: observedDigest });
    expect(preview).toMatchObject({ integrity: { status: "mismatch", activatedDigest: approvedRevisionDigest,
      observedDigest }, preview: { mode: "pmc", baseCostPaise: 25_000, adjustedCostPaise: 27_500 },
      scopes: [{ scope: "pmc", baseRatePaise: 12_500 }], issues: [] });
    expect(await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ])).toEqual(before);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it("pins both digests with reason, actor, CAS and idempotency, then blocks later drift", async () => {
    const observedDigest = await changeSavedPmcRateWithoutTimestamp(12_500);
    const recovery = { expectedObservedDigest: observedDigest,
      reason: "Buyer reviewed the currently saved PMC calculation.", acknowledge: true as const };
    await expect(service.save(buyer, "mode-project", saveInput))
      .rejects.toMatchObject({ status: 422, code: "PURCHASE_ORDER_MODE_RECOVERY_REQUIRED" });
    await expect(service.save(buyer, "mode-project", { ...saveInput, recovery: { ...recovery,
      expectedObservedDigest: "0".repeat(64) } }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_OBSERVED_DIGEST_CONFLICT" });
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    const configurationBefore = await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ]);
    const first = await service.save(buyer, "mode-project", { ...saveInput, recovery });
    expect(first).toMatchObject({ mode: "pmc", version: 1, revisionDigest: approvedRevisionDigest,
      integrityBasis: { kind: "observed_unverified", activatedDigest: approvedRevisionDigest,
        observedDigest, reason: recovery.reason, actorId: buyer.id, acknowledgedAt: at.toISOString() } });
    expect(await service.save(buyer, "mode-project", { ...saveInput, recovery })).toEqual(first);
    await expect(service.save(buyer, "mode-project", { ...saveInput, quantity: "3", recovery }))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    await expect(service.save(buyer, "mode-project", { ...saveInput,
      idempotencyKey: "recovery-decision-0002", recovery }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_VERSION_CONFLICT" });
    const ready = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(ready.get("approved-line")).toMatchObject({ state: "ready", revision: { contentDigest: approvedRevisionDigest },
      options: [{ key: "pmc" }], preview: { baseCostPaise: 25_000 },
      integrity: { status: "mismatch", activatedDigest: approvedRevisionDigest, observedDigest } });
    expect(await AuditEventModel.countDocuments({ action: "project_purchase_order_mode_decision_saved" })).toBe(1);
    expect(await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean()
    ])).toEqual(configurationBefore);
    await changeSavedPmcRateWithoutTimestamp(13_000);
    const stale = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(stale.get("approved-line")).toMatchObject({ state: "unavailable", options: [], preview: null,
      issues: [{ code: "RECOVERY_OBSERVED_DIGEST_CHANGED" }] });
  });

  it("rejects recovery on verified content and preserves normal decisions without a basis", async () => {
    await expect(service.preview(buyer, "mode-project", { ...previewInput,
      expectedObservedDigest: approvedRevisionDigest })).rejects.toMatchObject({ status: 422,
      code: "PURCHASE_ORDER_MODE_RECOVERY_NOT_APPLICABLE" });
    await expect(service.save(buyer, "mode-project", { ...saveInput,
      recovery: { expectedObservedDigest: approvedRevisionDigest,
        reason: "Incorrectly requested recovery on verified content.", acknowledge: true } }))
      .rejects.toMatchObject({ status: 422, code: "PURCHASE_ORDER_MODE_RECOVERY_NOT_APPLICABLE" });
    const decision = await service.save(buyer, "mode-project", saveInput);
    expect(decision).not.toHaveProperty("integrityBasis");
    expect((await ProjectPurchaseOrderModeDecisionModel.findById(decision.id).lean())?.integrityBasis).toBeUndefined();
  });

  it("replaces a recovered decision with a verified choice after the original content returns", async () => {
    const observedDigest = await changeSavedPmcRateWithoutTimestamp(12_500);
    const recovered = await service.save(buyer, "mode-project", { ...saveInput,
      recovery: { expectedObservedDigest: observedDigest,
        reason: "Buyer reviewed the currently saved PMC calculation.", acknowledge: true } });
    expect(recovered.integrityBasis?.observedDigest).toBe(observedDigest);
    expect(await changeSavedPmcRateWithoutTimestamp(10_000)).toBe(approvedRevisionDigest);
    const stale = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(stale.get("approved-line")?.issues[0]?.code).toBe("RECOVERY_OBSERVED_DIGEST_CHANGED");
    const verified = await service.save(buyer, "mode-project", { ...saveInput,
      expectedVersion: 1, idempotencyKey: "recovery-decision-0002" });
    expect(verified).toMatchObject({ version: 2, revisionDigest: approvedRevisionDigest });
    expect(verified).not.toHaveProperty("integrityBasis");
    const persisted = await ProjectPurchaseOrderModeDecisionModel.findById(verified.id).lean();
    expect(persisted?.integrityBasis).toBeUndefined();
    const ready = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(ready.get("approved-line")).toMatchObject({ state: "ready", preview: { baseCostPaise: 20_000 } });
    expect(ready.get("approved-line")).not.toHaveProperty("integrity");
  });

  it("rejects an inconsistent current pointer and changed UOM but prices a current draft internally", async () => {
    const observedDigest = await changeSavedPmcRateWithoutTimestamp(12_500);
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" },
      { $set: { status: "superseded", version: 3 } });
    const superseded = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(superseded.get("approved-line")).toMatchObject({ state: "unavailable", options: [],
      issues: [{ code: "CONFIGURATION_REVISION_UNAVAILABLE" }] });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" },
      { $set: { status: "active" } });
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "mode-uom" }, { $set: { decimalScale: 3 } });
    const changedUom = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(changedUom.get("approved-line")?.issues[0]?.code).toBe("PINNED_UOM_CHANGED");
    expect(changedUom.get("approved-line")).not.toHaveProperty("integrity");
    await AiEstimatorKnowledgeUomModel.collection.updateOne({ _id: "mode-uom" }, { $set: { decimalScale: 2 } });
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "revision-a" },
      { $set: { status: "draft", version: 2 } });
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "line-a" }, { $set: {
      status: "draft", activeRevisionId: null, draftRevisionId: "revision-a"
    } });
    const draftSource = { ...source, allLineItems: [{ ...source.allLineItems[0]!,
      sourceRevisionStatus: "draft" as const, sourceRevisionVersion: 2 }] };
    const draft = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", draftSource, session));
    expect(draft.get("approved-line")).toMatchObject({ state: "selection_required",
      revision: { status: "draft", contentDigest: observedDigest } });
    expect(draft.get("approved-line")).not.toHaveProperty("integrity");
  });

  it("keeps the existing reasoned manual exception available on a mismatched revision", async () => {
    await changeSavedPmcRateWithoutTimestamp(12_500);
    const exception = await service.save(buyer, "mode-project", { ...saveInput,
      mode: null, quantity: null,
      exceptionReason: "Buyer will use explicit vendor terms while the saved values are unverified." });
    expect(exception).toMatchObject({ mode: null, revisionId: null, revisionDigest: null });
    expect(exception).not.toHaveProperty("integrityBasis");
    const resolution = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(resolution.get("approved-line")).toMatchObject({ state: "exception", options: [],
      integrity: { status: "mismatch" } });
  });
});

describe("transactional procurement mode decisions", () => {
  const save = { sourceLineItemKey: "approved-line", expectedVersion: 0, idempotencyKey: "mode-decision-0001",
    expectedEstimateSource, expectedRevisionDigest: approvedRevisionDigest,
    mode: "pmc" as const, quantity: "2", discountBps: 0, markupBasis: "starting" as const, exceptionReason: null };
  it("enforces project-scoped role, CAS, idempotency, audit, and pending-request freeze", async () => {
    await expect(service.save(other, "mode-project", save)).rejects.toMatchObject({ status: 403 });
    await expect(service.save(client, "mode-project", save)).rejects.toMatchObject({ status: 403 });
    const configurationBefore = await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean(),
      AiEstimatorKnowledgePriceVersionModel.findById("price-version").lean(),
      AiEstimatorKnowledgeTaxVersionModel.findById("tax-version").lean()
    ]);
    const first = await service.save(buyer, "mode-project", save);
    expect(first).toMatchObject({ version: 1, mode: "pmc", quantity: "2", revisionId: "revision-a" });
    expect(await service.save(buyer, "mode-project", save)).toEqual(first);
    await expect(service.save(buyer, "mode-project", { ...save, quantity: "3" })).rejects.toMatchObject({ status: 409,
      code: "IDEMPOTENCY_KEY_CONFLICT" });
    await expect(service.save(buyer, "mode-project", { ...save, idempotencyKey: "mode-decision-0002" }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_VERSION_CONFLICT" });
    expect(await AuditEventModel.countDocuments({ action: "project_purchase_order_mode_decision_saved" })).toBe(1);
    const second = await service.save(buyer, "mode-project", { ...save, expectedVersion: 1,
      idempotencyKey: "mode-decision-0003", quantity: "2.25" });
    expect(second).toMatchObject({ version: 2, quantity: "2.25" });
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments({ projectId: "mode-project" })).toBe(1);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments({ projectId: "mode-project" })).toBe(2);
    const configurationAfter = await Promise.all([
      AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean(),
      AiEstimatorKnowledgeSectionModel.find({ revisionId: "revision-a" }).sort({ sectionKey: 1 }).lean(),
      AiEstimatorKnowledgePriceVersionModel.findById("price-version").lean(),
      AiEstimatorKnowledgeTaxVersionModel.findById("tax-version").lean()
    ]);
    expect(configurationAfter).toEqual(configurationBefore);
    await ProjectPurchaseOrderRequestModel.collection.insertOne({ _id: "pending-mode-order", projectId: "mode-project",
      status: "pending_approval" });
    await expect(service.save(buyer, "mode-project", { ...save, expectedVersion: 2,
      idempotencyKey: "mode-decision-0004" })).rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_REQUEST_PENDING" });
  });

  it("permits a reasoned historical exception when the pinned revision is missing, then a versioned clear", async () => {
    const savedRevision = await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean();
    if (!savedRevision) throw new Error("Missing revision fixture.");
    await AiEstimatorKnowledgeRevisionModel.collection.deleteOne({ _id: "revision-a" });
    const exception = await service.save(buyer, "mode-project", { ...save, mode: null, quantity: null,
      exceptionReason: "The archived approved revision is unavailable; vendor terms are explicit." });
    expect(exception).toMatchObject({ version: 1, mode: null, revisionId: null,
      exceptionReason: expect.stringContaining("unavailable") });
    const resolution = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(resolution.get("approved-line")?.state).toBe("exception");
    await expect(service.save(buyer, "mode-project", { ...save, expectedVersion: 1,
      idempotencyKey: "mode-decision-0002", mode: "pmc", quantity: "2" }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_SOURCE_CONFLICT" });
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne(savedRevision);
    const restored = await mongoose.connection.transaction((session) => resolvePurchaseOrderModes("mode-project", source, session));
    expect(restored.get("approved-line")?.state).toBe("selection_required");
    const cleared = await service.save(buyer, "mode-project", { ...save, expectedVersion: 1,
      idempotencyKey: "mode-decision-0003", mode: null, quantity: null, exceptionReason: null });
    expect(cleared).toMatchObject({ version: 2, mode: null, exceptionReason: null });
  });

  it("rejects a stale approved round or revision digest before persisting a new decision", async () => {
    const before = await EstimateModel.findById("mode-estimate").lean();
    await expect(service.save(buyer, "mode-project", { ...save, idempotencyKey: "source-cas-0000",
      expectedEstimateSource: undefined as never })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(service.save(buyer, "mode-project", { ...save, idempotencyKey: "source-cas-0004",
      expectedRevisionDigest: undefined })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(service.save(buyer, "mode-project", { ...save, idempotencyKey: "source-cas-0001",
      expectedEstimateSource: { ...expectedEstimateSource, estimateReviewRoundId: "prior-round" } }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_SOURCE_CONFLICT" });
    await expect(service.save(buyer, "mode-project", { ...save, idempotencyKey: "source-cas-0002",
      expectedEstimateSource, expectedRevisionDigest: "0".repeat(64) }))
      .rejects.toMatchObject({ status: 409, code: "PURCHASE_ORDER_MODE_SOURCE_CONFLICT" });
    expect(await EstimateModel.findById("mode-estimate").lean()).toEqual(before);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    const revision = await AiEstimatorKnowledgeRevisionModel.findById("revision-a").lean();
    if (!revision?.contentDigest) throw new Error("Missing approved Configuration digest fixture.");
    const saved = await service.save(buyer, "mode-project", { ...save, idempotencyKey: "source-cas-0003",
      expectedEstimateSource, expectedRevisionDigest: revision.contentDigest });
    expect(saved).toMatchObject({ version: 1, revisionDigest: revision.contentDigest });
  });
});
