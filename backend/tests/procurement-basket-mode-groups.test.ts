import { describe, expect, it } from "vitest";
import { MAX_FINANCE_AMOUNT_PAISE } from "../src/domain/project-finance.js";
import { projectProcurementBasketModeGroups, readApprovedEstimateSelection, resolveProcurementEstimateMode } from "../src/domain/procurement-basket-mode-groups.js";
import { projectProcurementBaskets } from "../src/domain/procurement-basket-projection.js";
import type { ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationEstimateLine } from "../src/domain/project-purchase-order-preparation.js";

function line(key: string, classification: unknown, pricingMode: unknown, amountPaise = 10_000,
  overrides: Partial<PurchaseOrderPreparationEstimateLine> = {}): PurchaseOrderPreparationEstimateLine {
  return { key, source: "configuration", included: true, itemType: "main_line", roomId: "room-a", roomName: "Living",
    mainBasketId: "basket-a", mainBasketName: "Painting", subBasketId: "sub-a", subBasketName: "Walls",
    mainLineId: "same-main-line", mainLineName: "Wall finish", mainBasketClassification: "special",
    quantity: "2", unit: "sqft", amountPaise, itemIds: [],
    estimateMode: resolveProcurementEstimateMode(readApprovedEstimateSelection(classification, pricingMode)),
    mode: { state: "ready", decision: { mode: "pmc" }, revision: { status: "active" },
      uom: { id: "uom-a", code: "SQFT", decimalScale: 2 }, preview: { mode: "pmc", baseCostPaise: amountPaise / 2,
        adjustedCostPaise: amountPaise / 2, sellingPaise: amountPaise,
        settings: { scopes: [{ scope: "pmc", baseRatePaise: amountPaise / 4 }] } } } as PurchaseOrderPreparationEstimateLine["mode"],
    ...overrides };
}
function preparation(lines: PurchaseOrderPreparationEstimateLine[]): ProjectPurchaseOrderPreparationDto {
  return { projectId: "project-a", estimateSource: { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a" },
    estimateLines: lines, orderDefaults: { targetDate: null, deliveryLocation: null }, approvedEstimatePaise: 0,
    committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 0, sections: [], netPaise: 0,
    itemCount: 0, readyItemCount: 0, blockers: [], digest: "a".repeat(64) };
}
const project = (lines: PurchaseOrderPreparationEstimateLine[], commitments = new Map<string, number>()) =>
  projectProcurementBasketModeGroups(projectProcurementBaskets(preparation(lines), commitments), commitments);

describe("approved estimate mode resolution", () => {
  it.each([
    ["standard", undefined, "sub_vendor"], ["standard", "sub_vendor", "sub_vendor"],
    ["special", "pmc", "pmc"], ["special", "sub_vendor", "sub_vendor"], ["special", "in_house", "in_house"]
  ])("maps %s with %s using line provenance", (classification, pricingMode, mode) => {
    expect(resolveProcurementEstimateMode(readApprovedEstimateSelection(classification, pricingMode)))
      .toMatchObject({ approvedClassification: classification, approvedPricingMode: pricingMode ?? null,
        mode, provenance: "line", issues: [] });
  });
  it.each([["special", undefined], [undefined, "pmc"], ["standard", "in_house"], ["standard", "pmc"],
    ["wrong", "sub_vendor"], ["special", "wrong"], [{ unsafe: true }, undefined]])
    ("keeps missing/conflicting %s/%s unrecorded without borrowing legacy defaults", (classification, pricingMode) => {
      const selection = readApprovedEstimateSelection(classification, pricingMode);
      expect(resolveProcurementEstimateMode(selection, true)).toMatchObject({ mode: null, provenance: "unrecorded" });
      expect(resolveProcurementEstimateMode(selection, true).issues.length).toBeGreaterThan(0);
    });
  it("uses a historical Standard default only when neither line value is present", () => {
    expect(resolveProcurementEstimateMode({}, true)).toEqual({ approvedClassification: null, approvedPricingMode: null,
      mode: "sub_vendor", provenance: "legacy_basket", issues: [] });
    expect(resolveProcurementEstimateMode({})).toMatchObject({ mode: null, provenance: "unrecorded" });
  });
});

describe("procurement mode subsets", () => {
  it("partitions mixed baskets, distinct rooms and same names without duplicating money or changing commercial digests", () => {
    const lines = [line("standard", "standard", undefined, 10_000),
      line("special-sub", "special", "sub_vendor", 20_000),
      line("in-house", "special", "in_house", 30_000, { roomId: "room-b", roomName: "Dining" }),
      line("pmc", "special", "pmc", 40_000, { itemType: "temporary", subBasketId: null, subBasketName: null }),
      line("other-basket", "special", "in_house", 50_000, { mainBasketId: "basket-b" })];
    const commitments = new Map([["standard", 111], ["special-sub", 222], ["in-house", 333], ["pmc", 444], ["other-basket", 555]]);
    const baskets = projectProcurementBaskets(preparation(lines), commitments);
    const groups = projectProcurementBasketModeGroups(baskets, commitments);
    expect(groups.map(group => group.mode)).toEqual(["in_house", "sub_vendor", "pmc"]);
    expect(groups.map(group => [group.basketCount, group.includedLineCount, group.approvedEstimatePaise, group.currentCostPaise]))
      .toEqual([[2, 2, 80_000, 40_000], [1, 2, 30_000, 15_000], [1, 1, 40_000, 20_000]]);
    expect(groups[1]?.baskets[0]?.sourceLineItemKeys).toEqual(["standard", "special-sub"]);
    const keys = groups.flatMap(group => group.baskets.flatMap(basket => basket.sourceLineItemKeys));
    expect(new Set(keys).size).toBe(lines.length);
    expect(groups.reduce((sum, group) => sum + group.approvedEstimatePaise, 0))
      .toBe(baskets.reduce((sum, basket) => sum + basket.approvedEstimatePaise, 0));
    expect(groups.reduce((sum, group) => sum + group.committedNetPaise, 0))
      .toBe(baskets.reduce((sum, basket) => sum + basket.committedNetPaise, 0));
    expect(groups.every(group => group.readinessPercent === 100)).toBe(true);
    const withoutDisplay = lines.map(({ estimateMode: _display, ...source }) => source);
    expect(baskets.map(basket => basket.preparationDigest))
      .toEqual(projectProcurementBaskets(preparation(withoutDisplay), commitments).map(basket => basket.preparationDigest));
    const differentProject = preparation([line("different-project", "special", "pmc", 7_004)]);
    differentProject.projectId = "project-b";
    expect(projectProcurementBasketModeGroups(projectProcurementBaskets(differentProject))[2]?.approvedEstimatePaise).toBe(7_004);
  });
  it("counts real BOQ readiness instead of saved previews, and sums counts before rounding", () => {
    const ready = line("ready", "special", "pmc");
    const draft = line("draft", "special", "pmc");
    draft.mode!.revision!.status = "draft";
    const unavailable = line("unavailable", "special", "pmc", 20_000, { mainBasketId: "basket-b", mode: null });
    expect(project([ready, draft, unavailable])[2]).toMatchObject({ includedLineCount: 3, boqReadyLineCount: 1,
      readinessPercent: 33, currentCostPaise: null, currentCostComplete: false, unpricedLineCount: 1 });
  });
  it("takes automatic Standard cost from existing canonical suggestions, independent of estimate grouping", () => {
    const value = line("standard", "special", "in_house", 10_000, { mainBasketClassification: "standard",
      mainBasketClassificationExplicit: true, standardSuggestion: { preview: { mode: "sub_vendor", quantity: "2",
        baseRates: [{ scope: "sub_vendor", ratePaise: 2_500 }], baseCostPaise: 5_000, adjustedCostPaise: 6_000 }, issues: [] } });
    expect(project([value])[0]).toMatchObject({ currentCostPaise: 6_000, includedLineCount: 1 });
  });
  it("retains reference-only commitments without counts or cost, and omits uncommitted reference subsets", () => {
    const lines = [line("selected", "standard", undefined, 10_000), line("zero", "special", "pmc", 0),
      line("excluded", "special", "in_house", 20_000, { included: false }),
      line("uncommitted", undefined, undefined, 0)];
    const groups = project(lines, new Map([["selected", 111], ["zero", 222], ["excluded", 333]]));
    expect(groups.map(group => group.mode)).toEqual(["in_house", "sub_vendor", "pmc"]);
    expect(groups[0]).toMatchObject({ includedLineCount: 0, boqReadyLineCount: 0, readinessPercent: null,
      approvedEstimatePaise: 0, currentCostPaise: 0, currentCostComplete: true, committedNetPaise: 333 });
    expect(groups[2]).toMatchObject({ includedLineCount: 0, committedNetPaise: 222 });
    expect(groups.reduce((sum, group) => sum + group.committedNetPaise, 0)).toBe(666);
  });
  it("distinguishes valid zero costs and historical mode issues from missing cost", () => {
    const zero = line("valid-zero", "special", "pmc");
    zero.mode!.preview!.adjustedCostPaise = 0;
    expect(project([zero])[2]).toMatchObject({ currentCostPaise: 0, currentCostComplete: true, unpricedLineCount: 0 });
    expect(project([line("unknown", "special", undefined, 10_000, { mode: null })])[3])
      .toMatchObject({ mode: "unrecorded", currentCostPaise: null, unpricedLineCount: 1, modeIssueCount: 1 });
    expect(project([])).toHaveLength(3);
    expect(project([]).every(group => group.currentCostPaise === 0 && group.currentCostComplete && group.readinessPercent === null)).toBe(true);
  });
  it("rejects invalid, overflowing amounts and duplicate source identities", () => {
    const basket = projectProcurementBaskets(preparation([line("line-a", "special", "pmc")]))[0]!;
    expect(() => projectProcurementBasketModeGroups([basket, { ...basket, id: "other" }])).toThrow(/more than one basket/);
    expect(() => projectProcurementBasketModeGroups([basket], new Map([["line-a", -1]]))).toThrow(RangeError);
    const second = projectProcurementBaskets(preparation([line("line-b", "special", "pmc", 10_000, { mainBasketId: "basket-b" })]))[0]!;
    expect(() => projectProcurementBasketModeGroups([basket, second],
      new Map([["line-a", MAX_FINANCE_AMOUNT_PAISE], ["line-b", 1]]))).toThrow(RangeError);
  });
});
