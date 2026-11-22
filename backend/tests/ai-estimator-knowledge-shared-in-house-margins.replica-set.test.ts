import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MarginComponent, MarginDecision, MarginEditField, MarginMatrix, MarginPair } from "../src/contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { createKnowledgeRevisionDigest } from "../src/domain/ai-estimator-knowledge-completeness.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeMarginOperationModel } from "../src/models/AiEstimatorKnowledgeMarginOperation.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProcurementBasketBoqRevisionModel } from "../src/models/ProcurementBasketTender.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeItemService } from "../src/services/ai-estimator-knowledge-item.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { resolveEstimatorCatalogueLines } from "../src/services/estimator-catalogue.service.js";
import { resolvePurchaseOrderModes } from "../src/services/project-purchase-order-mode.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "shared-margin-admin", name: "Administrator", email: "admin@example.invalid", role: "super_admin" as const };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
const audit = createAuditService(createMemoryRepository());
const item = createAiEstimatorKnowledgeItemService({ actorGuard, audit });
const references = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit });
const signature = { tier: "signature", mode: "in_house" } as const;
const shared = "sub_basket" as const;
const decisionAction = { $in: ["ai_estimator_knowledge_sub_basket_margins_updated", "ai_estimator_knowledge_sub_basket_margin_exception_approved"] };
const margins = (laborMin: number, laborStart: number, materialMin: number, materialStart: number): MarginPair[] => [
  { key: "labor", minimumBps: laborMin, maximumBps: laborStart },
  { key: "material", minimumBps: materialMin, maximumBps: materialStart }
];
const approved = margins(1500, 2000, 1000, 2000);
const existing = margins(2500, 3500, 2500, 3500);
const previouslySaved = margins(1400, 1900, 1100, 1700);
const edit = (ranges: MarginPair[]): MarginDecision => ({ kind: "edit", changes: [{ ...signature, ranges }] });

function cost(baseRatePaise: number, range: MarginPair) {
  return { baseRatePaise, lowQuantityLimit: "0", impactBps: 0, minimumMarkupBps: range.minimumBps, startingMarkupBps: range.maximumBps };
}
function component(id: string, ref: MarginComponent, price: number, ranges: MarginPair[]) {
  return { id, ...ref, inclusions: [], exclusions: [], labor: cost(price, ranges[0]!), material: cost(price * 3, ranges[1]!) };
}
type Component = ReturnType<typeof component>;
function withRanges(entry: Component, ranges: MarginPair[]) {
  return { ...entry, labor: cost(entry.labor.baseRatePaise, ranges[0]!), material: cost(entry.material.baseRatePaise, ranges[1]!) };
}
async function line(basketId: string, subBasketId: string, name: string, payload: Record<string, unknown>, itemType: "main_line" | "temporary" = "main_line") {
  const created = await item.createMainLine(actor, basketId, { name, subBasketId, itemType });
  await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId: created.draftRevisionId, sectionKey: "advanced" }, {
    $set: { applicability: "configured", payload }
  });
  return { id: created.mainLineId, revisionId: created.draftRevisionId! };
}
const rawMode = (revisionId: string) => AiEstimatorKnowledgeSectionModel.findOne({ revisionId, sectionKey: "advanced" }).lean().orFail();
const readRevision = (revisionId: string) => AiEstimatorKnowledgeSectionModel.find({ revisionId }).sort({ _id: 1 }).lean();

