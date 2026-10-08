import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseOrderModeResolution } from "../src/domain/project-purchase-order-mode.js";
import { projectProcurementBaskets } from "../src/domain/procurement-basket-projection.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { buildProjectPurchaseOrderPreparation } from "../src/services/project-purchase-order-preparation.service.js";
import { resolvePurchaseOrderModes } from "../src/services/project-purchase-order-mode.service.js";
import { procurementItemSourceSnapshot,
  type ApprovedProcurementSnapshot, type ApprovedProcurementSourceLine } from "../src/services/procurement.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/procurement.service.js", () => ({
  assertProcurementProjectAccess: vi.fn(),
  procurementItemSourceSnapshot: vi.fn()
}));
vi.mock("../src/services/project-purchase-order-mode.service.js", () => ({ resolvePurchaseOrderModes: vi.fn() }));
vi.mock("../src/services/vendor-readiness.service.js", () => ({
  vendorActivations: vi.fn(async (vendors: Array<{ _id: string }>) => new Map(vendors.map((vendor) => [String(vendor._id),
    { effectiveStatus: "active", gates: {} }])))
}));

const projectId = "preparation-mode-project";
const estimateId = "preparation-mode-estimate";
const reviewRoundId = "preparation-mode-round";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

const approvedLines: ApprovedProcurementSourceLine[] = [
  { key: "line-a", sectionId: "basket-a", sectionLabel: "Painting", source: "configuration", itemType: "main_line",
    catalogueId: "main-a", roomId: "room-a", roomName: "Living", mainBasketId: "basket-a", mainBasketName: "Painting",
    subBasketId: "sub-a", subBasketName: "False Ceiling", mainLineId: "main-a", mainLineName: "Cove painting",
    revisionId: "revision-a", sourceRevisionVersion: 2, sourceRevisionStatus: "active",
    uomId: "uom-sqft", uomCode: "SQFT", uomDecimalScale: 2,
    specification: "Paint installed cove", unit: "sqft", quantity: 10, included: true, amountPaise: 100_000 },
  { key: "line-b", sectionId: "basket-b", sectionLabel: "Painting", source: "configuration", itemType: "main_line",
    catalogueId: "main-b", roomId: "room-b", roomName: "Dining", mainBasketId: "basket-b", mainBasketName: "Painting",
    subBasketId: "sub-b", subBasketName: "False Ceiling", mainLineId: "main-b", mainLineName: "Cove painting",
    revisionId: "revision-b", sourceRevisionVersion: 1, sourceRevisionStatus: "superseded",
    uomId: "uom-sqft", uomCode: "SQFT", uomDecimalScale: 2,
    specification: "Paint installed cove", unit: "sqft", quantity: 5, included: true, amountPaise: 25_000 },
  { key: "line-zero", sectionId: "CC", sectionLabel: "Zero scope", source: "legacy", catalogueId: "CC01",
    roomName: "Bedroom", specification: "Zero-price reference", unit: "sqft", quantity: 3,
    included: true, amountPaise: 0 },
  { key: "line-excluded", sectionId: "basket-c", sectionLabel: "Painting", source: "configuration", itemType: "main_line",
    catalogueId: "main-c", roomId: "room-c", roomName: "Study", mainBasketId: "basket-c", mainBasketName: "Painting",
    subBasketId: null, subBasketName: null, mainLineId: "main-c", mainLineName: "Excluded ceiling",
    revisionId: "revision-c", sourceRevisionVersion: 1, sourceRevisionStatus: "active",
    uomId: "uom-sqft", uomCode: "SQFT", uomDecimalScale: 2,
    specification: "Excluded ceiling", unit: "sqft", quantity: 2, included: false, amountPaise: null },
  { key: "line-legacy", sectionId: "DD", sectionLabel: "Legacy scope", source: "legacy", catalogueId: "DD01",
    roomName: "Kitchen", specification: "Legacy material", unit: "sqft", quantity: 4,
    included: true, amountPaise: 50_000 }
];

