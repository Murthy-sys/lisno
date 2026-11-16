import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS } from "../src/domain/ai-estimator-knowledge.js";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderRequestModel } from "../src/models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel } from "../src/models/ProjectPurchaseOrderModeDecision.js";
import { ProcurementBasketBaseRateModel, ProcurementBasketBaseRateReceiptModel } from "../src/models/ProcurementBasketBaseRate.js";
import { ProcurementBasketBoqRevisionModel, ProcurementBasketEnquiryModel, ProcurementBasketSourceReconciliationModel } from "../src/models/ProcurementBasketTender.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectPurchaseOrderModeDecisionService } from "../src/services/project-purchase-order-mode.service.js";
import { createProcurementBasketBaseRateService } from "../src/services/procurement-basket-base-rate.service.js";
import { procurementItemSourceSnapshot, type ApprovedProcurementSnapshot } from "../src/services/procurement.service.js";
import { currentBasket } from "../src/services/procurement-basket-tender-support.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/procurement.service.js", () => ({
  assertProcurementProjectAccess: vi.fn(), procurementItemSourceSnapshot: vi.fn(),
  procurementPreparationProjectFilter: () => ({ status: "active" })
}));
vi.mock("../src/services/procurement-basket-tender-support.service.js", () => ({ currentBasket: vi.fn() }));

const projectId = "reconciled-lock-project";
const basketId = "reconciled-lock-basket";
const lineKey = "room-one:line-one";
const buyer: PublicUser = { id: "lock-buyer", name: "Buyer", email: "lock-buyer@example.test", role: "procurement" };
const at = new Date("2026-11-17T00:00:00Z");
const source = { estimateId: "lock-estimate", estimateVersion: 3, estimateReviewRoundId: "final-round" };
const oldSource = { ...source, estimateVersion: 1, estimateReviewRoundId: "pre-round" };
const preparationSource = { ...source, workflowVersion: 3 as const, phase: "post" as const,
  kind: "approved_final" as const, sourceSnapshotId: "final-snapshot", sourceDigest: "a".repeat(64) };
const boqDigest = "b".repeat(64);
const preparationDigest = "c".repeat(64);
const settings = { baseRatePaise: 7_000, lowQuantityLimit: "2", impactBps: 0,
  minimumMarkupBps: 0, startingMarkupBps: 0 };
const sections = AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map(sectionKey => ({
  sectionKey, applicability: (["overview", "advanced"].includes(sectionKey) ? "configured" : "not_configured") as "configured" | "not_configured",
  payload: sectionKey === "overview" ? { uomId: "lock-uom" }
    : sectionKey === "advanced" ? { modeCalculations: { pmc: null, sub_vendor: settings, in_house: null }, subVendorMarginBps: 0 } : {}
}));
const revisionDigest = createKnowledgeRevisionDigest({ mainLineId: "lock-main-line", revisionNumber: 1, sections });
const approvedLine = { key: lineKey, sectionId: basketId, sectionLabel: "Painting", catalogueId: "lock-main-line",
  source: "configuration" as const, itemType: "main_line" as const, mainLineId: "lock-main-line", mainLineName: "Paint",
  mainBasketId: basketId, mainBasketName: "Painting", approvedPricingMode: "sub_vendor" as const,
  roomId: "room-one", roomName: "Living", subBasketId: null, subBasketName: null,
  uomId: "lock-uom", uomCode: "SQFT", uomDecimalScale: 2, specification: "Paint wall", unit: "sqft",
  quantity: 2, included: true, amountPaise: 20_000 };
const snapshot: ApprovedProcurementSnapshot = { ...source, preparationSource, allLineItems: [approvedLine], lineItems: [approvedLine],
  designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: buyer.id, mainBasketClassifications: {},
  subtotalRupees: 200, gstRupees: 0, totalRupees: 200, subtotalPaise: 20_000, gstPaise: 0, totalPaise: 20_000 };
