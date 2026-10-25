import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "margin-admin", name: "Margin Administrator", email: "margins@example.invalid", role: "super_admin" as const };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
const models = [AuditEventModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
  AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeRevisionModel,
  AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeUomModel];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let base: ReturnType<typeof harness>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("knowledge-sub-basket-margins");
  await Promise.all(models.map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => { await replica.clear(); base = harness(); });
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await replica?.stop(); });
function harness(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  return { audit, item: createAiEstimatorKnowledgeItemService({ actorGuard, audit }),
    reference: createAiEstimatorKnowledgeReferenceService({ actorGuard, audit }) };
}
const settings = (rate: number, min: number, start: number) => ({ baseRatePaise: rate, lowQuantityLimit: "8", impactBps: 700, minimumMarkupBps: min, startingMarkupBps: start });
function payload(different = false) {
  return { pmcMinimumMarginBps: different ? 1000 : 1200, pmcMarginBps: different ? 1500 : 1800,
    subVendorMinimumMarginBps: different ? 0 : 1500, subVendorMarginBps: different ? 500 : 2500,
    modeDescription: different ? "Target description" : "Source description",
    modeCalculations: { pmc: settings(10000, 2500, 3500), sub_vendor: settings(20000, 2500, 3500),
      in_house_labor: settings(different ? 31000 : 11000, different ? 1000 : 2500, different ? 2000 : 3500),
      in_house_material: settings(different ? 71000 : 51000, different ? 500 : 2000, different ? 1500 : 3000) } };
}
async function create(basketId: string, subBasketId: string, name: string, content: Record<string, unknown> = payload(true), displayOrder?: number, itemType: "main_line" | "temporary" = "main_line") {
  const item = await base.item.createMainLine(actor, basketId, { name, subBasketId, displayOrder, itemType });
  await base.item.updateSection(actor, item.mainLineId, item.draftRevisionId!, "advanced", {
    expectedVersion: 1, expectedAggregateVersion: item.version, payload: content
  });
  return base.item.getItem(actor, item.mainLineId);
}
async function fixture() {
  const basket = await base.reference.createBasket(actor, { name: "Ceilings" });
  const sub = await base.reference.createSubBasket(actor, basket.id, { name: "POP" });
  const source = await create(basket.id, sub.id, "First main line", payload(), 1);
  const target = await create(basket.id, sub.id, "Second main line", payload(true), 2);
  return { basket, sub, source, target };
}
async function section(id: string, revisionId?: string) {
  const item = await base.item.getItem(actor, id);
  return base.item.getSection(actor, id, revisionId ?? item.draftRevisionId ?? item.activeRevisionId!, "advanced");
}
async function snapshot() { return Promise.all(models.map((model) => model.find().sort({ _id: 1 }).lean())); }