const source: ApprovedProcurementSnapshot = {
  estimateId, estimateVersion: 1, estimateReviewRoundId: reviewRoundId,
  designPlanVersion: 1, designPlanApprovedAt: new Date("2026-10-01T00:00:00.000Z"), designPlanApprovedById: "admin",
  subtotalRupees: 1_750, gstRupees: 0, totalRupees: 1_750,
  subtotalPaise: 175_000, gstPaise: 0, totalPaise: 175_000,
  lineItems: approvedLines.filter((line) => line.included && line.amountPaise !== null) as ApprovedProcurementSnapshot["lineItems"],
  allLineItems: approvedLines, mainBasketClassifications: {}
};

function readyMode(version: number): PurchaseOrderModeResolution {
  return {
    state: "ready", options: [{ key: "pmc", label: "PMC" }], issues: [],
    availability: [
      { key: "pmc", label: "PMC", available: true, issues: [] },
      { key: "sub_vendor", label: "Sub-Vendor", available: false,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "Sub-Vendor has no configured calculation." }] },
      { key: "in_house", label: "In-house", available: false,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "In-house has no configured calculation." }] }
    ],
    decision: { id: "decision-a", version, sourceLineItemKey: "line-a", mode: "pmc", quantity: "10",
      discountBps: 0, markupBasis: "starting", exceptionReason: null,
      revisionId: "revision-a", revisionDigest: "a".repeat(64), updatedAt: `2026-10-0${version}T00:00:00.000Z` },
    revision: { id: "revision-a", version: 2, status: "active", contentDigest: "a".repeat(64) },
    uom: { id: "uom-sqft", code: "SQFT", decimalScale: 2 },
    preview: { formulaVersion: "mode-margin-v2", mode: "pmc", quantity: "10", quantityScale: 2,
      baseCostPaise: 60_000, adjustedCostPaise: 60_000, lowQuantityImpactPaise: 0, appliedImpactBps: 0,
      sellingPaise: 75_000, finalVendorChargesPaise: null, floorSellingPaise: 60_000, marginBps: 2_000,
      discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
      settings: { scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 6_000, lowQuantityLimit: "2",
        impactBps: 1_000, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 }],
        configuredMarginBps: 2_000, markupBasis: "starting" }, components: [] },
    priceReferences: {}
  };
}

function recoveredMode(observedDigest: string): PurchaseOrderModeResolution {
  const mode = readyMode(1);
  return {
    ...mode,
    integrity: { status: "mismatch", activatedDigest: "a".repeat(64), observedDigest,
      candidateAvailability: mode.availability },
    decision: { ...mode.decision!, integrityBasis: { kind: "observed_unverified",
      activatedDigest: "a".repeat(64), observedDigest,
      reason: "Buyer reviewed the saved calculation values.", actorId: "buyer-a",
      acknowledgedAt: "2026-10-01T12:00:00.000Z" } }
  };
}

function unavailableMode(): PurchaseOrderModeResolution {
  return { state: "unavailable", options: [], decision: null, preview: null,
    availability: [
      { key: "pmc", label: "PMC", available: false, issues: [{ code: "REVISION_UNAVAILABLE", message: "The approved revision is unavailable." }] },
      { key: "sub_vendor", label: "Sub-Vendor", available: false, issues: [{ code: "REVISION_UNAVAILABLE", message: "The approved revision is unavailable." }] },
      { key: "in_house", label: "In-house", available: false, issues: [{ code: "REVISION_UNAVAILABLE", message: "The approved revision is unavailable." }] }
    ],
    issues: [{ code: "REVISION_UNAVAILABLE", message: "The approved revision is unavailable." }],
    revision: null, uom: null, priceReferences: {} };
}

function historicalException(): PurchaseOrderModeResolution {
  return { ...unavailableMode(), state: "exception",
    decision: { id: "decision-legacy", version: 1, sourceLineItemKey: "line-legacy", mode: null,
      quantity: null, discountBps: 0, markupBasis: "starting",
      exceptionReason: "Historical estimate has no saved Configuration revision.",
      revisionId: null, revisionDigest: null, updatedAt: "2026-10-01T00:00:00.000Z" } };
}