const audit = createAuditService(createMemoryRepository());
const modes = createProjectPurchaseOrderModeDecisionService({ audit, now: () => at });
const rates = createProcurementBasketBaseRateService({ audit, now: () => at });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-reconciled-lock-tests");
  await Promise.all([ProjectModel, ProjectPurchaseOrderRequestModel, ProjectPurchaseOrderModeDecisionModel,
    ProjectPurchaseOrderModeDecisionReceiptModel, ProcurementBasketBaseRateModel, ProcurementBasketBaseRateReceiptModel,
    ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketSourceReconciliationModel,
    AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel,
    AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeTaxVersionModel,
    AuditEventModel].map(model => model.syncIndexes()));
}, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  vi.mocked(procurementItemSourceSnapshot).mockResolvedValue(snapshot);
  await ProjectModel.create({ _id: projectId, name: "Lock project", clientId: "lock-client", clientName: "Client",
    clientEmail: "lock-client@example.test", clientEmailNormalized: "lock-client@example.test", clientMobile: "9000000000",
    clientAddress: "Site", status: "active", location: "Site", plannedStartAt: at, plannedEndAt: at });
  await AiEstimatorKnowledgeUomModel.create({ _id: "lock-uom", code: "SQFT", name: "Square foot", decimalScale: 2,
    displayOrder: 1, status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id });
  await AiEstimatorKnowledgeMainLineModel.create({ _id: "lock-main-line", basketId, subBasketId: null, name: "Paint",
    displayOrder: 1, status: "active", activeRevisionId: "lock-revision", draftRevisionId: null, version: 1,
    createdById: buyer.id, updatedById: buyer.id });
  await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: "lock-revision", mainLineId: "lock-main-line",
    revisionNumber: 1, status: "active", contentDigest: revisionDigest, version: 1,
    createdById: buyer.id, updatedById: buyer.id, createdAt: at, updatedAt: at });
  await AiEstimatorKnowledgeSectionModel.collection.insertMany(sections.map(section => ({ ...section, _id: `lock-${section.sectionKey}`,
    mainLineId: "lock-main-line", revisionId: "lock-revision", version: 1, createdById: buyer.id, updatedById: buyer.id, createdAt: at, updatedAt: at })));
  vi.mocked(currentBasket).mockImplementation(async (_projectId, _basketId, session) => {
    const rate = await ProcurementBasketBaseRateModel.findOne({ projectId }).session(session).lean();
    const baseRatePaise = rate?.overridePaise ?? settings.baseRatePaise;
    return { id: basketId, projectId, estimateSource: source, preparationSource, preparationDigest,
      automaticSubVendor: false, lines: [{ sourceLineItemKey: lineKey, included: true, approvedAmountPaise: 20_000,
        source: "configuration", baseUnitRatePaise: baseRatePaise,
        projectRate: { version: rate?.version ?? 0, overridePaise: rate?.overridePaise ?? null },
        mode: { executionPolicy: { intent: "execution", allowedModes: ["sub_vendor", "in_house"] }, state: "ready",
          decision: { mode: "sub_vendor", quantity: "2" }, revision: { id: "lock-revision", contentDigest: revisionDigest },
          uom: { id: "lock-uom", code: "SQFT", decimalScale: 2 }, preview: { mode: "sub_vendor", quantity: "2",
            baseCostPaise: baseRatePaise * 2, adjustedCostPaise: baseRatePaise * 2,
            settings: { scopes: [{ scope: "sub_vendor", baseRatePaise }] } } } }]
    } as Awaited<ReturnType<typeof currentBasket>>;
  });
});

async function frozenEnquiry(status: "award_pending" | "issued", exactSource = false) {
  const estimateSource = exactSource ? source : oldSource;
  const lines = [{ id: "frozen-line", sourceLineItemKey: lineKey, roomId: "room-one", roomName: "Living",
    subBasketId: null, subBasketName: null, mainLineId: "lock-main-line", mainLineName: "Paint",
    approvedQuantity: "2", approvedUnit: "sqft", description: "Paint wall", quantityMilliUnits: 2_000,
    uomId: "lock-uom", uomCode: "SQFT", uomDecimalScale: 2 }];
  await ProcurementBasketEnquiryModel.create({ _id: "lock-enquiry", projectId, mainBasketId: basketId,
    version: 2, status, estimateSource, preparationDigest, draftLines: lines, currentBoqRevisionId: "frozen-boq",
    createdById: buyer.id, updatedById: buyer.id, createIdempotencyKey: "enquiry-create", createRequestDigest: boqDigest });
  await ProcurementBasketBoqRevisionModel.create({ _id: "frozen-boq", enquiryId: "lock-enquiry", projectId,
    mainBasketId: basketId, revision: 1, estimateSource, preparationDigest, digest: boqDigest, lines,
    sentAt: at, sentById: buyer.id, dispatchKey: "initial-dispatch", dispatchRequestDigest: boqDigest });
}
async function reconcile(overrides: Record<string, unknown> = {}) {
  await ProcurementBasketSourceReconciliationModel.create({ _id: "lock-proof", projectId, mainBasketId: basketId,
    enquiryId: "lock-enquiry", boqRevisionId: "frozen-boq", boqDigest, preparationSource, preparationDigest,
    previousEstimateSource: oldSource, unchangedLineKeys: [lineKey], reason: "Unchanged approved scope",
    idempotencyKey: "reconcile-current", requestDigest: preparationDigest, reconciledById: buyer.id, reconciledAt: at,
    ...overrides });
}
const modeInput = { sourceLineItemKey: lineKey, expectedVersion: 0, expectedEstimateSource: source,
  expectedRevisionDigest: revisionDigest, idempotencyKey: "change-mode-lock", mode: "sub_vendor" as const,
  quantity: "2", discountBps: 0, markupBasis: "starting" as const, exceptionReason: null };