describe("current-main-line default Mode configuration", { timeout: 30_000 }, () => {
  async function sourceUom(source: Awaited<ReturnType<typeof create>>) {
    const uom = await base.reference.createMaster(actor, "uoms", { code: "SFT", name: "Square feet", decimalScale: 2 });
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: source.mainLineId, revisionId: source.draftRevisionId, sectionKey: "overview" },
      { $set: { payload: { uomId: uom.id }, applicability: "configured" }, $inc: { version: 1 } });
    return uom;
  }

  it("projects source revision prices and inherited UOM in the reviewed snapshot", async () => {
    const { basket, sub, source } = await fixture();
    const uom = await sourceUom(source);
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: source.mainLineId, sectionKey: "advanced" }, { $unset: { "payload.modeCalculations.pmc.impactBps": "" } });
    const sourceSection = await section(source.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.sourceConfiguration).toMatchObject({ revisionId: source.draftRevisionId, revisionStatus: "draft", itemVersion: source.version,
      sectionVersion: sourceSection.version, uom: { id: uom.id, code: "SFT", name: "Square feet", decimalScale: 2 },
      modes: { pmc: { calculations: [{ scope: "pmc", baseRatePaise: 10000, lowQuantityLimit: "8", impactBps: null }] },
        in_house: { calculations: [{ scope: "in_house_labor", baseRatePaise: 11000 }, { scope: "in_house_material", baseRatePaise: 51000 }] } } });
    await AiEstimatorKnowledgeUomModel.updateOne({ _id: uom.id }, { $set: { status: "inactive" } });
    expect((await base.item.getSubBasketMargins(actor, basket.id, sub.id)).sourceConfiguration?.uom).toBeNull();
  });

  it("labels source components even when their costs are blank and no margin pair is comparable", async () => {
    const { basket, sub, source } = await fixture();
    const current = await section(source.mainLineId);
    await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", { expectedVersion: current.version,
      payload: { ...current.payload, inHouseComponents: [{ id: "blank-component", basketId: basket.id, subBasketId: sub.id, inclusions: [], exclusions: [], labor: null, material: null }] } });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.in_house.mismatchCount).toBeNull();
    expect(summary.sourceConfiguration?.modes.in_house.calculations).toEqual([
      { scope: "in_house_labor", component: { id: "blank-component", basketId: basket.id, subBasketId: sub.id, name: "Ceilings / POP" }, baseRatePaise: null, lowQuantityLimit: null, impactBps: null },
      { scope: "in_house_material", component: { id: "blank-component", basketId: basket.id, subBasketId: sub.id, name: "Ceilings / POP" }, baseRatePaise: null, lowQuantityLimit: null, impactBps: null }
    ]);
  });

  it.each(["overview_payload", "overview_version", "uom_name", "uom_scale", "uom_status", "uom_version"])("rejects a stale current-line review after source %s changes", async (change) => {
    const { basket, sub, source, target } = await fixture();
    const uom = await sourceUom(source);
    const reviewed = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    if (change.startsWith("overview")) await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: source.mainLineId, sectionKey: "overview" },
      change === "overview_version" ? { $inc: { version: 1 } } : { $set: { "payload.description": "Changed source overview" } });
    else await AiEstimatorKnowledgeUomModel.updateOne({ _id: uom.id }, change === "uom_version" ? { $inc: { version: 1 } }
      : { $set: change === "uom_name" ? { name: "Updated unit" } : change === "uom_scale" ? { decimalScale: 3 } : { status: "inactive" } });
    const before = await snapshot();
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: reviewed.versionToken, targetMainLineId: target.mainLineId }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await snapshot()).toEqual(before);
  });

  it("updates only the selected line despite another blocked mismatched sibling", async () => {
    const { basket, sub, target } = await fixture();
    const sibling = await create(basket.id, sub.id, "Sibling requiring review", payload(true), 3);
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: sibling.mainLineId, sectionKey: "advanced" }, { $set: { "payload.modeCalculations.pmc": "legacy invalid value" } });
    const siblingBefore = await section(sibling.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.in_house.canApply).toBe(false);
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken, targetMainLineId: target.mainLineId });
    expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
    expect(await section(sibling.mainLineId)).toEqual(siblingBefore);
    expect(result.summary.modes.in_house.mismatches).toMatchObject([{ mainLineId: sibling.mainLineId }]);
    expect((await section(target.mainLineId)).payload).toEqual({ ...payload(true), modeCalculations: { ...payload(true).modeCalculations,
      in_house_labor: settings(31000, 2500, 3500), in_house_material: settings(71000, 2000, 3000) } });
  });

  it.each(["pmc", "sub_vendor"] as const)("fills blank current %s margins while preserving bulk skip behavior and absent calculators", async (mode) => {
    const { basket, sub, target } = await fixture();
    const blank = await base.item.createMainLine(actor, basket.id, { name: "Blank current main line", subBasketId: sub.id });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes[mode].mismatches.map(({ mainLineId }) => mainLineId)).toEqual([target.mainLineId]);
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode, versionToken: summary.versionToken, targetMainLineId: blank.mainLineId });
    expect(result.updatedMainLineIds).toEqual([blank.mainLineId]);
    const saved = await section(blank.mainLineId);
    expect(saved.applicability).toBe("configured");
    expect(saved.payload).toEqual(mode === "pmc" ? { pmcMinimumMarginBps: 1200, pmcMarginBps: 1800 } : { subVendorMinimumMarginBps: 1500, subVendorMarginBps: 2500 });
    expect(result.summary.modes[mode].mismatches.map(({ mainLineId }) => mainLineId)).toEqual([target.mainLineId]);
    expect((await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode, versionToken: result.summary.versionToken, targetMainLineId: blank.mainLineId })).updatedMainLineIds).toEqual([]);
  });

  it("validates exact current membership before no-op and leaves the source unchanged", async () => {
    const { basket, sub, source } = await fixture();
    const otherSub = await base.reference.createSubBasket(actor, basket.id, { name: "Walls" });
    const foreign = await create(basket.id, otherSub.id, "Foreign line");
    const archived = await create(basket.id, sub.id, "Archived line");
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: archived.mainLineId }, { $set: { status: "archived" } });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const before = await section(source.mainLineId);
    for (const targetMainLineId of ["missing-main-line", foreign.mainLineId, archived.mainLineId]) {
      await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken, targetMainLineId })).rejects.toMatchObject({ status: 404 });
    }
    expect((await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken, targetMainLineId: source.mainLineId })).updatedMainLineIds).toEqual([]);
    expect(await section(source.mainLineId)).toEqual(before);
  });

  it("creates a draft only for the current active target, preserving published history and its siblings", async () => {
    const { basket, sub, target } = await fixture();
    const sibling = await create(basket.id, sub.id, "Other mismatch");
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.draftRevisionId }, { $set: { status: "active", contentDigest: "historic-target" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status: "active", activeRevisionId: target.draftRevisionId, draftRevisionId: null } });
    const before = await AiEstimatorKnowledgeSectionModel.find({ revisionId: target.draftRevisionId }).sort({ _id: 1 }).lean();
    const siblingBefore = await section(sibling.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken, targetMainLineId: target.mainLineId });
    expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
    const after = await base.item.getItem(actor, target.mainLineId);
    expect(after.activeRevisionId).toBe(target.draftRevisionId);
    expect(after.draftRevisionId).toBeTruthy();
    expect(after.draftRevisionId).not.toBe(target.draftRevisionId);
    expect(await AiEstimatorKnowledgeSectionModel.find({ revisionId: target.draftRevisionId }).sort({ _id: 1 }).lean()).toEqual(before);
    expect(await section(sibling.mainLineId)).toEqual(siblingBefore);
  });

  it.each(["root", "scoped"])("preserves a %s legacy target and blocks unsafe defaults without writes", async (kind) => {
    const { basket, sub, source, target } = await fixture();
    const single = settings(45678, 1000, 2000);
    const legacy = kind === "root" ? { modeCalculation: single } : { modeCalculations: { pmc: null, sub_vendor: settings(98765, 1000, 2000), in_house: single } };
    const targetSection = await section(target.mainLineId);
    await base.item.updateSection(actor, target.mainLineId, target.draftRevisionId!, "advanced", { expectedVersion: targetSection.version, payload: legacy });
    const asymmetric = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const before = await snapshot();
    expect(asymmetric.modes.in_house.mismatches[0]?.blockedReason).toMatch(kind === "root" ? /Save scoped In-house cost settings first/ : /default labor and material margins differ/);
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: asymmetric.versionToken, targetMainLineId: target.mainLineId }))
      .rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE", message: expect.stringMatching(kind === "root" ? /Save scoped In-house cost settings first/ : /default labor and material margins differ/) });
    expect(await snapshot()).toEqual(before);
    const sourceSection = await section(source.mainLineId);
    const original = payload();
    await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", { expectedVersion: sourceSection.version,
      payload: { ...original, modeCalculations: { ...original.modeCalculations, in_house_material: settings(51000, 2500, 3500) } } });
    const reviewed = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    if (kind === "root") {
      const beforeEqualDefaults = await snapshot();
      expect(reviewed.modes.in_house.mismatches[0]?.blockedReason).toMatch(/Save scoped In-house cost settings first/);
      await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: reviewed.versionToken, targetMainLineId: target.mainLineId }))
        .rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE", message: expect.stringMatching(/Save scoped In-house cost settings first/) });
      expect(await snapshot()).toEqual(beforeEqualDefaults);
      return;
    }
    await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: reviewed.versionToken, targetMainLineId: target.mainLineId });
    expect((await section(target.mainLineId)).payload).toEqual({ ...legacy, modeCalculations: {
      pmc: null, sub_vendor: settings(98765, 1000, 2000), in_house: settings(45678, 2500, 3500)
    } });
  });

  it("repairs blank current In-house margins only when both saved costs exist", async () => {
    const { basket, sub, target } = await fixture();
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" }, { $unset: { "payload.modeCalculations.in_house_labor.minimumMarkupBps": "" } });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.in_house.mismatchCount).toBe(0);
    await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken, targetMainLineId: target.mainLineId });
    expect((await section(target.mainLineId)).payload).toHaveProperty("modeCalculations.in_house_labor", settings(31000, 2500, 3500));
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" }, { $set: { "payload.modeCalculations.in_house_material": null } });
    const missing = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const before = await snapshot();
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: missing.versionToken, targetMainLineId: target.mainLineId })).rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE" });
    expect(await snapshot()).toEqual(before);
  });
});