function modes(first: PurchaseOrderModeResolution = readyMode(1),
  legacy: PurchaseOrderModeResolution = historicalException()) {
  return new Map<string, PurchaseOrderModeResolution>([
    ["line-a", first], ["line-b", unavailableMode()], ["line-excluded", unavailableMode()], ["line-legacy", legacy]
  ]);
}

function child(id: string, sourceSectionId: string, sourceLineItemKey: string, pricePaise: number,
  plannedOrderQuantityMilliUnits: number) {
  return { _id: id, projectId, estimateId, estimateVersion: 1, estimateReviewRoundId: reviewRoundId,
    sourceSectionId, sourceLineItemKey, itemName: id, brand: "Fixture", uomId: "uom-sqft", uomCode: "SQFT",
    uomName: "Square foot", uomDecimalScale: 2, vendorId: "vendor-a", vendorCode: "A", vendorName: "Vendor A",
    pricePaise, plannedOrderQuantityMilliUnits, allocatedWorkPaise: 100_000, version: 1, removedAt: null };
}

async function prepare() {
  return mongoose.connection.transaction((session) => buildProjectPurchaseOrderPreparation(projectId, session));
}

beforeAll(async () => { replica = await startMongoReplicaSet("project-purchase-order-preparation-mode-tests"); }, 120_000);
beforeEach(async () => {
  await replica.clear();
  vi.mocked(procurementItemSourceSnapshot).mockResolvedValue(source);
  vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes());
  await ProjectModel.collection.insertOne({ _id: projectId, plannedEndAt: new Date("2026-12-10T00:00:00.000Z"),
    location: "Site A" } as any);
  await AiEstimatorKnowledgeUomModel.collection.insertOne({ _id: "uom-sqft", status: "active", decimalScale: 2 } as any);
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "vendor-a", status: "active",
    procurementProfile: { vendorType: "supplier" } } as any);
  await ProjectProcurementItemModel.collection.insertMany([
    child("child-a-1", "basket-a", "line-a", 10_000, 1_000),
    child("child-a-2", "basket-a", "line-a", 10_000, 1_000),
    child("child-zero", "CC", "line-zero", 1_000, 1_000),
    child("child-legacy", "DD", "line-legacy", 20_000, 2_000)
  ] as any[]);
});
afterAll(async () => { await replica?.stop(); });

