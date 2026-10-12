import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProposalPublicationSnapshot, ProposalResource, ProposalSectionValue } from "../src/contracts/vendor-basket-proposal.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY, fixedGstRuleDocument, fixedGstVersionDocument } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../src/models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../src/models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { VendorInductionReviewModel } from "../src/models/VendorInduction.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { UserModel } from "../src/models/User.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { normalizeKnowledgeProposalSectionPayload } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { basketQualityDigest } from "../src/services/ai-estimator-knowledge-basket-quality.js";
import { normalizeProposalPriceCommands, projectProposalPricingPayload, publishProposalSnapshot, validateProposalSnapshot } from "../src/services/vendor-basket-proposal-publication.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";

const NOW = new Date("2026-10-11T10:00:00Z");
const actorId = "proposal-publication-admin";
const admin: PublicUser = { id: actorId, role: "super_admin", name: "Publication Fixture", email: "publication@fixture.invalid" };
const stamps = { createdById: actorId, updatedById: actorId, createdAt: NOW, updatedAt: NOW };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const models = [AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel,
  AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeBasketQualityRevisionModel,
  AiEstimatorKnowledgeDisplayOrderSequenceModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeTaxRuleModel,
  AiEstimatorKnowledgeTaxVersionModel, AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeVendorModel, VendorInductionReviewModel,
  VendorKpiAssessmentModel, AuditEventModel, UserModel, AuthorizationCoordinationModel];
beforeAll(async () => { replica = await startMongoReplicaSet("basket-proposal-publication"); await Promise.all(models.map((model) => model.syncIndexes())); }, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create({ _id: admin.id, name: admin.name, email: admin.email, emailNormalized: admin.email, passwordHash: "fixture-only", role: admin.role, active: true });
  await AiEstimatorKnowledgeUomModel.create({ _id: "proposal-uom", code: "NOS", codeNormalized: "nos", name: "Number", nameNormalized: "number", decimalScale: 0, displayOrder: 1, status: "active", version: 1, ...stamps });
});
afterAll(async () => { await replica?.stop(); });
function resource<T>(kind: ProposalResource["kind"], resourceId: string, parentId: string | null, payload: T): ProposalResource<T> {
  return { proposalId: "proposal-one", kind, resourceId, parentId, payload, version: 1, headId: "head-one", digest: "a".repeat(64), savedById: actorId, savedAt: NOW.toISOString() };
}
function section(mainLineId: string, sectionKey: ProposalSectionValue["sectionKey"], payload: Record<string, unknown>): ProposalResource<ProposalSectionValue> {
  return resource("section", `${mainLineId}-${sectionKey}`, mainLineId, { sectionKey, applicability: "configured", payload });
}
function snapshot(count = 2): ProposalPublicationSnapshot {
  return { proposalId: "proposal-one", basket: resource("basket", "proposed-basket", null, { name: "Proposed Painting", description: "Complete proposal", displayOrder: 0 }),
    subBaskets: Array.from({ length: count }, (_, i) => resource("sub_basket", `proposed-sub-${i}`, "proposed-basket", { name: `Sub ${i}`, description: null, displayOrder: i })),
    mainLines: Array.from({ length: count }, (_, i) => resource("main_line", `proposed-line-${i}`, `proposed-sub-${i}`, { name: `Line ${i}`, description: null, displayOrder: i })),
    sections: Array.from({ length: count }, (_, i) => section(`proposed-line-${i}`, "overview", { uomId: "proposal-uom" })), quality: resource("quality", "proposed-quality", "proposed-basket", { parameters: [] }) };
}
async function publish(value: ProposalPublicationSnapshot, audit = createAuditService(createMemoryRepository())) {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => publishProposalSnapshot({ snapshot: value, actorId, session, occurredAt: NOW, audit, createId: randomUUID })); }
  finally { await session.endSession(); }
}
async function liveCounts() { return Promise.all(models.slice(0, 10).map((model) => model.countDocuments())); }
async function vendor() {
  await AiEstimatorKnowledgeVendorModel.create({ _id: "proposal-vendor", code: "VENDOR", codeNormalized: "vendor", name: "Fixture Vendor", nameNormalized: "fixture vendor", displayOrder: 1, status: "active", version: 1, ...stamps });
  await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "proposal-vendor" }, { $set: { procurementProfile: { ...vendorProfileFixture(), mainBasketId: "source-basket", subBasketId: "source-sub", currentAddressVerifiedPhysically: true, physicalAddressVerifiedAt: NOW.toISOString(), physicalAddressVerifiedById: actorId } } });
  await VendorInductionReviewModel.collection.insertOne({ _id: "proposal-review", vendorId: "proposal-vendor", version: 1, vendorType: "execution", decision: "approved", idempotencyKey: "proposal-review" });
  await VendorKpiAssessmentModel.collection.insertMany(["vendor_self", "procurement"].map((source) => ({ _id: `proposal-kpi-${source}`, vendorId: "proposal-vendor", source, vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, revision: 1, averageScoreBps: 0 })));
}
function price(amount: number) { return { operation: "set_budget", vendorId: "proposal-vendor", uomId: "proposal-uom", inputAmountPaise: amount, effectiveFrom: NOW.toISOString(), effectiveTo: null }; }