describe("Sub-Basket first-main-line margins", { timeout: 30_000 }, () => {
  it("compares and applies independent component defaults by basket/Sub-basket while skipping blank and unmatched components", async () => {
    const { basket, sub, source, target } = await fixture();
    const otherBasket = await base.reference.createBasket(actor, { name: "Finishes" });
    const other = await base.reference.createSubBasket(actor, otherBasket.id, { name: "Painting" });
    const blank = await base.reference.createSubBasket(actor, otherBasket.id, { name: "Not configured" });
    const extra = await base.reference.createSubBasket(actor, otherBasket.id, { name: "Additional finish" });
    const component = (id: string, basketId: string, subBasketId: string, rate: number, minimum: number, starting: number) => ({
      id, basketId, subBasketId, inclusions: [], exclusions: [], labor: settings(rate, minimum, starting), material: settings(rate + 1000, minimum + 500, starting + 500)
    });
    const sourceComponents = [component("source-own", basket.id, sub.id, 10000, 2000, 3000), component("source-other", otherBasket.id, other.id, 20000, 1000, 2000),
      { ...component("source-blank", otherBasket.id, blank.id, 30000, 1500, 2500), labor: null, material: null }];
    const targetComponents = [component("target-other", otherBasket.id, other.id, 40000, 0, 500), component("target-own", basket.id, sub.id, 50000, 1000, 1500),
      { ...component("target-blank", otherBasket.id, blank.id, 60000, 2000, 3000), material: null }, component("target-extra", otherBasket.id, extra.id, 70000, 0, 500)];
    for (const [item, components] of [[source, sourceComponents], [target, targetComponents]] as const) {
      const current = await section(item.mainLineId);
      await base.item.updateSection(actor, item.mainLineId, item.draftRevisionId!, "advanced", { expectedVersion: current.version, payload: { ...current.payload, inHouseComponents: components } });
    }
    const before = await section(target.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.in_house).toMatchObject({ mismatchCount: 1, canApply: true, mismatches: [{ mainLineId: target.mainLineId }] });
    expect(summary.modes.in_house.ranges).toHaveLength(4);
    expect(summary.modes.in_house.ranges[2]?.component?.name).toBe("Finishes / Painting");
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken });
    expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
    expect(result.summary.modes.in_house.mismatchCount).toBe(0);
    expect((await section(target.mainLineId)).payload).toEqual({ ...before.payload, inHouseComponents: [
      { ...targetComponents[0], labor: settings(40000, 1000, 2000), material: settings(41000, 1500, 2500) },
      { ...targetComponents[1], labor: settings(50000, 2000, 3000), material: settings(51000, 2500, 3500) },
      targetComponents[2], targetComponents[3]
    ] });
  });

  it("counts and resets a temporary item's 20–30 Sub-vendor margin against the active first line's 20–35 default", async () => {
    const basket = await base.reference.createBasket(actor, { name: "POP / Gypsum" });
    const sub = await base.reference.createSubBasket(actor, basket.id, { name: "na" });
    const source = await create(basket.id, sub.id, "POP false ceiling", { ...payload(), subVendorMinimumMarginBps: 2000, subVendorMarginBps: 3500 }, 1);
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: source.draftRevisionId }, { $set: { status: "active", contentDigest: "source-history" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: source.mainLineId }, { $set: { status: "active", activeRevisionId: source.draftRevisionId, draftRevisionId: null } });
    const temporaryPayload = { ...payload(), subVendorMinimumMarginBps: 2000, subVendorMarginBps: 3000,
      modeCalculations: { ...payload().modeCalculations, sub_vendor: { ...settings(6500, 2500, 3500), lowQuantityLimit: "40", impactBps: 1500 } } };
    const temporary = await create(basket.id, sub.id, "Cove in Gypsum", temporaryPayload, 4, "temporary");
    const sourceBefore = await section(source.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.totalMainLines).toBe(2);
    expect(summary.modes.sub_vendor).toMatchObject({ ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 3500 }],
      mismatchCount: 1, canApply: true,
      mismatches: [{ mainLineId: temporary.mainLineId, mainLineName: "Cove in Gypsum", ranges: [{ key: "margin", minimumBps: 2000, maximumBps: 3000 }] }] });
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "sub_vendor", versionToken: summary.versionToken });
    expect(result.updatedMainLineIds).toEqual([temporary.mainLineId]);
    expect(result.summary.modes.sub_vendor.mismatchCount).toBe(0);
    expect((await section(temporary.mainLineId)).payload).toEqual({ ...temporaryPayload, subVendorMarginBps: 3500 });
    expect((await base.item.getItem(actor, temporary.mainLineId)).itemType).toBe("temporary");
    expect(await section(source.mainLineId)).toEqual(sourceBefore);
  });

  it("uses a temporary first item's saved defaults in the same order as the index", async () => {
    const basket = await base.reference.createBasket(actor, { name: "Temporary-first basket" });
    const sub = await base.reference.createSubBasket(actor, basket.id, { name: "Ceilings" });
    const first = await create(basket.id, sub.id, "First temporary item", payload(), 1, "temporary");
    const second = await create(basket.id, sub.id, "Second estimation item", payload(true), 2);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary).toMatchObject({ source: { mainLineId: first.mainLineId }, totalMainLines: 2,
      modes: { sub_vendor: { mismatchCount: 1, mismatches: [{ mainLineId: second.mainLineId }] } } });
  });

  it("uses canonical first order across the full scope, includes temporary lines, and excludes archived lines and other baskets", async () => {
    const { basket, sub, source } = await fixture();
    for (let i = 0; i < 21; i++) await create(basket.id, sub.id, `Extra ${i}`, payload(true));
    await create(basket.id, sub.id, "Temporary line", payload(true), 30, "temporary");
    const archived = await create(basket.id, sub.id, "Earlier archived", payload(true), 0);
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: archived.mainLineId }, { $set: { status: "archived", archivedAt: new Date(), archivedById: actor.id } });
    const foreignBasket = await base.reference.createBasket(actor, { name: "Asymmetric walls" });
    const foreignSub = await base.reference.createSubBasket(actor, foreignBasket.id, { name: "POP" });
    await create(foreignBasket.id, foreignSub.id, "Foreign first", payload(true), 0);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary).toMatchObject({ source: { mainLineId: source.mainLineId }, totalMainLines: 24,
      modes: { pmc: { mismatchCount: 23, canApply: true }, sub_vendor: { mismatchCount: 23 }, in_house: { mismatchCount: 23 } } });
    const listed = await base.item.listItems(actor, { basketId: basket.id }, { limit: 100, offset: 0 });
    expect(listed.items[0]!.mainLineId).toBe(source.mainLineId);
    await expect(base.item.getSubBasketMargins(actor, foreignBasket.id, sub.id)).rejects.toMatchObject({ status: 404 });
  });

  it("applies only PMC margins, preserving other saved settings and matching/source versions", async () => {
    const { basket, sub, source, target } = await fixture();
    const matched = await create(basket.id, sub.id, "Already matched", payload());
    const before = await section(target.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken });
    expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
    expect(result.summary.modes.pmc.mismatchCount).toBe(0);
    expect((await section(target.mainLineId)).payload).toEqual({ ...before.payload, pmcMinimumMarginBps: 1200, pmcMarginBps: 1800 });
    expect((await base.item.getItem(actor, source.mainLineId)).version).toBe(source.version);
    expect((await base.item.getItem(actor, matched.mainLineId)).version).toBe(matched.version);
    expect(result.summary.modes.sub_vendor.mismatchCount).toBe(1);
    expect(await AuditEventModel.findOne({ action: "ai_estimator_knowledge_section_updated", "newValues.marginDefaults.subBasketId": sub.id }).lean())
      .toMatchObject({ actorId: actor.id, newValues: { marginDefaults: { mode: "pmc", sourceMainLineId: source.mainLineId, sourceRevisionId: source.draftRevisionId } } });
    const retry = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: result.summary.versionToken });
    expect(retry.updatedMainLineIds).toEqual([]);
  });

  it("copies legacy single Sub-vendor zero margins as an explicit zero range", async () => {
    const { basket, sub, source, target } = await fixture();
    const current = await section(source.mainLineId);
    const next = { ...current.payload, subVendorMarginBps: 0 };
    delete next.subVendorMinimumMarginBps;
    await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", { expectedVersion: current.version, payload: next });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.sub_vendor.ranges).toEqual([{ key: "margin", minimumBps: 0, maximumBps: 0 }]);
    await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "sub_vendor", versionToken: summary.versionToken });
    expect((await section(target.mainLineId)).payload).toMatchObject({ subVendorMinimumMarginBps: 0, subVendorMarginBps: 0, pmcMinimumMarginBps: 1000, pmcMarginBps: 1500 });
  });

  it("copies separate labor/material margins while preserving target rates, quantity limits and other modes", async () => {
    const { basket, sub, target } = await fixture();
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken });
    expect((await section(target.mainLineId)).payload).toEqual({ ...payload(true), modeCalculations: {
      ...payload(true).modeCalculations,
      in_house_labor: settings(31000, 2500, 3500), in_house_material: settings(71000, 2000, 3000)
    } });
  });

  it("creates a draft for an active-only target and leaves active revision and section history intact", async () => {
    const { basket, sub, target } = await fixture();
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.draftRevisionId }, { $set: { status: "active", contentDigest: "historic-digest" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status: "active", activeRevisionId: target.draftRevisionId, draftRevisionId: null } });
    const activeBefore = await AiEstimatorKnowledgeRevisionModel.findById(target.draftRevisionId).lean();
    const sectionsBefore = await AiEstimatorKnowledgeSectionModel.find({ revisionId: target.draftRevisionId }).sort({ _id: 1 }).lean();
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken });
    const after = await base.item.getItem(actor, target.mainLineId);
    expect(after.activeRevisionId).toBe(target.draftRevisionId);
    expect(after.draftRevisionId).not.toBe(target.draftRevisionId);
    expect(after.draftRevisionId).toBeTruthy();
    expect(await AiEstimatorKnowledgeRevisionModel.findById(target.draftRevisionId).lean()).toEqual(activeBefore);
    expect(await AiEstimatorKnowledgeSectionModel.find({ revisionId: target.draftRevisionId }).sort({ _id: 1 }).lean()).toEqual(sectionsBefore);
    expect((await section(target.mainLineId)).payload).toMatchObject({ pmcMinimumMarginBps: 1200, pmcMarginBps: 1800 });
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_revision_created" })).toBeGreaterThan(0);
  });

  it("prefers saved draft margins and never falls back to an active revision or later configured line", async () => {
    const { basket, sub, source } = await fixture();
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: source.draftRevisionId }, { $set: { status: "active", contentDigest: "historic-source" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: source.mainLineId }, { $set: { activeRevisionId: source.draftRevisionId, draftRevisionId: null, status: "active" } });
    const draft = await base.item.createRevision(actor, source.mainLineId, { expectedVersion: source.version });
    const current = await section(source.mainLineId);
    await base.item.updateSection(actor, source.mainLineId, draft.draftRevisionId!, "advanced", { expectedVersion: current.version, payload: {} });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.source?.mainLineId).toBe(source.mainLineId);
    for (const mode of ["pmc", "sub_vendor", "in_house"] as const) expect(summary.modes[mode]).toMatchObject({ mismatchCount: null, canApply: false });
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken })).rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE" });
  });

  it.each(["main_line", "temporary"] as const)("skips unsaved and empty saved %s margins when counting and applying each mode", async (itemType) => {
    const { basket, sub, target } = await fixture();
    const unsaved = await base.item.createMainLine(actor, basket.id, { name: "Not saved", subBasketId: sub.id, itemType });
    const empty = await create(basket.id, sub.id, "Saved without margins", {}, undefined, itemType);
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: empty.draftRevisionId }, { $set: { status: "active", contentDigest: "empty-active" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: empty.mainLineId }, { $set: { status: "active", activeRevisionId: empty.draftRevisionId, draftRevisionId: null } });
    const descriptionOnly = await create(basket.id, sub.id, "Only a description", { modeDescription: "No margin configuration" }, undefined, itemType);
    const skippedIds = [unsaved.mainLineId, empty.mainLineId, descriptionOnly.mainLineId];
    const skippedBefore = await AiEstimatorKnowledgeSectionModel.find({ mainLineId: { $in: skippedIds } }).sort({ _id: 1 }).lean();
    const skippedLinesBefore = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: skippedIds } }).select({ version: 1, draftRevisionId: 1, activeRevisionId: 1 }).sort({ _id: 1 }).lean();
    const skippedRevisionsBefore = await AiEstimatorKnowledgeRevisionModel.find({ mainLineId: { $in: skippedIds } }).sort({ _id: 1 }).lean();
    for (const mode of ["pmc", "sub_vendor", "in_house"] as const) {
      const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
      expect(summary.modes[mode]).toMatchObject({ mismatchCount: 1, canApply: true,
        mismatches: [{ mainLineId: target.mainLineId }] });
      const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode, versionToken: summary.versionToken });
      expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
      expect(result.summary.modes[mode]).toMatchObject({ mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null });
    }
    expect(await AiEstimatorKnowledgeSectionModel.find({ mainLineId: { $in: skippedIds } }).sort({ _id: 1 }).lean()).toEqual(skippedBefore);
    expect(await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: skippedIds } }).select({ version: 1, draftRevisionId: 1, activeRevisionId: 1 }).sort({ _id: 1 }).lean()).toEqual(skippedLinesBefore);
    expect(await AiEstimatorKnowledgeRevisionModel.find({ mainLineId: { $in: skippedIds } }).sort({ _id: 1 }).lean()).toEqual(skippedRevisionsBefore);
  });

  it("compares configured modes independently and skips partial Sub-vendor and In-house margins", async () => {
    const { basket, sub, target } = await fixture();
    const incomplete = await create(basket.id, sub.id, "Incomplete", { pmcMarginBps: 1000 });
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: incomplete.mainLineId, sectionKey: "advanced" }, {
      $set: { "payload.subVendorMinimumMarginBps": 2000, "payload.subVendorMarginBps": null,
        "payload.modeCalculations": { ...payload().modeCalculations, in_house_material: null } }
    });
    const incompleteBefore = await section(incomplete.mainLineId);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.pmc).toMatchObject({ mismatchCount: 2, canApply: false });
    expect(summary.modes.pmc.mismatches.find(({ mainLineId }) => mainLineId === incomplete.mainLineId)?.blockedReason).toMatch(/validation/);
    for (const mode of ["sub_vendor", "in_house"] as const) {
      expect(summary.modes[mode]).toMatchObject({ mismatchCount: 1, canApply: true, mismatches: [{ mainLineId: target.mainLineId }] });
    }
    const result = await base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken });
    expect(result.updatedMainLineIds).toEqual([target.mainLineId]);
    expect(result.summary.modes.in_house.mismatchCount).toBe(0);
    expect(await section(incomplete.mainLineId)).toEqual(incompleteBefore);
  });

  it("skips a target's unconfigured current draft until margins are saved, without falling back to its active revision", async () => {
    const { basket, sub, target } = await fixture();
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.draftRevisionId }, { $set: { status: "active", contentDigest: "historic-target" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { activeRevisionId: target.draftRevisionId, draftRevisionId: null, status: "active" } });
    const draft = await base.item.createRevision(actor, target.mainLineId, { expectedVersion: target.version });
    const current = await section(target.mainLineId);
    await base.item.updateSection(actor, target.mainLineId, draft.draftRevisionId!, "advanced", { expectedVersion: current.version, payload: {} });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    for (const mode of ["pmc", "sub_vendor", "in_house"] as const) {
      expect(summary.modes[mode]).toMatchObject({ mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null });
    }
    const blank = await section(target.mainLineId);
    await base.item.updateSection(actor, target.mainLineId, draft.draftRevisionId!, "advanced", {
      expectedVersion: blank.version, payload: { subVendorMinimumMarginBps: 0, subVendorMarginBps: 0 }
    });
    const saved = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(saved.modes.sub_vendor).toMatchObject({ mismatchCount: 1, canApply: true,
      mismatches: [{ mainLineId: target.mainLineId, ranges: [{ key: "margin", minimumBps: 0, maximumBps: 0 }] }] });
    expect(saved.modes.pmc.mismatchCount).toBe(0);
    expect(saved.modes.in_house.mismatchCount).toBe(0);
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "sub_vendor", versionToken: summary.versionToken })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it.each(["malformed", "missing"])("preserves %s unrelated calculation fields and blocks their repair during an In-house apply", async (kind) => {
    const { basket, sub, target } = await fixture();
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" }, {
      ...(kind === "malformed" ? { $set: { "payload.modeCalculations.pmc": "invalid legacy PMC" } } : { $unset: { "payload.modeCalculations.pmc": "" } })
    });
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    expect(summary.modes.in_house).toMatchObject({ mismatchCount: 1, canApply: false });
    expect(summary.modes.in_house.mismatches[0]?.blockedReason).toMatch(/validation/);
    const before = await snapshot();
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: summary.versionToken })).rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE" });
    expect(await snapshot()).toEqual(before);
  });

  it.each(["not_applicable", "not_configured", "missing_section", "missing_revision", "no_revision"] as const)("skips a %s target when comparing saved margins", async (state) => {
    const { basket, sub, target } = await fixture();
    if (state === "missing_section") await AiEstimatorKnowledgeSectionModel.deleteOne({ mainLineId: target.mainLineId, sectionKey: "advanced" });
    else if (state === "missing_revision") await AiEstimatorKnowledgeRevisionModel.deleteOne({ _id: target.draftRevisionId });
    else if (state === "no_revision") await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { draftRevisionId: null } });
    else await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" }, { $set: { applicability: state } });
    const before = await snapshot();
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    for (const mode of ["pmc", "sub_vendor", "in_house"] as const) {
      expect(summary.modes[mode]).toMatchObject({ mismatchCount: 0, mismatches: [], canApply: false, unavailableReason: null });
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each(["source", "target", "membership"] as const)("rejects a stale review after %s changes without writes", async (change) => {
    const { basket, sub, source, target } = await fixture();
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    if (change === "membership") await create(basket.id, sub.id, "New line");
    else {
      const item = change === "source" ? source : target;
      const current = await section(item.mainLineId);
      await base.item.updateSection(actor, item.mainLineId, item.draftRevisionId!, "advanced", { expectedVersion: current.version, payload: { ...current.payload, modeDescription: "Changed after review" } });
    }
    const before = await snapshot();
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back every target and audit when a later target audit fails", async () => {
    const { basket, sub } = await fixture();
    await create(basket.id, sub.id, "Third line");
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const before = await snapshot();
    let saves = 0;
    const failing = harness({ appendInMongoTransaction: async (...args) => {
      if (args[0].action === "ai_estimator_knowledge_section_updated" && ++saves === 2) throw new Error("Synthetic audit failure");
      return base.audit.appendInMongoTransaction(...args);
    } });
    await expect(failing.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: summary.versionToken })).rejects.toThrow("Synthetic audit failure");
    expect(await snapshot()).toEqual(before);
  });

  it("permits only one of two concurrent applications of the same reviewed snapshot", async () => {
    const { basket, sub } = await fixture();
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const results = await Promise.allSettled(["pmc", "sub_vendor"].map((mode) => base.item.applySubBasketMargins(actor, basket.id, sub.id,
      { mode: mode as "pmc" | "sub_vendor", versionToken: summary.versionToken })));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
  });
});
