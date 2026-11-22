import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MarginChange, MarginDecision, MarginEditField, MarginMatrix } from "../src/contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { AiEstimatorKnowledgeMarginOperationModel } from "../src/models/AiEstimatorKnowledgeMarginOperation.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { UserModel } from "../src/models/User.js";
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
const models = [AuditEventModel, AiEstimatorKnowledgeMarginOperationModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
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
// Seed saved sections as they existed before Sub-Baskets owned margin baselines.
async function legacyMode(mainLineId: string, revisionId: string, content: Record<string, unknown>) {
  await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId, revisionId, sectionKey: "advanced" }, {
    $set: { applicability: Object.keys(content).length ? "configured" : "not_configured", payload: content }, $inc: { version: 1 }
  });
}
async function create(basketId: string, subBasketId: string, name: string, content: Record<string, unknown> = payload(true), displayOrder?: number, itemType: "main_line" | "temporary" = "main_line") {
  const item = await base.item.createMainLine(actor, basketId, { name, subBasketId, displayOrder, itemType });
  await legacyMode(item.mainLineId, item.draftRevisionId!, content);
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

  it.each(["default", "premium"] as const)("reads selected %s settings from the first main line without changing Signature defaults", async (modeTier) => {
    const { basket, sub, source, target } = await fixture();
    const premium = { ...payload(), pmcMinimumMarginBps: 1500, pmcMarginBps: 2000,
      subVendorMinimumMarginBps: 3000, subVendorMarginBps: 4500,
      modeCalculations: { ...payload().modeCalculations, in_house_labor: settings(46000, 1500, 4500) } };
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: source.mainLineId, sectionKey: "advanced" },
      { $set: { [`payload.tierConfigurations.${modeTier}`]: { applicability: "configured", payload: premium } } });
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" },
      { $set: { [`payload.tierConfigurations.${modeTier}`]: { applicability: "configured", payload: payload(true) } } });
    const before = await snapshot();
    const signature = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const selected = await base.item.getSubBasketMargins(actor, basket.id, sub.id, modeTier);
    expect(selected.source).toEqual(signature.source);
    expect(selected.source?.mainLineId).toBe(source.mainLineId);
    expect(selected.modes.pmc.ranges).toEqual([{ key: "margin", minimumBps: 1500, maximumBps: 2000 }]);
    expect(selected.modes.sub_vendor.ranges).toEqual([{ key: "margin", minimumBps: 3000, maximumBps: 4500 }]);
    expect(selected.modes.pmc.mismatches).toMatchObject([{ mainLineId: target.mainLineId }]);
    expect(selected.sourceConfiguration?.modes.in_house.calculations[0]?.baseRatePaise).toBe(46000);
    expect(signature.modes.pmc.ranges).toEqual([{ key: "margin", minimumBps: 1200, maximumBps: 1800 }]);
    expect(selected.versionToken).not.toBe(signature.versionToken);
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "pmc", versionToken: selected.versionToken }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await snapshot()).toEqual(before);
  });

  it.each(["default", "premium", "functional"] as const)("keeps an empty first-line %s tier empty instead of falling back to Signature or the next line", async (modeTier) => {
    const { basket, sub, source, target } = await fixture();
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" },
      { $set: { [`payload.tierConfigurations.${modeTier}`]: { applicability: "configured", payload: payload() } } });
    const selected = await base.item.getSubBasketMargins(actor, basket.id, sub.id, modeTier);
    expect(selected.source?.mainLineId).toBe(source.mainLineId);
    expect(selected.sourceConfiguration).toBeNull();
    for (const mode of ["pmc", "sub_vendor", "in_house"] as const) {
      expect(selected.modes[mode]).toMatchObject({ mismatchCount: null, mismatches: [], canApply: false });
      expect(selected.modes[mode].ranges.every(range => range.minimumBps === null && range.maximumBps === null)).toBe(true);
    }
  });

  it("uses the selected tier's applicability independently of the Signature section", async () => {
    const { basket, sub, source } = await fixture();
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: source.mainLineId, sectionKey: "advanced" },
      { $set: { applicability: "not_applicable", "payload.tierConfigurations.functional": { applicability: "configured", payload: payload() } } });
    const selected = await base.item.getSubBasketMargins(actor, basket.id, sub.id, "functional");
    expect(selected.sourceConfiguration?.revisionId).toBe(source.draftRevisionId);
    expect(selected.modes.pmc.mismatchCount).toBe(0);
    expect((await base.item.getSubBasketMargins(actor, basket.id, sub.id)).modes.pmc.mismatchCount).toBeNull();
  });

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
    await legacyMode(source.mainLineId, source.draftRevisionId!, { ...current.payload, inHouseComponents: [{ id: "blank-component", basketId: basket.id, subBasketId: sub.id, inclusions: [], exclusions: [], labor: null, material: null }] });
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
    await legacyMode(target.mainLineId, target.draftRevisionId!, legacy);
    const asymmetric = await base.item.getSubBasketMargins(actor, basket.id, sub.id);
    const before = await snapshot();
    expect(asymmetric.modes.in_house.mismatches[0]?.blockedReason).toMatch(kind === "root" ? /Save scoped In-house cost settings first/ : /default labor and material margins differ/);
    await expect(base.item.applySubBasketMargins(actor, basket.id, sub.id, { mode: "in_house", versionToken: asymmetric.versionToken, targetMainLineId: target.mainLineId }))
      .rejects.toMatchObject({ code: "SUB_BASKET_MARGINS_UNAVAILABLE", message: expect.stringMatching(kind === "root" ? /Save scoped In-house cost settings first/ : /default labor and material margins differ/) });
    expect(await snapshot()).toEqual(before);
    const original = payload();
    await legacyMode(source.mainLineId, source.draftRevisionId!, { ...original, modeCalculations: { ...original.modeCalculations, in_house_material: settings(51000, 2500, 3500) } });
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
      await legacyMode(item.mainLineId, item.draftRevisionId!, { ...current.payload, inHouseComponents: components });
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
    await legacyMode(source.mainLineId, source.draftRevisionId!, next);
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
    await legacyMode(source.mainLineId, draft.draftRevisionId!, {});
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