async function screenshotFixture() {
  const basket = await references.createBasket(actor, { name: "POP / Gypsum" });
  const owner = await references.createSubBasket(actor, basket.id, { name: "POP Gypsum" });
  const neighbour = await references.createSubBasket(actor, basket.id, { name: "popp" });
  const own = { basketId: basket.id, subBasketId: owner.id };
  const other = { basketId: basket.id, subBasketId: neighbour.id };
  const sourceRows = [component("ceiling", own, 1000, previouslySaved), component("finish", other, 2700, existing)];
  const siblingRows = [component("cove", own, 3300, existing)];
  const mode = (rows: Component[]) => ({
    pmcMinimumMarginBps: 1200, pmcMarginBps: 1500, subVendorMinimumMarginBps: 1500, subVendorMarginBps: 2000,
    inHouseUsage: "estimator", inHousePresetComponentIds: [rows[0]!.id], inHouseComponents: rows,
    tierConfigurations: { premium: { applicability: "configured", payload: { inHouseComponents: rows } } }
  });
  const main = await line(basket.id, owner.id, "POP false ceiling", mode(sourceRows));
  const sibling = await line(basket.id, owner.id, "Cove in Gypsum", mode(siblingRows), "temporary");
  const outside = await line(basket.id, neighbour.id, "Neighbour line", mode([component("outside", other, 8900, existing)]));
  const read = () => item.getMarginMatrix(actor, basket.id, owner.id, shared);
  const legacy = await item.getMarginMatrix(actor, basket.id, owner.id);
  const defaults = legacy.defaults.map(row => row.mode === "in_house" && row.tier === "signature" && row.component?.subBasketId === owner.id
    ? { ...row, provenance: "approved", ranges: approved } : row);
  // Reproduce data written by the component-scoped release, without running a migration.
  await AiEstimatorKnowledgeSubBasketModel.updateOne({ _id: owner.id }, {
    $set: { marginBaseline: { version: 1, defaults, updatedAt: new Date(), updatedById: actor.id } }
  }, { runValidators: true });
  return { basketId: basket.id, subId: owner.id, own, other, main, sibling, outside, sourceRows, siblingRows, read, mode };
}
async function review(matrix: MarginMatrix, decision: MarginDecision, operationId: string) {
  const request = { inHouseScope: shared, versionToken: matrix.versionToken, decision };
  const preview = await item.previewMarginDecision(actor, matrix.basketId, matrix.subBasketId, request);
  return { impact: preview.impacts[0]!, input: { ...request, reviewToken: preview.reviewToken, operationId } };
}
async function activate(id: string, revisionId: string) {
  const rows = await readRevision(revisionId);
  const contentDigest = createKnowledgeRevisionDigest({ mainLineId: id, revisionNumber: 1,
    sections: rows.map(row => ({ sectionKey: row.sectionKey, applicability: row.applicability, payload: row.payload ?? {} })) });
  await AiEstimatorKnowledgeRevisionModel.updateOne({ _id: revisionId }, { $set: { status: "active", contentDigest } });
  await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: id }, { $set: { status: "active", activeRevisionId: revisionId, draftRevisionId: null } });
  return rows;
}
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("shared-in-house-margins"); }, 120_000);
beforeEach(async () => { await replica.clear(); });
afterAll(async () => { await replica?.stop(); });