describe("mode-aware purchase order preparation", () => {
  it("preserves pre-grouping current, legacy and basket digest baselines", async () => {
    const current = await prepare();
    const legacy = await mongoose.connection.transaction(session =>
      buildProjectPurchaseOrderPreparation(projectId, session, { digestVersion: "legacy" }));
    expect(current.digest).toBe("1bdfa14baf69dffa4ac03bc7818bafa9456cbe470f6f482260379cbb83b666ce");
    expect(legacy.digest).toBe("bc06618b743bf4fe3c177c953c2c5e122fdfce5ef2891b14eb81cf543f7247ff");
    expect(projectProcurementBaskets(current).map(basket => ({ id: basket.id, digest: basket.preparationDigest }))).toEqual([
      { id: "DD", digest: "022123dddb1a3ac406fcedd30a6d509f97cb673fd0b23c3014d0175952f77796" },
      { id: "basket-a", digest: "9c25f0d67e29f563e12bb513741a5307f5a1c5d050a5ca65c5dfb67f3f60e672" },
      { id: "basket-b", digest: "286c302e16356bbe4d1249ba72da8ef5943a03fa4d1386ef29bfbdf94588eaf7" },
      { id: "basket-c", digest: "34b6e31f11808ff70b96a1427c687546592212d2dc70ff624dedcbd4bf47f207" },
      { id: "CC", digest: "4d800f9789bdb9de504ade03a1107094bc01519b5f8e7d9de89234fb07265961" }
    ]);
  });
  it("keeps all commercial output and current/legacy hashes when only estimate display metadata changes", async () => {
    const before = await prepare();
    const legacyBefore = await mongoose.connection.transaction(session =>
      buildProjectPurchaseOrderPreparation(projectId, session, { digestVersion: "legacy" }));
    const withDisplay = source.allLineItems.map((line, index) => ({ ...line,
      approvedClassification: "special" as const,
      approvedPricingMode: index === 0 ? "in_house" as const : "sub_vendor" as const }));
    vi.mocked(procurementItemSourceSnapshot).mockResolvedValue({ ...source, allLineItems: withDisplay,
      lineItems: withDisplay.filter(line => line.included && line.amountPaise !== null) as ApprovedProcurementSnapshot["lineItems"] });
    const after = await prepare();
    const legacyAfter = await mongoose.connection.transaction(session =>
      buildProjectPurchaseOrderPreparation(projectId, session, { digestVersion: "legacy" }));
    expect(after.digest).toBe(before.digest);
    expect(legacyAfter.digest).toBe(legacyBefore.digest);
    expect(after.estimateLines[0]?.estimateMode).toMatchObject({ mode: "in_house", provenance: "line" });
    const withoutDisplay = (value: typeof before) => ({ ...value,
      estimateLines: value.estimateLines.map(({ estimateMode: _display, ...line }) => line) });
    expect(withoutDisplay(after)).toEqual(withoutDisplay(before));
    const basketCommerce = (value: typeof before) => projectProcurementBaskets(value).map(basket => ({ ...basket,
      lines: basket.lines.map(({ estimateMode: _display, ...line }) => line) }));
    expect(basketCommerce(after)).toEqual(basketCommerce(before));
  });
  it("refreshes current parent labels by stable IDs without rewriting approved or legacy labels", async () => {
    const before = await prepare();
    await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: "basket-a", name: "Updated Painting" });
    await AiEstimatorKnowledgeSubBasketModel.collection.insertOne({ _id: "sub-a", basketId: "basket-a",
      name: "Updated False Ceiling" });
    const current = await prepare();
    expect(current.estimateLines[0]).toMatchObject({ mainBasketId: "basket-a", mainBasketName: "Updated Painting",
      subBasketId: "sub-a", subBasketName: "Updated False Ceiling", mainLineName: "Cove painting" });
    expect(current.estimateLines[1]).toMatchObject({ mainBasketId: "basket-b", mainBasketName: "Painting",
      subBasketId: "sub-b", subBasketName: "False Ceiling" });
    expect(current.sections.find(section => section.id === "basket-a")).toMatchObject({
      label: "Updated Painting", roomName: "Updated Painting" });
    const currentBasket = projectProcurementBaskets(current).find(basket => basket.id === "basket-a");
    expect(currentBasket).toMatchObject({
      name: "Updated Painting", lines: [{ subBasketName: "Updated False Ceiling" }] });
    expect(current.digest).not.toBe(before.digest);
    expect(currentBasket?.preparationDigest).not.toBe(projectProcurementBaskets(before)
      .find(basket => basket.id === "basket-a")?.preparationDigest);
    expect(source.allLineItems[0]).toMatchObject({ mainBasketName: "Painting", subBasketName: "False Ceiling" });
    const legacy = await mongoose.connection.transaction(session =>
      buildProjectPurchaseOrderPreparation(projectId, session, { digestVersion: "legacy" }));
    expect(legacy.estimateLines[0]).toMatchObject({ mainBasketName: "Painting", subBasketName: "False Ceiling" });
    expect(legacy.sections.find(section => section.id === "basket-a")?.label).toBe("Painting");
  });

  it("keeps every approved row in source order and sums each child only once", async () => {
    const result = await prepare();
    expect(result.estimateLines.map((line) => line.key)).toEqual(approvedLines.map((line) => line.key));
    expect(result.estimateLines.map((line) => [line.roomName, line.mainBasketId, line.subBasketId])).toEqual([
      ["Living", "basket-a", "sub-a"], ["Dining", "basket-b", "sub-b"],
      ["Bedroom", "CC", null], ["Study", "basket-c", null], ["Kitchen", "DD", null]
    ]);
    expect(result.estimateLines[0]).toMatchObject({ source: "configuration", mainBasketClassificationExplicit: false,
      itemIds: ["child-a-1", "child-a-2"],
      mode: { state: "ready", preview: { adjustedCostPaise: 60_000 } } });
    expect(result.estimateLines[1]).toMatchObject({ itemIds: [], mode: { state: "unavailable" } });
    expect(result.estimateLines[2]).toMatchObject({ included: true, amountPaise: 0, itemIds: ["child-zero"], mode: null });
    expect(result.estimateLines[3]).toMatchObject({ included: false, amountPaise: null, itemIds: [] });
    expect(result.estimateLines[4]).toMatchObject({ source: "legacy", itemIds: ["child-legacy"],
      mode: { state: "exception", decision: { exceptionReason: expect.any(String) } } });
    expect(result).toMatchObject({ approvedEstimatePaise: 175_000, itemCount: 3, readyItemCount: 3,
      netPaise: 60_000, blockers: [] });
    expect(result.sections.flatMap((section) => section.items).map((item) => item.id)).toEqual([
      "child-a-1", "child-a-2", "child-legacy"
    ]);
  });

  it("blocks configured children without a valid mode and changes the digest with a new decision version", async () => {
    const original = await prepare();
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes({ ...readyMode(1), state: "selection_required",
      decision: null, preview: null }));
    const missing = await prepare();
    expect(missing.netPaise).toBe(original.netPaise);
    expect(missing.readyItemCount).toBe(1);
    expect(missing.sections.flatMap((section) => section.items).filter((item) => item.sourceLineItemKey === "line-a")
      .every((item) => item.blockers.some((blocker) => blocker.code === "MODE_SELECTION_REQUIRED"))).toBe(true);
    expect(missing.digest).not.toBe(original.digest);
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(readyMode(2)));
    const updated = await prepare();
    expect(updated.netPaise).toBe(original.netPaise);
    expect(updated.digest).not.toBe(original.digest);
    expect(updated.estimateLines[0]?.mode?.decision?.version).toBe(2);
  });

  it("shows the current Main Line name and preview but blocks direct vendor dispatch from its saved draft", async () => {
    const active = await prepare();
    vi.mocked(resolvePurchaseOrderModes).mockImplementation(async (_projectId, _source, _session, options) => {
      options.currentMainLineNameSink?.set("main-a", "Updated cove painting");
      return modes({ ...readyMode(1), revision: { id: "draft-revision", version: 1,
        status: "draft", contentDigest: "b".repeat(64) } });
    });
    const draft = await prepare();
    expect(draft.estimateLines[0]).toMatchObject({ mainLineName: "Updated cove painting",
      mode: { state: "ready", revision: { status: "draft" }, preview: { adjustedCostPaise: 60_000 } } });
    expect(draft.sections.flatMap(section => section.items)
      .filter(item => item.sourceLineItemKey === "line-a")
      .every(item => item.blockers.some(blocker => blocker.code === "MODE_REVISION_NOT_ACTIVE"))).toBe(true);
    expect(draft.readyItemCount).toBe(1);
    expect(draft.digest).not.toBe(active.digest);
  });

  it("keeps the digest when a pinned published revision is merely superseded", async () => {
    const active = await prepare();
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes({ ...readyMode(1),
      revision: { id: "revision-a", version: 3, status: "superseded", contentDigest: "a".repeat(64) } }));
    const superseded = await prepare();
    expect(superseded.estimateLines[0]?.mode?.revision).toMatchObject({ status: "superseded", version: 3 });
    expect(superseded.digest).toBe(active.digest);
  });

  it("keeps the preparation digest when only unsaved mode availability guidance changes", async () => {
    const first = await prepare();
    const changed = readyMode(1);
    changed.availability[1]!.issues[0]!.message = "The approved Sub-Vendor settings are unavailable.";
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(changed));
    const second = await prepare();
    expect(second.estimateLines[0]?.mode?.availability[1]?.issues[0]?.message).toBe(
      "The approved Sub-Vendor settings are unavailable.");
    expect(second.digest).toBe(first.digest);
  });

  it("carries approved basket classifications and suggestions without changing the preparation digest or mode readiness", async () => {
    const selection = { ...readyMode(1), state: "selection_required" as const, decision: null, preview: null };
    vi.mocked(procurementItemSourceSnapshot).mockResolvedValue({ ...source,
      mainBasketClassifications: { "basket-a": "standard", "basket-b": "special" } });
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(selection));
    const before = await prepare();
    vi.mocked(resolvePurchaseOrderModes).mockImplementation(async (_projectId, _source, _session, options) => {
      options.standardSuggestionSink?.set("line-a", { preview: { mode: "sub_vendor", quantity: "1",
        baseCostPaise: 50_000, adjustedCostPaise: 60_000,
        baseRates: [{ scope: "sub_vendor", ratePaise: 50_000 }] },
        issues: [] });
      return modes(selection);
    });
    const after = await prepare();
    expect(after.estimateLines[0]).toMatchObject({ mainBasketClassification: "standard", mainBasketClassificationExplicit: true,
      mode: { state: "selection_required", decision: null, preview: null },
      standardSuggestion: { preview: { adjustedCostPaise: 60_000 } } });
    expect(after.estimateLines[1]).toMatchObject({ mainBasketClassification: "special", mainBasketClassificationExplicit: true });
    expect(after.digest).toBe(before.digest);
    expect(after.readyItemCount).toBe(before.readyItemCount);
  });

  it("pins an optional recovered basis and observed digest without changing ordinary mode shape", async () => {
    const ordinary = await prepare();
    expect(ordinary.estimateLines[0]?.mode).not.toHaveProperty("integrity");
    expect(ordinary.estimateLines[0]?.mode?.decision).not.toHaveProperty("integrityBasis");

    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(recoveredMode("b".repeat(64))));
    const recovered = await prepare();
    expect(recovered.digest).not.toBe(ordinary.digest);
    expect(recovered.estimateLines[0]?.mode).toMatchObject({ state: "ready",
      integrity: { observedDigest: "b".repeat(64) },
      decision: { integrityBasis: { kind: "observed_unverified", observedDigest: "b".repeat(64) } } });
    expect(recovered.readyItemCount).toBe(ordinary.readyItemCount);

    const wording = recoveredMode("b".repeat(64));
    wording.integrity!.candidateAvailability[0]!.label = "PMC calculation";
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(wording));
    expect((await prepare()).digest).toBe(recovered.digest);

    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(recoveredMode("c".repeat(64))));
    expect((await prepare()).digest).not.toBe(recovered.digest);
  });

  it("blocks a historical legacy child until a reasoned manual exception is saved", async () => {
    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(readyMode(1), unavailableMode()));
    const unresolved = await prepare();
    expect(unresolved.estimateLines[4]?.mode).toMatchObject({ state: "unavailable",
      issues: [{ code: "REVISION_UNAVAILABLE" }] });
    expect(unresolved.sections.flatMap((section) => section.items).find((item) => item.id === "child-legacy")?.blockers)
      .toContainEqual(expect.objectContaining({ code: "MODE_UNAVAILABLE" }));
    expect(unresolved.readyItemCount).toBe(2);

    vi.mocked(resolvePurchaseOrderModes).mockResolvedValue(modes(readyMode(1), historicalException()));
    const explained = await prepare();
    expect(explained.estimateLines[4]?.mode?.decision?.exceptionReason).toContain("Historical estimate");
    expect(explained.sections.flatMap((section) => section.items).find((item) => item.id === "child-legacy")?.blockers)
      .toEqual([]);
    expect(explained.readyItemCount).toBe(3);
    expect(explained.netPaise).toBe(unresolved.netPaise);
    expect(explained.digest).not.toBe(unresolved.digest);
  });

  it("resolves child price and tax references at the quote's effective date", async () => {
    const at = new Date("2026-11-15T12:00:00.000Z");
    await mongoose.connection.transaction((session) =>
      buildProjectPurchaseOrderPreparation(projectId, session, { at }));
    expect(vi.mocked(resolvePurchaseOrderModes).mock.lastCall?.[3]).toMatchObject({ at,
      children: expect.arrayContaining([
        expect.objectContaining({ id: "child-a-1", sourceLineItemKey: "line-a", vendorId: "vendor-a", uomId: "uom-sqft" }),
        expect.objectContaining({ id: "child-legacy", sourceLineItemKey: "line-legacy" })
      ]) });
  });
});
