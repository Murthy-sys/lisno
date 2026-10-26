import { describe, expect, it } from "vitest";
import { MAX_FINANCE_AMOUNT_PAISE } from "../src/domain/project-finance.js";
import { projectInHouseComponentBreakdown, procurementComponentTargetKey } from "../src/domain/procurement-in-house-components.js";
import { projectProcurementBaskets } from "../src/domain/procurement-basket-projection.js";
import { projectProcurementBasketModeGroups, resolveProcurementEstimateMode } from "../src/domain/procurement-basket-mode-groups.js";
import type { PurchaseOrderModePreview } from "../src/domain/project-purchase-order-mode.js";
import type { ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationEstimateLine } from "../src/domain/project-purchase-order-preparation.js";

function line(key: string, cost = 60000, selling = 78333, quantity = "2"): PurchaseOrderPreparationEstimateLine {
  const preview: PurchaseOrderModePreview = {
    formulaVersion: "mode-margin-v2", mode: "in_house", quantity, quantityScale: 2,
    baseCostPaise: cost, adjustedCostPaise: cost, lowQuantityImpactPaise: 0, appliedImpactBps: null,
    sellingPaise: selling, finalVendorChargesPaise: null, floorSellingPaise: cost, marginBps: null,
    discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
    settings: { scopes: [], configuredMarginBps: null, markupBasis: "starting" },
    components: [{ componentId: "shared-id", componentBasketId: "target-basket", componentSubBasketId: "target-sub",
      scope: "labor", adjustedCostPaise: Math.floor(cost / 3), sellingPaise: Math.floor(selling / 3), floorSellingPaise: 0 },
    { componentId: "shared-id", componentBasketId: "target-basket", componentSubBasketId: "target-sub",
      scope: "material", adjustedCostPaise: cost - Math.floor(cost / 3), sellingPaise: selling - Math.floor(selling / 3), floorSellingPaise: 0 }]
  };
  return { key, source: "configuration", included: true, mainBasketId: "source-basket", mainBasketName: "Source",
    mainBasketClassification: "special", subBasketId: "source-sub", subBasketName: "Source sub", mainLineId: `main-${key}`,
    mainLineName: `Main ${key}`, roomId: `room-${key}`, roomName: `Room ${key}`, quantity, unit: "sqft", amountPaise: selling,
    selectedInHouseComponentIds: ["shared-id"], itemIds: [],
    estimateMode: resolveProcurementEstimateMode({ approvedClassification: "special", approvedPricingMode: "in_house" }),
    mode: { state: "ready", preview, decision: null, options: [], availability: [], issues: [], priceReferences: {},
      revision: { id: "revision", version: 1, status: "active", contentDigest: "a".repeat(64) },
      uom: { id: "uom", code: "SQFT", name: "Square foot", decimalScale: 2 } } };
}
function preparation(lines: PurchaseOrderPreparationEstimateLine[], projectId = "project-a"): ProjectPurchaseOrderPreparationDto {
  return { projectId, estimateSource: { estimateId: `${projectId}-estimate`, estimateVersion: 1, estimateReviewRoundId: `${projectId}-round` },
    estimateLines: lines, orderDefaults: { targetDate: null, deliveryLocation: null }, approvedEstimatePaise: 0,
    committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 0, sections: [], netPaise: 0,
    itemCount: 0, readyItemCount: 0, blockers: [], digest: "a".repeat(64) };
}
const targetNames = new Map([[procurementComponentTargetKey("target-basket", "target-sub"), { basketName: "Target", subBasketName: "Finish" }]]);