describe("shared In-house margins", { timeout: 30_000 }, () => {
  it("previews the approved POP Gypsum values once and propagates them by membership with transactional rollback and replay", async () => {
    const f = await screenshotFixture();
    const original = await activate(f.sibling.id, f.sibling.revisionId);
    const outside = await readRevision(f.outside.revisionId);
    const sourceBefore = await rawMode(f.main.revisionId);
    const baselineBefore = await AiEstimatorKnowledgeSubBasketModel.findById(f.subId).lean();
    const before = await f.read();
    expect(before.defaults.filter(d => d.mode === "in_house")).toHaveLength(3);
    const defaults = before.defaults.filter(d => d.tier === "signature" && d.mode === "in_house");
    expect(defaults).toMatchObject([{ ranges: approved, resolution: "suggested", canApplyPrefilled: true }]);
    expect(defaults[0]).not.toHaveProperty("component");
    expect(before.exceptions).toEqual([]);
    const { impact, input } = await review(before, edit(defaults[0]!.ranges), "apply-prefilled-signature");
    expect(impact.blockers).toEqual([]);
    expect(impact.affected.map(entry => entry.mainLineId).sort()).toEqual([f.main.id, f.sibling.id].sort());
    expect(impact.componentChanges).toHaveLength(3);
    expect(impact.componentChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ mainLineId: f.main.id, component: f.own, previous: previouslySaved }),
      expect.objectContaining({ mainLineId: f.main.id, component: f.other, previous: existing }),
      expect.objectContaining({ mainLineId: f.sibling.id, component: f.own, previous: existing })
    ]));
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(f.subId).lean()).toEqual(baselineBefore);
    expect(await rawMode(f.main.revisionId)).toEqual(sourceBefore);
    const failing = createAiEstimatorKnowledgeItemService({ actorGuard, audit: { appendInMongoTransaction: async (event, session) => {
      if (event.action === "ai_estimator_knowledge_sub_basket_margins_updated") throw Error("shared-margin audit interrupted");
      return audit.appendInMongoTransaction(event, session);
    } } });
    await expect(failing.commitMarginDecision(actor, f.basketId, f.subId, input)).rejects.toThrow("shared-margin audit interrupted");
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(f.subId).lean()).toEqual(baselineBefore);
    expect(await rawMode(f.main.revisionId)).toEqual(sourceBefore);
    expect((await item.getItem(actor, f.sibling.id)).draftRevisionId).toBeNull();
    expect(await AiEstimatorKnowledgeMarginOperationModel.countDocuments()).toBe(0);
    const results = await Promise.all([1, 2].map(() => item.commitMarginDecision(actor, f.basketId, f.subId, input)));
    expect(results.map(result => result.alreadyApplied).sort()).toEqual([false, true]);
    for (const result of results) expect(result.updatedMainLineIds.sort()).toEqual([f.main.id, f.sibling.id].sort());
    expect((await rawMode(f.main.revisionId)).payload).toEqual({ ...f.mode(f.sourceRows), inHouseComponents: f.sourceRows.map(c => withRanges(c, approved)) });
    const copy = await item.getItem(actor, f.sibling.id);
    expect(copy.draftRevisionId).toBeTruthy();
    expect((await rawMode(copy.draftRevisionId!)).payload).toEqual({ ...f.mode(f.siblingRows), inHouseComponents: f.siblingRows.map(c => withRanges(c, approved)) });
    expect(await readRevision(f.sibling.revisionId)).toEqual(original);
    expect(await readRevision(f.outside.revisionId)).toEqual(outside);
    const after = await f.read();
    expect(after.defaults).toContainEqual(expect.objectContaining({ ...signature, ranges: approved, resolution: "shared", provenance: "approved" }));
    expect(after.exceptions).toEqual([]);
    const second = await review(after, edit(approved), "save-already-shared");
    expect(second.impact.affected).toEqual([]);
    await item.commitMarginDecision(actor, f.basketId, f.subId, second.input);
    expect((await f.read()).baselineVersion).toBe(after.baselineVersion);
    expect(await AuditEventModel.countDocuments({ action: decisionAction })).toBe(1);
  });

  it("rejects a changed membership and a legacy review token on a shared command before any write", async () => {
    const f = await screenshotFixture();
    const current = await f.read();
    const v1 = await item.getMarginMatrix(actor, f.basketId, f.subId);
    const legacy = await item.previewMarginDecision(actor, f.basketId, f.subId, { versionToken: v1.versionToken,
      decision: { kind: "edit", changes: [{ ...signature, component: f.own, ranges: existing }] } });
    const { input } = await review(current, edit(existing), "invalidated-shared");
    await expect(item.commitMarginDecision(actor, f.basketId, f.subId, { ...input, reviewToken: legacy.reviewToken })).rejects.toMatchObject({ status: 409 });
    await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: f.sibling.id }, { $set: { subBasketId: f.other.subBasketId }, $inc: { version: 1 } });
    await expect(item.commitMarginDecision(actor, f.basketId, f.subId, input)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await rawMode(f.main.revisionId)).payload).toEqual(f.mode(f.sourceRows));
    expect((await rawMode(f.sibling.revisionId)).payload).toEqual(f.mode(f.siblingRows));
    expect(await AiEstimatorKnowledgeMarginOperationModel.countDocuments()).toBe(0);
  });

  it("replays an old component-scoped receipt after the tier acquires a shared default", async () => {
    const f = await screenshotFixture();
    const legacy = await item.getMarginMatrix(actor, f.basketId, f.subId);
    const decision: MarginDecision = { kind: "edit", changes: [{ ...signature, component: f.other, ranges: previouslySaved }] };
    const request = { versionToken: legacy.versionToken, decision };
    const preview = await item.previewMarginDecision(actor, f.basketId, f.subId, request);
    const old = { ...request, reviewToken: preview.reviewToken, operationId: "legacy-component-edit" };
    const result = await item.commitMarginDecision(actor, f.basketId, f.subId, old);
    expect(result.updatedMainLineIds).toEqual([f.main.id]);
    expect((await rawMode(f.main.revisionId)).payload.inHouseComponents).toEqual([f.sourceRows[0], withRanges(f.sourceRows[1]!, previouslySaved)]);
    expect((await rawMode(f.sibling.revisionId)).payload.inHouseComponents).toEqual(f.siblingRows);
    const promoted = await review(await f.read(), edit(approved), "choose-shared-after-legacy");
    await item.commitMarginDecision(actor, f.basketId, f.subId, promoted.input);
    const current = await f.read();
    const auditCount = await AuditEventModel.countDocuments({ action: decisionAction });
    expect(await item.commitMarginDecision(actor, f.basketId, f.subId, old)).toEqual({ ...result, alreadyApplied: true });
    await expect(item.commitMarginDecision(actor, f.basketId, f.subId, { ...old, operationId: "new-legacy-command" })).rejects.toMatchObject({ status: 409 });
    expect(await f.read()).toEqual(current);
    expect(await AuditEventModel.countDocuments({ action: decisionAction })).toBe(auditCount);
  });

  it("keeps a targeted Signature restore on its one reviewed line after establishing the shared default", async () => {
    const f = await screenshotFixture();
    const { input } = await review(await f.read(), edit(approved), "establish-before-restore");
    await item.commitMarginDecision(actor, f.basketId, f.subId, input);
    // Two unflagged imported differences in the current components are eligible for comparison, never for a notification.
    for (const [target, rows] of [[f.main, f.sourceRows], [f.sibling, f.siblingRows]] as const) {
      await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId: target.revisionId, sectionKey: "advanced" }, {
        $inc: { version: 1 }, $set: { "payload.inHouseComponents": rows.map(c => withRanges(c, existing)) }
      });
    }
    const mainBefore = await rawMode(f.main.revisionId);
    const comparison = await item.getSubBasketMargins(actor, f.basketId, f.subId, "signature", shared);
    expect(comparison.modes.in_house.mismatches.map(row => row.mainLineId).sort()).toEqual([f.main.id, f.sibling.id].sort());
    expect((await f.read()).exceptions).toEqual([]);
    const saved = await item.applySubBasketMargins(actor, f.basketId, f.subId, { mode: "in_house",
      versionToken: comparison.versionToken, targetMainLineId: f.sibling.id });
    expect(saved.updatedMainLineIds).toEqual([f.sibling.id]);
    expect(await rawMode(f.main.revisionId)).toEqual(mainBefore);
    expect((await rawMode(f.sibling.revisionId)).payload.inHouseComponents).toEqual(f.siblingRows.map(c => withRanges(c, approved)));
  });

  it("establishes and reads one shared default even when the Sub-Basket has no cost rows", async () => {
    const b = await references.createBasket(actor, { name: "Empty" });
    const s = await references.createSubBasket(actor, b.id, { name: "No lines" });
    const matrix = await item.getMarginMatrix(actor, b.id, s.id, shared);
    expect(matrix.defaults.filter(d => d.mode === "in_house")).toHaveLength(3);
    expect(matrix.defaults.filter(d => d.mode === "in_house")).toEqual(expect.arrayContaining([
      expect.objectContaining({ ...signature, resolution: "unset", ranges: [] })
    ]));
    const { impact, input } = await review(matrix, edit(approved), "establish-empty-default");
    expect(impact).toMatchObject({ affected: [], blockers: [] });
    expect(await item.commitMarginDecision(actor, b.id, s.id, input)).toMatchObject({ updatedMainLineIds: [], alreadyApplied: false });
    const saved = await item.getMarginMatrix(actor, b.id, s.id, shared);
    expect(saved.defaults).toContainEqual(expect.objectContaining({ ...signature, ranges: approved, provenance: "approved", resolution: "shared" }));
    expect(await item.commitMarginDecision(actor, b.id, s.id, input)).toMatchObject({ updatedMainLineIds: [], alreadyApplied: true });
    expect(await AuditEventModel.countDocuments({ action: decisionAction })).toBe(1);
  });

  it("uses the updated draft in current pricing and preserves the issued BOQ and approved estimate", async () => {
    const f = await screenshotFixture();
    const { id, revisionId } = f.main;
    const uom = await references.createMaster(actor, "uoms", { name: "Square foot", code: "SQFT", decimalScale: 2 });
    await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId, sectionKey: "overview" }, {
      $set: { applicability: "configured", payload: { uomId: uom.id, applicableTiers: ["signature", "premium"] } }
    });
    const original = await activate(id, revisionId);
    const approvedLine = { key: "quoted-line", included: true, amountPaise: 50_000, quantity: 2,
      source: "configuration" as const, approvedPricingMode: "in_house" as const, modeTier: "signature" as const,
      selectedInHouseComponentIds: ["finish"], mainBasketId: f.basketId, mainLineId: id, revisionId,
      sourceRevisionStatus: "active" as const, sourceRevisionVersion: 1, uomId: uom.id, uomCode: "SQFT", uomDecimalScale: 2 };
    const estimateSource = { estimateId: "estimate", estimateVersion: 1, estimateReviewRoundId: "review-round" };
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: "review-round", estimateId: "estimate", estimateVersion: 1,
      status: "approved", estimateSnapshot: { lineItems: [approvedLine], subtotalPaise: 50_000 } });
    await ProcurementBasketBoqRevisionModel.collection.insertOne({ _id: "sent-boq", projectId: "project", mainBasketId: f.basketId,
      estimateSource, sentAt: new Date(), lines: [{ sourceLineItemKey: approvedLine.key, mainLineId: id, approvedQuoteAmountPaise: 50_000 }] });
    const published = () => EstimateClientReviewRoundModel.findById("review-round").lean();
    const issued = () => ProcurementBasketBoqRevisionModel.findById("sent-boq").lean();
    const [publishedBefore, issuedBefore] = await Promise.all([published(), issued()]);
    const catalogue = async () => (await resolveEstimatorCatalogueLines([id])).get(id)?.line;
    const proposals = new Map([[approvedLine.key, { mode: "in_house" as const, quantity: "2", discountBps: 0,
      markupBasis: "starting" as const, exceptionReason: null }]]);
    const procurement = async () => (await mongoose.connection.transaction(session => resolvePurchaseOrderModes("project",
      { ...estimateSource, allLineItems: [approvedLine] }, session, { proposals }))).get(approvedLine.key);
    const prior = await catalogue();
    expect(prior).toMatchObject({ revisionId, revisionStatus: "active" });
    const priorPurchase = await procurement();
    expect(priorPurchase).toMatchObject({ state: "ready", revision: { id: revisionId, status: "active" },
      preview: { baseCostPaise: 21600, components: [{ componentId: "finish" }, { componentId: "finish" }] } });
    const { input } = await review(await f.read(), edit(approved), "refresh-pricing");
    await item.commitMarginDecision(actor, f.basketId, f.subId, input);
    const current = await catalogue();
    expect(current).toMatchObject({ revisionStatus: "draft" });
    expect(current!.revisionId).not.toBe(revisionId);
    expect(current!.tierPricing.signature?.inHouseComponents).toEqual(prior!.tierPricing.signature?.inHouseComponents);
    expect(current!.tierPricing.premium).toEqual(prior!.tierPricing.premium);
    const purchase = await procurement();
    expect(purchase).toMatchObject({ state: "ready", revision: { id: current!.revisionId, status: "draft" },
      preview: { baseCostPaise: 21600, sellingPaise: 27000,
        settings: { scopes: [ { baseRatePaise: 2700, minimumMarkupBps: 1500, startingMarkupBps: 2000 },
          { baseRatePaise: 8100, minimumMarkupBps: 1000, startingMarkupBps: 2000 } ] } } });
    expect(purchase!.preview!.sellingPaise).toBeLessThan(priorPurchase!.preview!.sellingPaise);
    expect(await readRevision(revisionId)).toEqual(original);
    expect(await published()).toEqual(publishedBefore);
    expect(await issued()).toEqual(issuedBefore);
  });

  it("lists a partial cost as excluded and blocks a legacy single-cost row that cannot express both ranges", async () => {
    const f = await screenshotFixture();
    const partial = { ...f.sourceRows[1], material: null };
    await AiEstimatorKnowledgeSectionModel.updateOne({ revisionId: f.main.revisionId, sectionKey: "advanced" }, {
      $set: { "payload.inHouseComponents.1": partial }
    });
    const legacy = await line(f.basketId, f.subId, "Single cost", {
      modeCalculations: { pmc: null, sub_vendor: null, in_house: cost(2000, existing[0]!) }
    });
    const { impact, input } = await review(await f.read(), edit(approved), "asymmetric-legacy-cost");
    expect(impact.excluded).toContainEqual(expect.objectContaining({ mainLineId: f.main.id, component: f.other }));
    expect(impact.blockers).toContainEqual(expect.objectContaining({ mainLineId: legacy.id }));
    expect(impact.affected).toContainEqual(expect.objectContaining({ mainLineId: f.main.id }));
    await expect(item.commitMarginDecision(actor, f.basketId, f.subId, input)).rejects.toMatchObject({ status: 409 });
    expect((await rawMode(f.main.revisionId)).payload.inHouseComponents).toEqual([f.sourceRows[0], partial]);
    expect(await AiEstimatorKnowledgeMarginOperationModel.countDocuments()).toBe(0);
  });

  it("groups competing edits against unresolved defaults, retaining each source and clearing only resolved evidence", async () => {
    const f = await screenshotFixture();
    // Simulate a second historical approval. Neither stored value may win on recency or component order.
    await AiEstimatorKnowledgeSubBasketModel.updateOne({ _id: f.subId }, {
      $set: { "marginBaseline.defaults.$[component].provenance": "approved" }
    }, { arrayFilters: [{ "component.tier": "signature", "component.mode": "in_house", "component.component.subBasketId": f.other.subBasketId }] });
    const before = await f.read();
    expect(before.defaults).toContainEqual(expect.objectContaining({ ...signature, resolution: "choose", ranges: [],
      choices: expect.arrayContaining([expect.objectContaining({ ranges: approved }), expect.objectContaining({ ranges: existing })]) }));
    expect(before.exceptions).toEqual([]);
    const first = margins(1400, 2700, 1100, 1700);
    const second = margins(2500, 4100, 2500, 3500);
    const manual = async (rows: Component[], fields: MarginEditField[], description: string) => {
      const current = await item.getSection(actor, f.main.id, f.main.revisionId, "advanced", "signature");
      await item.updateSection(actor, f.main.id, f.main.revisionId, "advanced", { expectedVersion: current.version, modeTier: "signature",
        marginEdits: fields, payload: { ...current.payload, modeDescription: description, inHouseComponents: rows } });
    };
    const hint = (component: MarginComponent): MarginEditField => ({ mode: "in_house", component, key: "labor", bound: "maximumBps" });
    const rows = [withRanges(f.sourceRows[0]!, first), withRanges(f.sourceRows[1]!, second)];
    await manual(rows, [hint(f.own), hint(f.other)], "Two manual edits");
    await manual(rows, [], "Description only");
    const pending = await f.read();
    expect(pending.exceptions).toHaveLength(1);
    const [group] = pending.exceptions;
    expect(group).toMatchObject({ ...signature, mainLineId: f.main.id, requiresDefault: true });
    expect(group?.proposals).toHaveLength(2);
    expect(group?.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: f.own, ranges: first }), expect.objectContaining({ component: f.other, ranges: second })
    ]));
    const unselected = { kind: "approve", candidate: { ...signature, mainLineId: f.main.id } } as const;
    await expect(item.previewMarginDecision(actor, f.basketId, f.subId, { inHouseScope: shared,
      versionToken: pending.versionToken, decision: unselected })).rejects.toThrow();
    const candidate = { ...unselected.candidate, component: f.other };
    const chosen = await review(pending, { kind: "approve", candidate }, "select-other-component-values");
    expect(chosen.impact.ranges).toEqual(second);
    await item.commitMarginDecision(actor, f.basketId, f.subId, chosen.input);
    expect((await f.read()).exceptions).toEqual([]);
    expect((await rawMode(f.main.revisionId)).payload.inHouseComponents).toEqual(rows.map(row => withRanges(row, second)));
    expect((await rawMode(f.sibling.revisionId)).payload.inHouseComponents).toEqual(f.siblingRows.map(row => withRanges(row, second)));
    const changed = [withRanges(rows[0]!, approved), withRanges(rows[1]!, second)];
    await manual(changed, [hint(f.own)], "Manual edit");
    expect((await f.read()).exceptions).toHaveLength(1);
    await manual(rows.map(c => withRanges(c, second)), [hint(f.own)], "Revert");
    expect((await f.read()).exceptions).toEqual([]);
  });

  it("clears the approved source even when its tier needs no patch and keeps pending evidence from another tier", async () => {
    const f = await screenshotFixture();
    const setup = await review(await f.read(), edit(approved), "establish-before-edit");
    await item.commitMarginDecision(actor, f.basketId, f.subId, setup.input);
    const next = margins(1500, 3000, 1000, 2000);
    for (const tier of ["signature", "premium"] as const) {
      const section = await item.getSection(actor, f.main.id, f.main.revisionId, "advanced", tier);
      const rows = f.sourceRows.map(c => withRanges(c, next));
      await item.updateSection(actor, f.main.id, f.main.revisionId, "advanced", { modeTier: tier, expectedVersion: section.version,
        payload: { ...section.payload, inHouseComponents: rows }, marginEdits: [f.own, f.other].map(component => ({
          mode: "in_house", component, key: "labor", bound: "maximumBps"
        })) });
    }
    const before = await f.read();
    expect(before.exceptions.map(group => group.tier).sort()).toEqual(["premium", "signature"]);
    const chosen = await review(before, { kind: "approve", candidate: { ...signature, mainLineId: f.main.id, component: f.own } }, "approve-matching-source");
    expect(chosen.impact.affected.map(row => row.mainLineId)).toEqual([f.sibling.id]);
    const sourceBefore = await rawMode(f.main.revisionId);
    await item.commitMarginDecision(actor, f.basketId, f.subId, chosen.input);
    expect(await rawMode(f.main.revisionId)).toEqual(sourceBefore);
    const retained = await f.read();
    expect(retained.exceptions).toMatchObject([{ tier: "premium", mainLineId: f.main.id }]);
    const stored = await AiEstimatorKnowledgeMainLineModel.findById(f.main.id).lean().orFail();
    expect(stored.pendingMarginEdits.map((entry: MarginEditField & { tier: string }) => entry.tier)).toEqual(["premium", "premium"]);
  });
});