const rateInput = { sourceLineItemKey: lineKey, expectedVersion: 0, expectedEstimateSource: source,
  expectedPreparationDigest: preparationDigest, idempotencyKey: "change-rate-lock", baseRatePaise: 8_000 };

describe("current source execution locks", () => {
  it.each(["award_pending", "issued"] as const)("locks schema-valid exact-source %s BOQs", async status => {
    await frozenEnquiry(status, true);
    await expect(modes.save(buyer, projectId, modeInput)).rejects.toMatchObject({ code: "PROCUREMENT_EXECUTION_MODE_LOCKED" });
    await expect(rates.save(buyer, projectId, basketId, rateInput)).rejects.toMatchObject({ code: "PROCUREMENT_BASKET_BASE_RATE_LOCKED" });
  });

  it.each(["award_pending", "issued"] as const)("locks reconciled %s scope without changing its old source or transaction fence", async status => {
    await frozenEnquiry(status);
    await reconcile();
    const beforeProject = await ProjectModel.findById(projectId).lean();
    const beforeEnquiry = await ProcurementBasketEnquiryModel.findById("lock-enquiry").lean();
    await expect(modes.save(buyer, projectId, modeInput)).rejects.toMatchObject({ code: "PROCUREMENT_EXECUTION_MODE_LOCKED" });
    await expect(rates.save(buyer, projectId, basketId, rateInput)).rejects.toMatchObject({ code: "PROCUREMENT_BASKET_BASE_RATE_LOCKED" });
    expect(await ProjectModel.findById(projectId).lean()).toEqual(beforeProject);
    expect(await ProcurementBasketEnquiryModel.findById("lock-enquiry").lean()).toEqual(beforeEnquiry);
    expect(await ProjectPurchaseOrderModeDecisionModel.countDocuments()).toBe(0);
    expect(await ProcurementBasketBaseRateModel.countDocuments()).toBe(0);
    expect(await ProjectPurchaseOrderModeDecisionReceiptModel.countDocuments()).toBe(0);
    expect(await ProcurementBasketBaseRateReceiptModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });

  it.each([
    { label: "no reconciliation", proof: null },
    { label: "older snapshot", proof: { preparationSource: { ...preparationSource, sourceSnapshotId: "older-snapshot" } } },
    { label: "different digest", proof: { preparationSource: { ...preparationSource, sourceDigest: "d".repeat(64) } } },
    { label: "another carried line", proof: { unchangedLineKeys: ["room-two:line-two"] } },
    { label: "another BOQ revision", proof: { boqRevisionId: "previous-boq" } },
    { label: "different frozen BOQ digest", proof: { boqDigest: "e".repeat(64) } },
    { label: "another enquiry", proof: { enquiryId: "other-enquiry" } },
    { label: "another project", proof: { projectId: "other-project" } },
    { label: "another basket", proof: { mainBasketId: "other-basket" } }
  ])("allows a genuinely separate current source when old issued scope has $label", async ({ proof }) => {
    await frozenEnquiry("issued");
    if (proof) await reconcile(proof);
    const savedMode = await modes.save(buyer, projectId, modeInput);
    expect(savedMode).toMatchObject({ mode: "sub_vendor", quantity: "2", version: 1 });
    const savedRate = await rates.save(buyer, projectId, basketId, rateInput);
    expect(savedRate.projectRate).toEqual({ version: 1, overridePaise: 8_000 });
    expect((await ProcurementBasketEnquiryModel.findById("lock-enquiry").lean())?.estimateSource).toEqual(oldSource);
  });
});