describe("approved In-house component attribution", () => {
  it("adds unequal source lines using their individual quantities, even with the same component ID", () => {
    const result = projectInHouseComponentBreakdown([line("a"), line("b", 45000, 45000, "3")], targetNames);
    expect(result).toMatchObject({ complete: true, adjustedCostPaise: 105000, sellingPaise: 123333,
      unavailableSourceLineItemKeys: [], subBaskets: [{ basketId: "target-basket", subBasketId: "target-sub", basketName: "Target",
        subBasketName: "Finish", adjustedCostPaise: 105000, sellingPaise: 123333 }] });
    expect(result!.subBaskets[0]!.contributions.map(row => [row.sourceLineItemKey, row.quantity, row.unit]))
      .toEqual([["a", "2", "Square foot"], ["b", "3", "Square foot"]]);
  });
  it("keeps names out of identity and does not silently borrow source-parent names", () => {
    const second = line("b", 5000, 7000);
    second.mode!.preview!.components.forEach(row => { row.componentBasketId = "other-target"; row.componentSubBasketId = "other-sub"; });
    const sameNames = new Map([...targetNames, [procurementComponentTargetKey("other-target", "other-sub"), { basketName: "Target", subBasketName: "Finish" }]]);
    const result = projectInHouseComponentBreakdown([line("a"), second], sameNames)!;
    expect(result.subBaskets).toHaveLength(2);
    expect(result.adjustedCostPaise).toBe(65000);
    expect(projectInHouseComponentBreakdown([line("a")])?.subBaskets[0])
      .toMatchObject({ basketName: null, subBasketName: null });
  });
  it.each(["pmc", "sub_vendor"] as const)("does not activate for approved %s even when Procurement uses In-house", approvedPricingMode => {
    const source = line("a");
    source.estimateMode = resolveProcurementEstimateMode({ approvedClassification: "special", approvedPricingMode });
    expect(projectInHouseComponentBreakdown([source])).toBeUndefined();
  });
  it("leaves excluded, unrecorded and differently selected Procurement modes unchanged", () => {
    const excluded = { ...line("a"), included: false };
    const unrecorded = { ...line("b"), estimateMode: resolveProcurementEstimateMode({}) };
    const changed = line("c");
    changed.mode!.preview!.mode = "pmc";
    const decisionOnly = line("d");
    decisionOnly.mode!.preview = null;
    decisionOnly.mode!.decision = { id: "decision", version: 1, sourceLineItemKey: "d", mode: "sub_vendor", quantity: "2", discountBps: 0,
      markupBasis: "starting", exceptionReason: null, revisionId: "revision", revisionDigest: "a".repeat(64), updatedAt: "2026-10-26T00:00:00Z" };
    expect(projectInHouseComponentBreakdown([excluded, unrecorded, changed, decisionOnly])).toBeUndefined();
  });
  it("preserves legacy In-house without component attribution and distinguishes configured zero", () => {
    const legacy = line("legacy");
    delete legacy.selectedInHouseComponentIds;
    legacy.mode!.preview!.components.forEach(row => { delete row.componentId; delete row.componentBasketId; delete row.componentSubBasketId; });
    expect(projectInHouseComponentBreakdown([legacy])).toBeUndefined();
    expect(projectInHouseComponentBreakdown([line("zero", 0, 0)]))
      .toMatchObject({ complete: true, adjustedCostPaise: 0, sellingPaise: 0, unavailableSourceLineItemKeys: [] });
  });
  it.each(["missing-preview", "missing-material", "duplicate-scope", "wrong-target", "wrong-selection", "empty-selection", "unknown-selection", "invalid-money", "unreconciled", "legacy-null-target"])("marks %s unavailable without exposing a partial line subtotal", problem => {
    const source = line("invalid");
    const preview = source.mode!.preview!;
    if (problem === "missing-preview") { source.mode!.state = "unavailable"; source.mode!.preview = null; }
    if (problem === "missing-material") preview.components.pop();
    if (problem === "duplicate-scope") preview.components.push({ ...preview.components[0]! });
    if (problem === "wrong-target") preview.components[1]!.componentBasketId = "different";
    if (problem === "wrong-selection") source.selectedInHouseComponentIds = ["other"];
    if (problem === "empty-selection") source.selectedInHouseComponentIds = [];
    if (problem === "unknown-selection") delete source.selectedInHouseComponentIds;
    if (problem === "invalid-money") preview.components[0]!.adjustedCostPaise = MAX_FINANCE_AMOUNT_PAISE + 1;
    if (problem === "unreconciled") preview.components[0]!.sellingPaise += 1;
    if (problem === "legacy-null-target") preview.components.forEach(row => { row.componentSubBasketId = null; });
    const result = projectInHouseComponentBreakdown([line("valid"), source])!;
    expect(result).toMatchObject({ complete: false, adjustedCostPaise: null, sellingPaise: null, unavailableSourceLineItemKeys: ["invalid"] });
    expect(result.subBaskets.flatMap(target => target.contributions).map(row => row.sourceLineItemKey)).toEqual(["valid"]);
  });
  it("rejects an overflowing aggregate or duplicate contribution identity", () => {
    expect(() => projectInHouseComponentBreakdown([line("a", MAX_FINANCE_AMOUNT_PAISE, MAX_FINANCE_AMOUNT_PAISE), line("b", 1, 1)])).toThrow(RangeError);
    expect(() => projectInHouseComponentBreakdown([line("a"), line("a")])).toThrow(/more than one/);
  });
  it("reconciles across source baskets without changing commercial totals, digests, commitments or other projects", () => {
    const first = line("a");
    const second = { ...line("b", 45000, 45000, "3"), mainBasketId: "source-basket-b" };
    const commitments = new Map([["a", 123], ["b", 456]]);
    const baskets = projectProcurementBaskets(preparation([first, second]), commitments, targetNames);
    const groups = projectProcurementBasketModeGroups(baskets, commitments);
    expect(groups[0]).toMatchObject({ approvedEstimatePaise: 123333, currentCostPaise: 105000, committedNetPaise: 579,
      inHouseComponentBreakdown: { adjustedCostPaise: 105000, sellingPaise: 123333, subBaskets: [{ contributions: [{ sourceLineItemKey: "a" }, { sourceLineItemKey: "b" }] }] } });
    expect(groups.slice(1).every(group => group.inHouseComponentBreakdown === undefined)).toBe(true);
    const renamed = new Map([[procurementComponentTargetKey("target-basket", "target-sub"), { basketName: "Renamed", subBasketName: "Renamed finish" }]]);
    expect(projectProcurementBaskets(preparation([first, second]), commitments, renamed).map(basket => basket.preparationDigest))
      .toEqual(baskets.map(basket => basket.preparationDigest));
    const withoutDisplay = [first, second].map(({ estimateMode: _selection, ...value }) => value);
    expect(projectProcurementBaskets(preparation(withoutDisplay), commitments).map(basket => basket.preparationDigest))
      .toEqual(baskets.map(basket => basket.preparationDigest));
    const other = projectProcurementBasketModeGroups(projectProcurementBaskets(preparation([line("a", 1200, 1701, "1")], "project-b")));
    expect(other[0]).toMatchObject({ currentCostPaise: 1200, approvedEstimatePaise: 1701, committedNetPaise: 0,
      inHouseComponentBreakdown: { adjustedCostPaise: 1200, sellingPaise: 1701 } });
  });
});