describe("Sub-Basket margin decisions", { timeout: 30_000 }, () => {
  const premium = { tier: "premium", mode: "sub_vendor" } as const;
  const pair = (maximumBps: number) => [{ key: "margin" as const, minimumBps: 2000, maximumBps }];
  const edit = (...changes: MarginChange[]): MarginDecision => ({ kind: "edit", changes });
  const approve = (mainLineId: string): MarginDecision => ({ kind: "approve", candidate: { ...premium, mainLineId } });

  async function review(matrix: MarginMatrix, decision: MarginDecision, operationId: string) {
    const command = { versionToken: matrix.versionToken, decision };
    const preview = await base.item.previewMarginDecision(actor, matrix.basketId, matrix.subBasketId, command);
    return { preview, input: { ...command, reviewToken: preview.reviewToken, operationId } };
  }

  async function tiersFixture() {
    const { basket, sub, source, target } = await fixture();
    const competitor = await create(basket.id, sub.id, "Temporary competitor", payload(true), 3, "temporary");
    for (const [line, max] of [[source, 3000], [target, 3000], [competitor, 4000]] as const) {
      const saved = await section(line.mainLineId);
      const tiers = Object.fromEntries([["premium", max], ["functional", 2500], ["default", 5000]].map(([tier, maximum]) => [
        tier, { applicability: "configured", payload: { ...payload(), subVendorMinimumMarginBps: 2000, subVendorMarginBps: maximum } }
      ]));
      await legacyMode(line.mainLineId, line.draftRevisionId!, { ...saved.payload, tierConfigurations: tiers });
    }
    return { basket, sub, source, target, competitor };
  }

  async function savePremium(line: Awaited<ReturnType<typeof create>>, maximum: number) {
    const current = await base.item.getSection(actor, line.mainLineId, line.draftRevisionId!, "advanced", "premium");
    return base.item.updateSection(actor, line.mainLineId, line.draftRevisionId!, "advanced", {
      modeTier: "premium", expectedVersion: current.version, payload: { ...current.payload, subVendorMarginBps: maximum }
    });
  }

  async function savedModePayload(mainLineId: string, revisionId?: string) {
    const item = await base.item.getItem(actor, mainLineId);
    const section = await AiEstimatorKnowledgeSectionModel.findOne({
      mainLineId, revisionId: revisionId ?? item.draftRevisionId ?? item.activeRevisionId, sectionKey: "advanced"
    }).lean().exec();
    if (!section) throw new Error("Missing saved Mode section");
    return section.payload;
  }

  it("counts saved field edits only, preserves independent pending scopes, and never promotes a copied or legacy difference", async () => {
    const { basket, sub, source, competitor } = await tiersFixture();
    const read = () => base.item.getMarginMatrix(actor, basket.id, sub.id);
    const save = async (changes: Record<string, unknown>, hints: MarginEditField[]) => {
      const current = await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", "premium");
      return base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", {
        modeTier: "premium", expectedVersion: current.version, payload: { ...current.payload, ...changes }, marginEdits: hints
      });
    };
    const vendorMax = { mode: "sub_vendor", key: "margin", bound: "maximumBps" } as const;
    const pmcMax = { mode: "pmc", key: "margin", bound: "maximumBps" } as const;
    expect((await read()).exceptions).toEqual([]);
    await expect(review(await read(), approve(competitor.mainLineId), "historic-mismatch")).rejects.toMatchObject({ code: "MARGIN_EXCEPTION_UNAVAILABLE" });

    await save({ modeDescription: "Description only" }, [vendorMax]);
    expect((await read()).exceptions).toEqual([]);
    await save({ modeDescription: "Mixed save", subVendorMarginBps: 3500, pmcMarginBps: 1600 }, [vendorMax, pmcMax]);
    const after = await read();
    expect(after.exceptions).toHaveLength(2);
    const sourceNow = await base.item.getItem(actor, source.mainLineId);
    const copied = await base.item.duplicate(actor, source.mainLineId, { expectedVersion: sourceNow.version, name: "Copied differing ceiling" });
    const latest = await read();
    expect(latest.exceptions).toEqual(after.exceptions);
    await expect(review(latest, approve(copied.mainLineId), "copied")).rejects.toMatchObject({ code: "MARGIN_EXCEPTION_UNAVAILABLE" });
    await save({ subVendorMarginBps: 4000 }, [vendorMax]);
    await save({ modeDescription: "Unrelated later save" }, []);
    expect((await read()).exceptions).toHaveLength(2);
    await save({ subVendorMarginBps: 3000 }, [vendorMax]);
    expect((await read()).exceptions.map(entry => entry.mode)).toEqual(["pmc"]);
    await save({ subVendorMarginBps: 3500 }, [vendorMax]);
    const { input } = await review(await read(), approve(source.mainLineId), "one-pending-scope");
    const beforeFailure = await snapshot();
    const failing = harness({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "ai_estimator_knowledge_sub_basket_margin_exception_approved") throw new Error("Injected pending approval failure");
      return base.audit.appendInMongoTransaction(event, session);
    } });
    await expect(failing.item.commitMarginDecision(actor, basket.id, sub.id, input)).rejects.toThrow("Injected pending approval failure");
    expect(await snapshot()).toEqual(beforeFailure);
    await base.item.commitMarginDecision(actor, basket.id, sub.id, input);
    expect((await read()).exceptions).toMatchObject([{ mainLineId: source.mainLineId, tier: "premium", mode: "pmc" }]);
    const stored = await AiEstimatorKnowledgeMainLineModel.findById(source.mainLineId).lean();
    expect(stored!.pendingMarginEdits).toMatchObject([{ mode: "pmc", actorId: actor.id }]);
    expect((await base.item.getSubBasketMargins(actor, basket.id, sub.id, "premium")).exceptions).toEqual((await read()).exceptions);
  });

  it("keeps an established first-line default when percentages are generated by a non-margin save", async () => {
    const { basket, sub, source } = await tiersFixture();
    const current = await base.item.getSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", "premium");
    await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", {
      modeTier: "premium", expectedVersion: current.version, marginEdits: [],
      payload: { ...current.payload, modeDescription: "Configured without touching a margin", subVendorMarginBps: 3500 }
    });
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(matrix.defaults).toContainEqual(expect.objectContaining({ ...premium, ranges: pair(3000) }));
    expect(matrix.exceptions).toEqual([]);
    const comparison = await base.item.getSubBasketMargins(actor, basket.id, sub.id, "premium");
    expect(comparison.modes.sub_vendor.mismatches).toContainEqual(expect.objectContaining({ mainLineId: source.mainLineId, ranges: pair(3500) }));
  });

  it("recovers only proven legacy edits using one audit read and keeps other tiers on first new write", async () => {
    const { basket, sub, source, competitor } = await tiersFixture();
    const saved = await section(competitor.mainLineId);
    // Simulate a legacy controller which did not store a per-line pending record.
    await AiEstimatorKnowledgeMainLineModel.updateMany({ basketId: basket.id }, { $unset: { pendingMarginEdits: "" } });
    const raw = (maximumBps: number) => [{ key: "margin", minimumBps: 2000, maximumBps }];
    await AuditEventModel.create({
      _id: "historic-manual", entityType: "ai_estimator_knowledge_section", entityId: saved.id, actorId: actor.id,
      action: "ai_estimator_knowledge_section_updated", occurredAt: new Date(),
      oldValues: { mainLineId: competitor.mainLineId, revisionId: competitor.draftRevisionId, sectionKey: "advanced" },
      newValues: { sectionVersion: saved.version, aggregateVersion: 2, basketId: basket.id, subBasketId: sub.id, modeTier: "premium",
        manualMarginChanges: [{ mode: "sub_vendor", before: raw(3000), after: raw(4000) }] }
    });
    const reader = vi.spyOn(AuditEventModel, "find");
    const before = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(before.exceptions).toMatchObject([{ mainLineId: competitor.mainLineId, ...premium }]);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ basketId: basket.id, pendingMarginEdits: { $exists: true } })).toBe(0);
    const functional = await base.item.getSection(actor, competitor.mainLineId, competitor.draftRevisionId!, "advanced", "functional");
    await base.item.updateSection(actor, competitor.mainLineId, competitor.draftRevisionId!, "advanced", {
      modeTier: "functional", expectedVersion: functional.version, payload: { ...functional.payload, pmcMarginBps: 1400 },
      marginEdits: [{ mode: "pmc", key: "margin", bound: "maximumBps" }]
    });
    const both = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(both.exceptions.map(entry => entry.tier)).toEqual(["premium", "functional"]);
    const record = await AiEstimatorKnowledgeMainLineModel.findById(competitor.mainLineId).lean();
    expect(record!.pendingMarginEdits).toHaveLength(2);
    expect((await base.item.getItem(actor, source.mainLineId)).version).toBe(source.version);
  });

  it("keeps historical component copies inspectable and rejects their promotion, even when both sides already had margins", async () => {
    const { basket, sub, source, target } = await fixture();
    const other = await base.reference.createSubBasket(actor, basket.id, { name: "Other component" });
    const first = { basketId: basket.id, subBasketId: sub.id };
    const second = { basketId: basket.id, subBasketId: other.id };
    const component = (id: string, identity: typeof first, maximum: number) => ({
      id, ...identity, inclusions: [], exclusions: [], labor: settings(10_000, 1500, maximum), material: settings(20_000, 2000, 4000)
    });
    const ranges = (identity: typeof first, maximum: number) => [
      { component: identity, key: "labor", minimumBps: 1500, maximumBps: maximum },
      { component: identity, key: "material", minimumBps: 2000, maximumBps: 4000 }
    ];
    await legacyMode(source.mainLineId, source.draftRevisionId!, { inHouseComponents: [
      component("first-source", first, 3000), component("second-source", second, 2500)
    ] });
    await legacyMode(target.mainLineId, target.draftRevisionId!, { inHouseComponents: [
      component("first-target", first, 3000), component("second-target", second, 3000)
    ] });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $unset: { pendingMarginEdits: "" } });
    const saved = await section(target.mainLineId);
    await AuditEventModel.create({
      _id: "historical-component-copy", actorId: actor.id, entityType: "ai_estimator_knowledge_section", entityId: saved.id,
      action: "ai_estimator_knowledge_section_updated", occurredAt: new Date(),
      oldValues: { mainLineId: target.mainLineId, revisionId: target.draftRevisionId, sectionKey: "advanced" },
      newValues: { basketId: basket.id, subBasketId: sub.id, modeTier: "signature", sectionVersion: saved.version, aggregateVersion: target.version,
        manualMarginChanges: [{ mode: "in_house", before: [...ranges(first, 3000), ...ranges(second, 2500)],
          after: [...ranges(first, 3000), ...ranges(second, 3000)] }] }
    });
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(matrix.exceptions).toEqual([]);
    const summary = await base.item.getSubBasketMargins(actor, basket.id, sub.id, "signature");
    expect(summary.exceptions).toEqual([]);
    expect(summary.modes.in_house.mismatches.map(entry => entry.mainLineId)).toContain(target.mainLineId);
    const decision = { kind: "approve", candidate: { mainLineId: target.mainLineId, tier: "signature", mode: "in_house", component: second } } as const;
    await expect(base.item.previewMarginDecision(actor, basket.id, sub.id, { decision, versionToken: matrix.versionToken }))
      .rejects.toMatchObject({ code: "MARGIN_EXCEPTION_UNAVAILABLE" });
    await expect(base.item.commitMarginDecision(actor, basket.id, sub.id, {
      decision, versionToken: matrix.versionToken, reviewToken: "a".repeat(64), operationId: "historical-copy"
    })).rejects.toMatchObject({ code: "MARGIN_EXCEPTION_UNAVAILABLE" });
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_margin_exception_approved" })).toBe(0);
  });

  it("loads the full matrix with one membership, revision, and Mode-section query regardless of tier count", async () => {
    const { basket, sub } = await tiersFixture();
    const lines = vi.spyOn(AiEstimatorKnowledgeMainLineModel, "find");
    const revisions = vi.spyOn(AiEstimatorKnowledgeRevisionModel, "find");
    const sections = vi.spyOn(AiEstimatorKnowledgeSectionModel, "find");
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(matrix.totalMainLines).toBe(3);
    expect(lines).toHaveBeenCalledTimes(1);
    expect(revisions).toHaveBeenCalledTimes(1);
    expect(sections).toHaveBeenCalledTimes(1);
  });

  it("rechecks the stored actor before exposing the matrix, committing, or returning an earlier receipt", async () => {
    const { basket, sub } = await tiersFixture();
    const secured = createAiEstimatorKnowledgeItemService({ audit: base.audit });
    const reader = { ...actor, id: "margin-reader", role: "procurement" as const };
    for (const user of [actor, reader]) {
      const email = user.id + "@example.invalid";
      await UserModel.create({ _id: user.id, name: user.name, email, emailNormalized: email, role: user.role, passwordHash: "unused-in-test", active: true });
    }
    const matrix = await secured.getMarginMatrix(actor, basket.id, sub.id);
    const { input } = await review(matrix, edit({ ...premium, ranges: pair(4000) }), "confirmed-operation");
    await expect(secured.getMarginMatrix(reader, basket.id, sub.id)).rejects.toMatchObject({ status: 403 });
    await expect(secured.commitMarginDecision(reader, basket.id, sub.id, input)).rejects.toMatchObject({ status: 403 });
    await expect(secured.commitMarginDecision({ ...actor, id: reader.id }, basket.id, sub.id, input)).rejects.toMatchObject({ status: 401 });
    await secured.commitMarginDecision(actor, basket.id, sub.id, input);
    await UserModel.updateOne({ _id: actor.id }, { $set: { active: false } });
    await expect(secured.commitMarginDecision(actor, basket.id, sub.id, input)).rejects.toMatchObject({ status: 401 });
  });

  it("keeps same-value edits separate from applying or approving a competing line", async () => {
    const { basket, sub } = await tiersFixture();
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    const { input } = await review(matrix, edit({ ...premium, ranges: pair(3000) }), "keep-current-default");
    const auditCount = await AuditEventModel.countDocuments();
    const result = await base.item.commitMarginDecision(actor, basket.id, sub.id, input);
    expect(result.updatedMainLineIds).toEqual([]);
    expect(await base.item.getMarginMatrix(actor, basket.id, sub.id)).toEqual(matrix);
    expect(await AuditEventModel.countDocuments()).toBe(auditCount);
    expect(await base.item.commitMarginDecision(actor, basket.id, sub.id, input)).toEqual({ ...result, alreadyApplied: true });
  });

  it("registers a first-line edit against its pre-edit default, then approves only that Premium margin across eligible lines", async () => {
    const { basket, sub, source, target, competitor } = await tiersFixture();
    const second = await base.reference.createSubBasket(actor, basket.id, { name: "Another ceiling" });
    const outsider = await create(basket.id, second.id, "Different line", payload(true));
    const outsideBefore = await section(outsider.mainLineId);
    const stale = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(stale.baselineVersion).toBe(0);
    await savePremium(source, 3500);
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(matrix.baselineVersion).toBe(1);
    expect(matrix.defaults).toContainEqual(expect.objectContaining({ ...premium, ranges: pair(3000), provenance: "existing" }));
    expect(matrix.exceptions).toContainEqual(expect.objectContaining({ ...premium, mainLineId: source.mainLineId, ranges: pair(3500) }));
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_margin_exception_approved" })).toBe(0);
    await expect(review(stale, approve(source.mainLineId), "stale")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    // An active-only sibling receives a draft; its original financial configuration remains byte-for-byte stable.
    await AiEstimatorKnowledgeSectionModel.updateOne({ mainLineId: target.mainLineId, sectionKey: "advanced" },
      { $set: { "payload.tierConfigurations.premium.payload.dependencies": [{ id: "historical-dependency",
        targetBasketId: basket.id, targetMainLineId: "removed-main-line", reason: "Historical dependency", active: false }] } });
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.draftRevisionId }, { $set: { status: "active", contentDigest: "immutable-approved" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status: "active", activeRevisionId: target.draftRevisionId, draftRevisionId: null } });
    const activeBefore = await savedModePayload(target.mainLineId);
    const fresh = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    const { preview, input } = await review(fresh, approve(source.mainLineId), "approve-premium");
    expect(preview.impacts).toHaveLength(1);
    expect(preview.impacts[0]).toMatchObject({ ...premium, previous: pair(3000), ranges: pair(3500), blockers: [] });
    expect(preview.impacts[0]!.competing).toContainEqual(expect.objectContaining({ mainLineId: competitor.mainLineId, ranges: pair(4000) }));
    const result = await base.item.commitMarginDecision(actor, basket.id, sub.id, input);
    expect(new Set(result.updatedMainLineIds)).toEqual(new Set([target.mainLineId, competitor.mainLineId]));
    const verified = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(verified.defaults).toContainEqual(expect.objectContaining({ ...premium, ranges: pair(3500), provenance: "approved" }));
    expect(verified.exceptions.filter(entry => entry.tier === "premium" && entry.mode === "sub_vendor")).toEqual([]);
    expect(await savedModePayload(target.mainLineId, target.draftRevisionId!)).toEqual(activeBefore);
    expect(await savedModePayload(target.mainLineId)).toEqual({ ...activeBefore,
      tierConfigurations: { ...activeBefore.tierConfigurations,
        premium: { ...activeBefore.tierConfigurations.premium,
          payload: { ...activeBefore.tierConfigurations.premium.payload, dependencies: [], subVendorMarginBps: 3500 } } } });
    expect(await section(outsider.mainLineId)).toEqual(outsideBefore);
    expect(await AuditEventModel.findOne({ action: "ai_estimator_knowledge_sub_basket_margin_exception_approved" }).lean())
      .toMatchObject({ actorId: actor.id, entityId: sub.id, newValues: { operationId: "approve-premium", candidateRevisionId: source.draftRevisionId } });

    await savePremium(source, 4500);
    const retry = await base.item.commitMarginDecision(actor, basket.id, sub.id, input);
    expect(retry).toEqual({ ...result, alreadyApplied: true });
    expect((await base.item.getMarginMatrix(actor, basket.id, sub.id)).exceptions)
      .toContainEqual(expect.objectContaining({ ...premium, mainLineId: source.mainLineId, ranges: pair(4500) }));
    await expect(base.item.commitMarginDecision(actor, basket.id, sub.id, { ...input, decision: approve(competitor.mainLineId) }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_margin_exception_approved" })).toBe(1);
  });

  it("commits selected tiers atomically, rolls back target drafts and receipts on audit failure, and survives source archival", async () => {
    const { basket, sub, source, target } = await tiersFixture();
    await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: target.draftRevisionId }, { $set: { status: "active", contentDigest: "active-before-rollback" } });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: target.mainLineId }, { $set: { status: "active", activeRevisionId: target.draftRevisionId, draftRevisionId: null } });
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    const changes = edit({ ...premium, ranges: pair(4500) }, { tier: "functional", mode: "pmc",
      ranges: [{ key: "margin", minimumBps: 1300, maximumBps: 1850 }] });
    const { input } = await review(matrix, changes, "two-tiers");
    const before = await snapshot();
    const failing = harness({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "ai_estimator_knowledge_sub_basket_margins_updated") throw new Error("Injected final audit failure");
      return base.audit.appendInMongoTransaction(event, session);
    } });
    await expect(failing.item.commitMarginDecision(actor, basket.id, sub.id, input)).rejects.toThrow("Injected final audit failure");
    expect(await snapshot()).toEqual(before);
    const concurrent = await Promise.all([1, 2].map(() => base.item.commitMarginDecision(actor, basket.id, sub.id, input)));
    expect(concurrent.map(result => result.alreadyApplied).sort()).toEqual([false, true]);
    const got = await savedModePayload(target.mainLineId);
    expect(got.tierConfigurations.premium.payload).toMatchObject({ subVendorMarginBps: 4500, pmcMarginBps: 1800 });
    expect(got.tierConfigurations.functional.payload).toMatchObject({ subVendorMarginBps: 2500, pmcMinimumMarginBps: 1300, pmcMarginBps: 1850 });
    expect(got).toMatchObject({ subVendorMarginBps: 500, pmcMarginBps: 1500 });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: source.mainLineId }, { $set: { status: "archived" } });
    expect((await base.item.getMarginMatrix(actor, basket.id, sub.id)).defaults)
      .toContainEqual(expect.objectContaining({ ...premium, ranges: pair(4500), provenance: "approved" }));
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_sub_basket_margins_updated" })).toBe(1);
  });

  it("keeps a first newly entered tier unapproved and rejects approval after membership or candidate changes", async () => {
    const basket = await base.reference.createBasket(actor, { name: "Unconfigured" });
    const sub = await base.reference.createSubBasket(actor, basket.id, { name: "Blank tiers" });
    const source = await create(basket.id, sub.id, "First line", {});
    await base.item.updateSection(actor, source.mainLineId, source.draftRevisionId!, "advanced", {
      modeTier: "premium", expectedVersion: (await section(source.mainLineId)).version,
      marginEdits: [{ mode: "sub_vendor", key: "margin", bound: "maximumBps" }],
      payload: { subVendorMinimumMarginBps: 2000, subVendorMarginBps: 3500 }
    });
    const matrix = await base.item.getMarginMatrix(actor, basket.id, sub.id);
    expect(matrix.defaults).toContainEqual(expect.objectContaining({ ...premium, ranges: [], provenance: "unset" }));
    expect(matrix.exceptions).toContainEqual(expect.objectContaining({ ...premium, mainLineId: source.mainLineId, ranges: pair(3500) }));
    const first = await review(matrix, approve(source.mainLineId), "before-membership");
    await create(basket.id, sub.id, "Added after review", {});
    await expect(base.item.commitMarginDecision(actor, basket.id, sub.id, first.input)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const fresh = await review(await base.item.getMarginMatrix(actor, basket.id, sub.id), approve(source.mainLineId), "before-edit");
    await savePremium(source, 4500);
    const before = await snapshot();
    await expect(base.item.commitMarginDecision(actor, basket.id, sub.id, fresh.input)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await snapshot()).toEqual(before);
  });
});
