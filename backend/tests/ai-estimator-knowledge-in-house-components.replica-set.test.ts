import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "component-admin", name: "Administrator", email: "components@example.invalid", role: "super_admin" as const };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
const audit = createAuditService(createMemoryRepository());
const item = createAiEstimatorKnowledgeItemService({ actorGuard, audit });
const reference = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("knowledge-in-house-components"); }, 120000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });
const cost = { baseRatePaise: 1501, lowQuantityLimit: "1", impactBps: 750, minimumMarkupBps: 1000, startingMarkupBps: 2500 };
const component = (basketId: string, subBasketId: string | null, id = "component-one") => ({ id, basketId, subBasketId, inclusions: [], exclusions: [], labor: cost, material: cost });
async function fixture() {
  const own = await reference.createBasket(actor, { name: "Owner" });
  const ownSub = await reference.createSubBasket(actor, own.id, { name: "Own Sub Basket" });
  const external = await reference.createBasket(actor, { name: "External" });
  const externalSub = await reference.createSubBasket(actor, external.id, { name: "External Sub Basket" });
  const line = await item.createMainLine(actor, own.id, { name: "Main Line", subBasketId: ownSub.id });
  return { own, ownSub, external, externalSub, line };
}
async function save(line: Awaited<ReturnType<typeof fixture>>["line"], inHouseComponents: unknown, expectedVersion = 1, expectedAggregateVersion = line.version) {
  return item.updateSection(actor, line.mainLineId, line.draftRevisionId!, "advanced", { payload: { inHouseComponents }, expectedVersion, expectedAggregateVersion });
}

describe("In-house component revision references", { timeout: 30000 }, () => {
  it("saves cross-catalogue references with parent race coordination and rejects stale edits", async () => {
    const { line, external, externalSub } = await fixture();
    const before = await AiEstimatorKnowledgeBasketModel.findById(external.id).lean();
    await save(line, [component(external.id, externalSub.id)]);
    const after = await AiEstimatorKnowledgeBasketModel.findById(external.id).lean();
    expect(after!.dependencyEpoch).toBe(Number(before!.dependencyEpoch ?? 0) + 1);
    await expect(save(line, [])).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await item.getSection(actor, line.mainLineId, line.draftRevisionId!, "advanced")).payload).toEqual({ inHouseComponents: [component(external.id, externalSub.id)] });
  });
  it("rejects a foreign sub-basket and a missing component parent without mutating the section", async () => {
    const { line, own, externalSub } = await fixture();
    await expect(save(line, [component(own.id, externalSub.id)])).rejects.toMatchObject({ code: "KNOWLEDGE_REFERENCE_INVALID" });
    await expect(save(line, [component("missing", externalSub.id)])).rejects.toMatchObject({ code: "KNOWLEDGE_REFERENCE_INVALID" });
    expect((await item.getSection(actor, line.mainLineId, line.draftRevisionId!, "advanced")).version).toBe(1);
  });
  it("preserves ordinary grouped legacy identity and permits nullable legacy scope only in the owning basket", async () => {
    const { line, own, ownSub, external } = await fixture();
    await expect(save(line, [component(external.id, null, "legacy-in-house")])).rejects.toMatchObject({ code: "KNOWLEDGE_REFERENCE_INVALID" });
    await save(line, [component(own.id, ownSub.id, "legacy-in-house")]);
    const current = await item.getItem(actor, line.mainLineId);
    await expect(save(line, [component(own.id, null, "legacy-in-house")], 2, current.version)).rejects.toMatchObject({ code: "IN_HOUSE_COMPONENT_IDENTITY_IMMUTABLE" });
  });
  it("blocks component target deletion while the reference survives in current or historic revisions", async () => {
    const { line, external, externalSub } = await fixture();
    await save(line, [component(external.id, externalSub.id)]);
    const impact = await reference.getSubBasketDeletionImpact(actor, external.id, externalSub.id);
    await expect(reference.permanentlyDeleteSubBasket(actor, external.id, externalSub.id, { expectedVersion: externalSub.version,
      impactToken: impact.impactToken, confirmationName: externalSub.name, reason: "Remove fixture" })).rejects.toMatchObject({ code: "IN_HOUSE_COMPONENT_REFERENCE_EXISTS" });
    await expect(reference.permanentlyDeleteBasket(actor, external.id, { expectedVersion: external.version, confirmationName: external.name, reason: "Remove fixture" })).rejects.toMatchObject({ code: "IN_HOUSE_COMPONENT_REFERENCE_EXISTS" });
    expect(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: externalSub.id })).toBeTruthy();
    // A new draft may remove the component, but immutable history still refers to its scope.
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: line.mainLineId }, { $set: { status: "active", activeRevisionId: line.draftRevisionId, draftRevisionId: null } });
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: line.draftRevisionId }, { $set: { status: "active", contentDigest: "frozen" } });
    const active = await item.getItem(actor, line.mainLineId);
    const draft = await item.createRevision(actor, line.mainLineId, { expectedVersion: active.version });
    const current = await item.getItem(actor, line.mainLineId);
    await item.updateSection(actor, line.mainLineId, draft.draftRevisionId!, "advanced", { expectedVersion: 1, expectedAggregateVersion: current.version, payload: { inHouseComponents: [] } });
    const refreshed = await reference.getSubBasketDeletionImpact(actor, external.id, externalSub.id);
    await expect(reference.permanentlyDeleteSubBasket(actor, external.id, externalSub.id, { expectedVersion: externalSub.version,
      impactToken: refreshed.impactToken, confirmationName: externalSub.name, reason: "Remove fixture" })).rejects.toMatchObject({ code: "IN_HOUSE_COMPONENT_REFERENCE_EXISTS" });
  });
  it("never commits a dangling component when scope deletion races a save", async () => {
    const { line, external, externalSub } = await fixture();
    const impact = await reference.getSubBasketDeletionImpact(actor, external.id, externalSub.id);
    const results = await Promise.allSettled([
      save(line, [component(external.id, externalSub.id)]),
      reference.permanentlyDeleteSubBasket(actor, external.id, externalSub.id, { expectedVersion: externalSub.version, impactToken: impact.impactToken, confirmationName: externalSub.name, reason: "Remove fixture" })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const exists = await AiEstimatorKnowledgeSubBasketModel.exists({ _id: externalSub.id });
    const section = await AiEstimatorKnowledgeSectionModel.findOne({ mainLineId: line.mainLineId, sectionKey: "advanced" }).lean();
    expect(Boolean(exists)).toBe(Array.isArray(section?.payload?.inHouseComponents) && section.payload.inHouseComponents.length === 1);
  });
});