describe("isolated proposal readiness and atomic canonical publication", { timeout: 30_000 }, () => {
  it("keeps normal Mode identity guards when saving proposal sections", () => {
    expect(() => normalizeKnowledgeProposalSectionPayload("advanced", { modeConfigurations: [{ id: "new-execution", modeKind: "execution", fields: [] }] }, {})).toThrow("Request validation failed");
    expect(() => normalizeKnowledgeProposalSectionPayload("advanced", { modeConfigurations: [{ id: "new-legacy", modeKind: "pmc", modeId: "legacy-mode", fields: [] }] }, {})).toThrow("Request validation failed");
    const previous = { modeConfigurations: [{ id: "execution-one", modeKind: "execution", executionSource: "sub_vendor", fields: [] }] };
    expect(() => normalizeKnowledgeProposalSectionPayload("advanced", { modeConfigurations: [{ ...previous.modeConfigurations[0], executionSource: "in_house" }] }, previous)).toThrow("Request validation failed");
    expect(normalizeKnowledgeProposalSectionPayload("advanced", previous, previous)).toEqual(previous);
  });
  it("retains proposal-owned budget identities and rejects cross-line price references", async () => {
    const saved = normalizeProposalPriceCommands({ priceEntries: [price(11800)] }, {}, () => "owned-one");
    const projected = projectProposalPricingPayload(saved, "line-one", "head-one", 3);
    const entry = (projected.priceEntries as Array<Record<string, unknown>>)[0]!;
    const { priceVersion: ignored, ...reference } = entry;
    expect(ignored).toMatchObject({ id: "proposal-price-owned-one", versionNumber: 3, inputAmountPaise: 11800 });
    expect(normalizeProposalPriceCommands({ priceEntries: [reference] }, saved, randomUUID)).toEqual(saved);
    const edited = normalizeProposalPriceCommands({ priceEntries: [{ ...price(23600), sourcePriceVersionId: entry.priceVersionId }] }, saved, randomUUID);
    expect((edited.priceEntries as Array<Record<string, unknown>>)[0]).toMatchObject({ priceEntryId: entry.priceEntryId, inputAmountPaise: 23600 });
    expect(() => normalizeProposalPriceCommands({ priceEntries: [reference] }, {}, randomUUID)).toThrow("saved proposal price is unavailable");
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments()).toBe(0);
  });
  it("allows incomplete saves while rejecting invalid saved references", async () => {
    const value = snapshot(); value.sections = []; value.mainLines = [];
    expect(await validateProposalSnapshot(value, undefined, { forSave: true })).toEqual([]);
    expect((await validateProposalSnapshot(value)).length).toBeGreaterThan(0);
    const bad = snapshot(); bad.sections[0]!.payload.payload.uomId = "wrong-uom";
    expect(await validateProposalSnapshot(bad, undefined, { forSave: true })).toContainEqual(expect.objectContaining({ code: "KNOWLEDGE_REFERENCE_INVALID" }));
  });
  it("readiness leaves every live collection and reference counter unchanged", async () => {
    const value = snapshot();
    const before = await liveCounts();
    const uomBefore = await AiEstimatorKnowledgeUomModel.findById("proposal-uom").lean();
    expect(await validateProposalSnapshot(value)).toEqual([]);
    expect(await liveCounts()).toEqual(before);
    expect(await AiEstimatorKnowledgeUomModel.findById("proposal-uom").lean()).toEqual(uomBefore);
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("publishes reserved IDs and peer references regardless of activation order", async () => {
    const value = snapshot();
    value.sections.push(section("proposed-line-0", "advanced", { dependencies: [{ id: "peer-dependency", targetBasketId: "proposed-basket", targetMainLineId: "proposed-line-1", reason: "Preparation first", active: true }] }));
    expect(await validateProposalSnapshot(value)).toEqual([]);
    const result = await publish(value);
    expect(result).toMatchObject({ basketId: "proposed-basket", subBasketIds: ["proposed-sub-0", "proposed-sub-1"] });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ status: "active", draftRevisionId: null })).toBe(2);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({ status: "active", contentDigest: /^[a-f0-9]{64}$/ })).toBe(2);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(16);
    expect(result.sections).toHaveLength(16);
    expect(result.prices).toEqual([]);
    expect(result.qualityRevisionId).toEqual(expect.any(String));
    const quality = await AiEstimatorKnowledgeBasketQualityRevisionModel.findOne().lean();
    expect(quality?.contentDigest).toBe(basketQualityDigest("proposed-basket", []));
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_revision_activated" })).toBe(2);
  });
  it("rejects complete-graph cycles without installing any Configuration rows", async () => {
    const value = snapshot();
    for (const i of [0, 1]) value.sections.push(section(`proposed-line-${i}`, "advanced", { dependencies: [{ id: `dependency-${i}`, targetBasketId: "proposed-basket", targetMainLineId: `proposed-line-${1 - i}`, reason: "Cycle", active: true }] }));
    expect(await validateProposalSnapshot(value)).toContainEqual(expect.objectContaining({ code: "DEPENDENCY_CYCLE" }));
    await expect(publish(value)).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
  });
  it("materializes unequal prices in integer paise and provisions fixed GST only at approval", async () => {
    await vendor();
    const value = snapshot();
    value.sections.push(section("proposed-line-0", "pricing", { priceEntries: [price(11800)] }), section("proposed-line-1", "pricing", { priceEntries: [price(29500)] }));
    expect(await validateProposalSnapshot(value)).toEqual([]);
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeTaxRuleModel.countDocuments()).toBe(0);
    const published = await publish(value);
    expect(published.prices).toHaveLength(2);
    const prices = await AiEstimatorKnowledgePriceVersionModel.find().sort({ inputAmountPaise: 1 }).lean();
    expect(prices.map((entry) => entry.inputAmountPaise)).toEqual([11800, 29500]);
    for (const entry of prices) { expect(entry.taxVersionId).toBe(AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id); expect(entry.baseAmountPaise + entry.taxAmountPaise).toBe(entry.totalAmountPaise); }
    expect(await AiEstimatorKnowledgeTaxRuleModel.countDocuments()).toBe(1);
  });
  it("rolls back hierarchy, quality, GST, prices and audits if activation auditing fails", async () => {
    await vendor();
    const value = snapshot(); value.sections.push(section("proposed-line-0", "pricing", { priceEntries: [price(11800)] }));
    const audit = createAuditService(createMemoryRepository());
    const broken = { ...audit, appendInMongoTransaction: async (...args: Parameters<typeof audit.appendInMongoTransaction>) => {
      if (args[0].action === "ai_estimator_knowledge_revision_activated") throw new Error("fixture activation audit failure");
      return audit.appendInMongoTransaction(...args);
    } };
    await expect(publish(value, broken)).rejects.toThrow("fixture activation audit failure");
    expect(await liveCounts()).toEqual(Array(10).fill(0));
    expect(await AuditEventModel.countDocuments()).toBe(0);
  });
  it("blocks invalid or drifted references and live price references", async () => {
    const value = snapshot();
    value.sections[0]!.payload.payload.uomId = "unavailable-uom";
    expect(await validateProposalSnapshot(value)).toContainEqual(expect.objectContaining({ code: "KNOWLEDGE_REFERENCE_INVALID" }));
    value.sections[0]!.payload.payload.uomId = "proposal-uom";
    value.sections.push(section("proposed-line-0", "pricing", { priceEntries: [{ operation: "reference", priceEntryId: "other-entry", priceVersionId: "other-version" }] }));
    expect(await validateProposalSnapshot(value)).toContainEqual(expect.objectContaining({ code: "KNOWLEDGE_REFERENCE_INVALID" }));
  });
  it("revalidates after a referenced UOM archive wins the publication transaction race", async () => {
    const audit = createAuditService(createMemoryRepository());
    let archived = false;
    const racing = { ...audit, appendInMongoTransaction: async (...args: Parameters<typeof audit.appendInMongoTransaction>) => {
      await audit.appendInMongoTransaction(...args);
      if (!archived && args[0].action === "ai_estimator_knowledge_basket_created") {
        archived = true;
        // An independent transaction commits after readiness read the old UOM.
        await AiEstimatorKnowledgeUomModel.updateOne({ _id: "proposal-uom" }, { $set: { status: "inactive" } });
      }
    } };
    await expect(publish(snapshot(), racing)).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    expect((await AiEstimatorKnowledgeUomModel.findById("proposal-uom").lean())?.status).toBe("inactive");
  });
  it("blocks fixed-GST drift instead of changing reviewed budget amounts", async () => {
    await vendor();
    await AiEstimatorKnowledgeTaxRuleModel.create(fixedGstRuleDocument(NOW));
    await AiEstimatorKnowledgeTaxVersionModel.create(fixedGstVersionDocument(NOW));
    await AiEstimatorKnowledgeTaxVersionModel.collection.updateOne({ _id: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id }, { $set: { rateBps: 1200 } });
    const value = snapshot();
    value.sections.push(section("proposed-line-0", "pricing", normalizeProposalPriceCommands({ priceEntries: [price(11800)] }, {}, randomUUID)));
    expect(await validateProposalSnapshot(value)).toContainEqual(expect.objectContaining({ code: "FIXED_GST_POLICY_MISMATCH" }));
    await expect(publish(value)).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments()).toBe(0);
    expect((await AiEstimatorKnowledgeTaxVersionModel.findOne().lean())?.rateBps).toBe(1200);
  });
  it("requires ordinary activation inputs but does not demand 100% completion", async () => {
    const value = snapshot(); value.sections = [];
    expect(await validateProposalSnapshot(value)).toContainEqual(expect.objectContaining({ sectionKey: "overview" }));
    expect(await validateProposalSnapshot(snapshot())).toEqual([]);
  });
  it.each(["active", "inactive", "archived"])("does not merge into an existing %s named basket", async (status) => {
    await AiEstimatorKnowledgeBasketModel.create({ _id: "independent-existing-basket", name: "  PROPOSED   painting ", nameNormalized: "proposed painting", status, displayOrder: 1, version: 1,
      archivedAt: status === "archived" ? NOW : null, archivedById: status === "archived" ? actorId : null, ...stamps });
    await expect(publish(snapshot())).rejects.toMatchObject({ status: 409, code: "DUPLICATE_IDENTITY" });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
  });
  it("serializes competing normalized names without merging the proposals", async () => {
    const first = snapshot(); const second = structuredClone(first);
    second.proposalId = "independent-proposal-two";
    const all = [second.basket, ...second.subBaskets, ...second.mainLines, ...second.sections, second.quality!];
    for (const resource of all) {
      resource.proposalId = second.proposalId;
      resource.resourceId += "-independent";
      if (resource.parentId) resource.parentId += "-independent";
    }
    second.basket.payload.name = "  PROPOSED   Painting ";
    expect(second.basket.resourceId).not.toBe(first.basket.resourceId);
    const outcomes = await Promise.allSettled([publish(first), publish(second)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "DUPLICATE_IDENTITY", status: 409 } });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(2);
    const loser = outcomes[0]!.status === "rejected" ? first : second;
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: loser.basket.resourceId })).toBe(0);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments({ mainLineId: { $in: loser.mainLines.map((line) => line.resourceId) } })).toBe(0);
  });
  it.each(["create", "rename"] as const)("coordinates normalized proposal names with ordinary Configuration %s", async (operation) => {
    const reference = createAiEstimatorKnowledgeReferenceService({ audit: createAuditService(createMemoryRepository()) });
    const existing = operation === "rename" ? await reference.createBasket(admin, { name: "Independent original" }) : null;
    const value = snapshot();
    const normalWrite = operation === "create"
      ? reference.createBasket(admin, { name: "  PROPOSED   painting " })
      : reference.updateBasket(admin, existing!.id, { expectedVersion: existing!.version, name: "  PROPOSED   painting " });
    const outcomes = await Promise.allSettled([publish(value), normalWrite]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, code: "DUPLICATE_IDENTITY" } });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments({ nameNormalized: "proposed painting" })).toBe(1);
    const published = outcomes[0]!.status === "fulfilled";
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(published ? 2 : 0);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(published ? 16 : 0);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(published ? 1 : 0);
    if (existing) expect((await AiEstimatorKnowledgeBasketModel.findById(existing.id).lean())?.name).toBe(published ? "Independent original" : "  PROPOSED   painting ");
  });
  it("checks resource and hierarchy bounds and publishes a representative large hierarchy", async () => {
    const tooMany = snapshot(51);
    expect(await validateProposalSnapshot(tooMany)).toContainEqual(expect.objectContaining({ code: "PROPOSAL_LIMIT_EXCEEDED" }));
    const large = snapshot(20);
    expect(await validateProposalSnapshot(large)).toEqual([]);
    expect((await publish(large)).mainLines).toHaveLength(20);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({ status: "active" })).toBe(20);
  });
});
