import mongoose from "mongoose";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProcurementBasketBoqRevisionModel } from "../src/models/ProcurementBasketTender.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { resolveEstimatorCatalogueLines } from "../src/services/estimator-catalogue.service.js";
import { resolvePurchaseOrderModes } from "../src/services/project-purchase-order-mode.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const admin = { id: "margin-consumer-admin", name: "Administrator", email: "margin@example.invalid", role: "super_admin" as const };
const dependencies = { audit: createAuditService(createMemoryRepository()),
  actorGuard: { requireReadActor: async () => admin, requireMutationActor: async () => admin } };
const items = createAiEstimatorKnowledgeItemService(dependencies);
const references = createAiEstimatorKnowledgeReferenceService(dependencies);
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("margin-consumer-prices"); }, 120_000);
afterAll(async () => { await replica?.stop(); });

it("reads the approved Premium margin in both current pricing paths while preserving the published quote, sent BOQ and active revision", async () => {
  const basket = await references.createBasket(admin, { name: "Installation" });
  const sub = await references.createSubBasket(admin, basket.id, { name: "Ceilings" });
  const uom = await references.createMaster(admin, "uoms", { name: "Square foot", code: "SQFT", decimalScale: 2 });
  const settings = { baseRatePaise: 10_000, lowQuantityLimit: "0", impactBps: 0, minimumMarkupBps: 1000, startingMarkupBps: 2000 };
  const mode = (maximum: number) => ({
    subVendorMinimumMarginBps: 2000, subVendorMarginBps: maximum,
    modeCalculations: { pmc: null, sub_vendor: settings, in_house_labor: null, in_house_material: null }
  });
  const historicalLine = async (name: string, displayOrder: number, premium: number) => {
    const line = await items.createMainLine(admin, basket.id, { name, subBasketId: sub.id, displayOrder });
    const revisionId = line.draftRevisionId!;
    // These are saved configurations from before Sub-Basket defaults were persisted.
    await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId, sectionKey: "overview" }, {
      $set: { applicability: "configured", payload: { uomId: uom.id, applicableTiers: ["signature", "premium"] } }
    });
    await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId, sectionKey: "advanced" }, {
      $set: { applicability: "configured", payload: { ...mode(2500), tierConfigurations: {
        premium: { applicability: "configured", payload: mode(premium) } } } }
    });
    return { mainLineId: line.mainLineId, revisionId };
  };
  const target = await historicalLine("Approved ceiling", 1, 3000);
  const candidate = await historicalLine("Candidate ceiling", 2, 3000);
  const saved = await items.getSection(admin, candidate.mainLineId, candidate.revisionId, "advanced", "premium");
  await items.updateSection(admin, candidate.mainLineId, candidate.revisionId, "advanced", {
    modeTier: "premium", expectedVersion: saved.version, payload: mode(3500),
    marginEdits: [{ mode: "sub_vendor", key: "margin", bound: "maximumBps" }]
  });
  const activeSections = () => AiEstimatorKnowledgeSectionModel.find({ revisionId: target.revisionId }).sort({ _id: 1 }).lean();
  const original = await activeSections();
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId: target.mainLineId, revisionNumber: 1, sections:
    original.map(row => ({ sectionKey: row.sectionKey, applicability: row.applicability, payload: row.payload ?? {} })) });
  await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.revisionId }, { $set: { status: "active", contentDigest } });
  await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, {
    $set: { status: "active", activeRevisionId: target.revisionId, draftRevisionId: null }
  });

  const source = { estimateId: "approved-estimate", estimateVersion: 1, estimateReviewRoundId: "approved-round",
    allLineItems: [{ key: "approved-line", included: true, amountPaise: 26_000, quantity: 2, source: "configuration" as const,
      approvedPricingMode: "sub_vendor" as const, modeTier: "premium" as const, mainBasketId: basket.id,
      mainLineId: target.mainLineId, revisionId: target.revisionId, sourceRevisionStatus: "active" as const,
      sourceRevisionVersion: 1, uomId: uom.id, uomCode: "SQFT", uomDecimalScale: 2 }] };
  const approved = { id: "approved-line", source: "configuration", included: true, mainLineId: target.mainLineId,
    revisionId: target.revisionId, modeTier: "premium", quantity: 2, unit: "SQFT", ratePaise: 13_000, amountPaise: 26_000 };
  const frozen = { estimateId: source.estimateId, estimateVersion: 1, estimateReviewRoundId: source.estimateReviewRoundId };
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: source.estimateReviewRoundId, estimateId: source.estimateId,
    estimateVersion: 1, status: "approved", estimateSnapshot: { lineItems: [approved], subtotalPaise: 26_000 } });
  await ProcurementBasketBoqRevisionModel.collection.insertOne({ _id: "sent-boq", projectId: "project", mainBasketId: basket.id,
    estimateSource: frozen, sentAt: new Date(), lines: [{ sourceLineItemKey: approved.id, mainLineId: target.mainLineId, approvedQuoteAmountPaise: 26_000 }] });
  const publishedQuote = () => EstimateClientReviewRoundModel.findById(source.estimateReviewRoundId).lean();
  const sentBoq = () => ProcurementBasketBoqRevisionModel.findById("sent-boq").lean();
  const quoteBefore = await publishedQuote();
  const boqBefore = await sentBoq();
  const estimate = async () => (await resolveEstimatorCatalogueLines([target.mainLineId])).get(target.mainLineId)?.line;
  const proposals = new Map([["approved-line", { mode: "sub_vendor" as const, quantity: "2", discountBps: 0,
    markupBasis: "starting" as const, exceptionReason: null }]]);
  const procurement = async () => (await mongoose.connection.transaction(session =>
    resolvePurchaseOrderModes("project", source, session, { proposals }))).get("approved-line");
  expect(await estimate()).toMatchObject({ revisionStatus: "active", tierPricing: {
    signature: { modeBaseRatesPaise: { sub_vendor: 12_500 } }, premium: { modeBaseRatesPaise: { sub_vendor: 13_000 } } } });
  expect(await procurement()).toMatchObject({ state: "ready", revision: { id: target.revisionId, status: "active" },
    preview: { marginBps: 3000, baseCostPaise: 20_000 } });

  const matrix = await items.getMarginMatrix(admin, basket.id, sub.id);
  const decision = { kind: "approve", candidate: { mainLineId: candidate.mainLineId, tier: "premium", mode: "sub_vendor" } } as const;
  const input = { versionToken: matrix.versionToken, decision };
  const preview = await items.previewMarginDecision(admin, basket.id, sub.id, input);
  await items.commitMarginDecision(admin, basket.id, sub.id, { ...input, reviewToken: preview.reviewToken, operationId: "promote-premium-ceilings" });

  const updated = await estimate();
  expect(updated).toMatchObject({ revisionStatus: "draft", tierPricing: {
    signature: { modeBaseRatesPaise: { sub_vendor: 12_500 } }, premium: { modeBaseRatesPaise: { sub_vendor: 13_500 } } } });
  expect(await procurement()).toMatchObject({ state: "ready", revision: { id: updated!.revisionId, status: "draft" },
    preview: { marginBps: 3500, baseCostPaise: 20_000 } });
  expect(await activeSections()).toEqual(original);
  expect(await publishedQuote()).toEqual(quoteBefore);
  expect(await sentBoq()).toEqual(boqBefore);
}, 30_000);
