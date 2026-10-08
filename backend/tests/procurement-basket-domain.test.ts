import { describe, expect, it } from "vitest";
import { analyzePurchaseOrderModeSettings } from "../src/domain/project-purchase-order-mode.js";
import { projectProcurementBaskets } from "../src/domain/procurement-basket-projection.js";
import { averageProcurementBasketBidNetPaise, calculateProcurementBasketBid, compareProcurementBasketBids,
  procurementBasketAwardPreviewSchema, procurementBasketPaymentSchedule, requiredProcurementBasketApprovalSlots,
  withProcurementBasketMilestoneReviewers, type ProcurementBasketBoqLine } from "../src/domain/procurement-basket-tender.js";
import type { ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationEstimateLine } from "../src/domain/project-purchase-order-preparation.js";

function estimateLine(key: string, basketId: string, roomId: string, name: string, amountPaise: number | null,
  preview: { baseCostPaise: number; adjustedCostPaise: number; sellingPaise: number } | null,
  included = true): PurchaseOrderPreparationEstimateLine {
  const mode = preview ? { state: "ready", preview: { ...preview,
    settings: { scopes: [{ scope: "sub_vendor", baseRatePaise: preview.baseCostPaise / 2 }] } } }
    : { state: "selection_required", preview: null };
  return { key, included, source: "configuration", roomId, roomName: roomId,
    mainBasketId: basketId, mainBasketName: name, subBasketId: "sub-a", subBasketName: "Sub",
    mainLineId: `main-${key}`, mainLineName: key, quantity: "2", unit: "sq-ft", amountPaise, itemIds: [],
    mode: mode as PurchaseOrderPreparationEstimateLine["mode"] };
}
function preparation(lines: PurchaseOrderPreparationEstimateLine[]): ProjectPurchaseOrderPreparationDto {
  return { projectId: "project-1", orderDefaults: { targetDate: null, deliveryLocation: null },
    estimateSource: { estimateId: "estimate-1", estimateVersion: 2, estimateReviewRoundId: "round-1" },
    approvedEstimatePaise: 0, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0,
    remainingPaise: 0, estimateLines: lines, sections: [], netPaise: null, itemCount: 0, readyItemCount: 0,
    blockers: [], digest: "a".repeat(64) };
}
function boqLine(id: string, quantityMilliUnits: number): ProcurementBasketBoqLine {
  return { id, sourceLineItemKey: `source-${id}`, roomId: "room", roomName: "Room",
    subBasketId: "sub", subBasketName: "Sub", mainLineId: "main", mainLineName: "Main",
    approvedQuantity: "1", approvedUnit: "sq-ft", uomId: "uom", uomCode: "SQFT", uomDecimalScale: 2,
    description: "Vendor visible scope", quantityMilliUnits, scopeType: "execution",
    targetDate: "2026-12-01", deliveryLocation: "Site" };
}

describe("procurement basket finance and identity domain", () => {
  it("requires every actionable automatic Standard line to have pinned Sub-vendor cost and UOM", () => {
    const mode = { state: "selection_required", preview: null, decision: null,
      revision: { id: "revision-a", version: 2, status: "active", contentDigest: "a".repeat(64) },
      uom: { id: "uom-a", code: "SQFT", decimalScale: 2 }
    } as PurchaseOrderPreparationEstimateLine["mode"];
    const priced = { ...estimateLine("priced", "basket-a", "room-a", "POP", 40_000, null),
      mainBasketClassification: "standard" as const, mainBasketClassificationExplicit: true, mode,
      standardSuggestion: { preview: { mode: "sub_vendor" as const, quantity: "2",
        baseRates: [{ scope: "sub_vendor" as const, ratePaise: 10_000 }],
        baseCostPaise: 20_000, adjustedCostPaise: 22_000 }, issues: [] } };
    const missing = { ...estimateLine("missing", "basket-a", "room-b", "POP", 30_000, null),
      mainBasketClassification: "standard" as const, mainBasketClassificationExplicit: true, mode,
      standardSuggestion: { preview: null,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "Sub-vendor cost is unavailable." }] } };
    const partial = projectProcurementBaskets(preparation([priced, missing]))[0]!;
    expect(partial).toMatchObject({ automaticSubVendor: true, boqReady: false,
      standardCost: { complete: false, pricedLineCount: 1 } });
    const complete = projectProcurementBaskets(preparation([priced, {
      ...missing, standardSuggestion: priced.standardSuggestion
    }]))[0]!;
    expect(complete).toMatchObject({ automaticSubVendor: true, boqReady: true,
      standardCost: { complete: true, totalPaise: 44_000 } });
    expect(complete.preparationDigest).not.toBe(partial.preparationDigest);
  });

  it("shows provisional adjusted cost by basket ID without changing saved-mode selling or tender digests", () => {
    const advanced = { modeCalculations: { sub_vendor: { baseRatePaise: 10_000,
      lowQuantityLimit: "2", impactBps: 1_000, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 } },
      subVendorMarginBps: 3_000 };
    const uom = { id: "uom-a", name: "Square foot", decimalScale: 2 };
    const suggestedPreview = analyzePurchaseOrderModeSettings({ advanced, uom,
      mode: "sub_vendor", quantity: "2" }).preview!;
    const savedPreview = analyzePurchaseOrderModeSettings({ advanced, uom,
      mode: "sub_vendor", quantity: "3" }).preview!;
    const first = { ...estimateLine("line-a", "basket-a", "room-a", "Painting", 40_000, null),
      mainBasketClassification: "standard" as const,
      standardSuggestion: { preview: { mode: "sub_vendor" as const, quantity: "2",
        baseCostPaise: suggestedPreview.baseCostPaise, adjustedCostPaise: suggestedPreview.adjustedCostPaise,
        baseRates: [{ scope: "sub_vendor" as const, ratePaise: 10_000 }] }, issues: [] } };
    const second = { ...estimateLine("line-b", "basket-a", "room-b", "Painting", 60_000, null),
      mainBasketClassification: "standard" as const,
      mode: { state: "ready", decision: { mode: "sub_vendor", quantity: "3" }, preview: savedPreview } as PurchaseOrderPreparationEstimateLine["mode"] };
    const special = { ...estimateLine("line-c", "basket-b", "room-c", "Painting", 50_000, null),
      mainBasketClassification: "special" as const,
      mode: { state: "ready", decision: { mode: "sub_vendor", quantity: "2" }, preview: suggestedPreview } as PurchaseOrderPreparationEstimateLine["mode"] };
    const result = projectProcurementBaskets(preparation([first, second, special]));
    const standard = result.find(basket => basket.id === "basket-a")!;
    expect(standard).toMatchObject({ classification: "standard", includedLineCount: 2,
      readyLineCount: 1, workingTotalComplete: false, workingTotalPaise: savedPreview.sellingPaise,
      standardCost: { complete: true, provisional: true, pricedLineCount: 2,
        totalPaise: suggestedPreview.adjustedCostPaise + savedPreview.adjustedCostPaise } });
    expect(standard.lines[0]?.standardCost).toMatchObject({ state: "suggested", mode: "sub_vendor",
      calculationQuantity: "2", baseRates: [{ scope: "sub_vendor", ratePaise: 10_000 }],
      baseCostPaise: suggestedPreview.baseCostPaise,
      adjustedCostPaise: suggestedPreview.adjustedCostPaise });
    expect(standard.lines[0]).toMatchObject({ approvedQuantity: "2", baseUnitRatePaise: 10_000 });
    expect(standard.lines[1]?.standardCost).toMatchObject({ state: "saved", calculationQuantity: "3",
      baseCostPaise: savedPreview.baseCostPaise,
      adjustedCostPaise: savedPreview.adjustedCostPaise });
    expect(standard.lines[1]).toMatchObject({ approvedQuantity: "2", baseUnitRatePaise: 10_000 });
    expect(result.find(basket => basket.id === "basket-b")).toMatchObject({ classification: "special",
      standardCost: null, workingTotalPaise: suggestedPreview.sellingPaise,
      lines: [{ standardCost: null, baseUnitRatePaise: 10_000 }] });
    const withoutSuggestion = projectProcurementBaskets(preparation([
      { ...first, standardSuggestion: undefined }, second, special
    ]));
    expect(withoutSuggestion.find(basket => basket.id === "basket-a")?.preparationDigest).toBe(standard.preparationDigest);
    expect(withoutSuggestion.find(basket => basket.id === "basket-a")?.standardCost).toMatchObject({
      totalPaise: null, complete: false, provisional: false, pricedLineCount: 1 });
  });

  it("keeps a Standard total incomplete for missing Sub-Vendor settings and ignores reference-only lines", () => {
    const unpriced = { ...estimateLine("line-a", "basket-a", "room-a", "Painting", 10_000, null),
      standardSuggestion: { preview: null,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: "No saved Sub-Vendor scope." }] } };
    const excluded = estimateLine("excluded", "basket-a", "room-b", "Painting", null, null, false);
    const zero = estimateLine("zero", "basket-a", "room-c", "Painting", 0, null);
    const basket = projectProcurementBaskets(preparation([unpriced, excluded, zero]))[0]!;
    expect(basket.standardCost).toEqual({ totalPaise: null, complete: false, provisional: false, pricedLineCount: 0 });
    expect(basket.lines[0]?.standardCost).toMatchObject({ state: "unavailable", baseCostPaise: null,
      adjustedCostPaise: null,
      issues: [{ code: "CALCULATION_NOT_CONFIGURED" }] });
    expect(basket.lines[0]?.baseUnitRatePaise).toBeNull();
    expect(basket.lines[1]?.baseUnitRatePaise).toBeNull();
    expect(basket.lines[1]?.standardCost).toBeNull();
    expect(basket.lines[2]?.standardCost).toBeNull();
  });
  it("adds saved In-house labor and material rates as one per-unit base without changing the line subtotal", () => {
    const advanced = { modeCalculations: {
      in_house_labor: { baseRatePaise: 5_000, lowQuantityLimit: "1", impactBps: 1_000,
        minimumMarkupBps: 500, startingMarkupBps: 1_000 },
      in_house_material: { baseRatePaise: 7_000, lowQuantityLimit: "1", impactBps: 500,
        minimumMarkupBps: 500, startingMarkupBps: 1_000 }
    } };
    const preview = analyzePurchaseOrderModeSettings({ advanced,
      uom: { id: "uom-a", name: "Square foot", decimalScale: 2 },
      mode: "in_house", quantity: "3" }).preview!;
    const line = { ...estimateLine("line-a", "basket-a", "room-a", "Ceiling", 50_000, null),
      quantity: "3", mainBasketClassification: "special" as const,
      mode: { state: "ready", decision: { mode: "in_house", quantity: "3" }, preview } as PurchaseOrderPreparationEstimateLine["mode"] };
    const basket = projectProcurementBaskets(preparation([line]))[0]!;
    expect(basket.lines[0]).toMatchObject({ approvedQuantity: "3", standardCost: null,
      baseUnitRatePaise: 12_000,
      mode: { preview: { baseCostPaise: 36_000, adjustedCostPaise: 36_000 } } });
    const standard = projectProcurementBaskets(preparation([{
      ...line, mainBasketClassification: "standard" as const
    }]))[0]!;
    expect(standard.lines[0]).toMatchObject({ baseUnitRatePaise: 12_000,
      standardCost: { state: "saved", baseCostPaise: 36_000, adjustedCostPaise: 36_000,
        baseRates: [{ scope: "in_house_labor", ratePaise: 5_000 },
          { scope: "in_house_material", ratePaise: 7_000 }] } });
  });
  it("groups by stable basket ID across rooms, excludes unselected values, and labels partial mode totals", () => {
    const result = projectProcurementBaskets(preparation([
      estimateLine("a", "basket-1", "room-1", "Painting", 10_000,
        { baseCostPaise: 6_000, adjustedCostPaise: 6_500, sellingPaise: 8_000 }),
      estimateLine("b", "basket-1", "room-2", "Painting", 20_000, null),
      estimateLine("excluded", "basket-1", "room-2", "Painting", null,
        { baseCostPaise: 100_000, adjustedCostPaise: 100_000, sellingPaise: 100_000 }, false),
      estimateLine("c", "basket-2", "room-1", "Painting", 9_000,
        { baseCostPaise: 4_000, adjustedCostPaise: 4_500, sellingPaise: 5_500 })
    ]), new Map([["a", 3_000], ["c", 1_000]]));
    expect(result).toHaveLength(2);
    const first = result.find(basket => basket.id === "basket-1")!;
    expect(first).toMatchObject({ includedLineCount: 2, readyLineCount: 1, approvedEstimatePaise: 30_000,
      baseCostPaise: 6_000, adjustedCostPaise: 6_500, workingTotalPaise: 8_000,
      workingTotalComplete: false, committedNetPaise: 3_000, state: "partial" });
    expect(first.lines.map(line => line.roomId)).toEqual(["room-1", "room-2", "room-2"]);
    expect(result.find(basket => basket.id === "basket-2")).toMatchObject({ includedLineCount: 1,
      workingTotalComplete: true, committedNetPaise: 1_000, state: "ready" });
  });

  it("keeps one basket's tender digest stable when another basket is committed", () => {
    const lines = [
      estimateLine("a", "basket-a", "room-a", "Painting", 10_000,
        { baseCostPaise: 6_000, adjustedCostPaise: 6_500, sellingPaise: 8_000 }),
      estimateLine("b", "basket-b", "room-b", "Ceiling", 20_000,
        { baseCostPaise: 12_000, adjustedCostPaise: 13_000, sellingPaise: 16_000 })
    ];
    const before = projectProcurementBaskets(preparation(lines));
    const afterGlobalCommitment = projectProcurementBaskets({ ...preparation(lines),
      committedPaise: 7_000, digest: "b".repeat(64),
      estimateLines: lines.map(line => line.key === "b" ? { ...line, itemIds: ["po-item-b"] } : line) },
    new Map([["b", 7_000]]));
    expect(afterGlobalCommitment.find(item => item.id === "basket-a")!.preparationDigest)
      .toBe(before.find(item => item.id === "basket-a")!.preparationDigest);
    expect(afterGlobalCommitment.find(item => item.id === "basket-b")!.preparationDigest)
      .toBe(before.find(item => item.id === "basket-b")!.preparationDigest);
    const changedMode = projectProcurementBaskets(preparation(lines.map(line => line.key === "a" ? {
      ...line, mode: { ...line.mode!, preview: { ...line.mode!.preview!, sellingPaise: 8_500 } }
    } : line)));
    expect(changedMode.find(item => item.id === "basket-a")!.preparationDigest)
      .not.toBe(before.find(item => item.id === "basket-a")!.preparationDigest);
    expect(changedMode.find(item => item.id === "basket-b")!.preparationDigest)
      .toBe(before.find(item => item.id === "basket-b")!.preparationDigest);
  });

  it("prices every frozen BOQ line with the purchase-order paise arithmetic and rejects partial quotes", () => {
    const boq = [boqLine("a", 1_500), boqLine("b", 2_000)];
    const result = calculateProcurementBasketBid(boq, [
      { boqLineId: "b", unitPricePaise: 2_000, gstBasisPoints: 0 },
      { boqLineId: "a", unitPricePaise: 1_001, gstBasisPoints: 1_800 }
    ]);
    expect(result.lines.map(line => line.boqLineId)).toEqual(["a", "b"]);
    expect(result.lines[0]).toMatchObject({ netPaise: 1_502, gstPaise: 270, totalPaise: 1_772 });
    expect(result.totals).toEqual({ netPaise: 5_502, gstPaise: 270, totalPaise: 5_772 });
    expect(() => calculateProcurementBasketBid(boq, [{ boqLineId: "a", unitPricePaise: 1_000,
      gstBasisPoints: 0 }])).toThrow(/every BOQ line/u);
  });

  it("recommends using equal KPI and normalized pre-GST price with deterministic ties", () => {
    const compared = compareProcurementBasketBids([
      { bidId: "bid-a", vendorId: "vendor-a", vendorName: "A", officialKpiScoreBps: 9_000,
        quoteNetPaise: 120_000, quoteGstPaise: 21_600, quoteGrossPaise: 141_600, eligible: true, blockers: [] },
      { bidId: "bid-b", vendorId: "vendor-b", vendorName: "B", officialKpiScoreBps: 8_000,
        quoteNetPaise: 100_000, quoteGstPaise: 18_000, quoteGrossPaise: 118_000, eligible: true, blockers: [] },
      { bidId: "bid-c", vendorId: "vendor-c", vendorName: "C", officialKpiScoreBps: null,
        quoteNetPaise: 50_000, quoteGstPaise: 0, quoteGrossPaise: 50_000, eligible: false, blockers: ["kpi_unrated"] }
    ]);
    expect(compared.recommendedBidId).toBe("bid-b");
    expect(compared.rows.find(row => row.bidId === "bid-b")).toMatchObject({ priceScoreBps: 10_000,
      comparisonScoreBps: 9_000, priorityRank: 1, recommended: true });
    expect(compared.rows.find(row => row.bidId === "bid-a")).toMatchObject({ priceScoreBps: 8_333,
      comparisonScoreBps: 8_667, priorityRank: 2, recommended: false });
    expect(compared.rows.find(row => row.bidId === "bid-c")).toMatchObject({ priceScoreBps: null,
      comparisonScoreBps: null, priorityRank: null, recommended: false });
  });

  it("keeps response order while resolving equal scores by the established price and vendor tie-breaks", () => {
    const bids = ["vendor-z", "vendor-a", "vendor-b"].map((vendorId, index) => ({
      bidId: `bid-${vendorId}`, vendorId, vendorName: vendorId, officialKpiScoreBps: 8_000,
      quoteNetPaise: index === 2 ? 150 : 100, quoteGstPaise: 0,
      quoteGrossPaise: index === 2 ? 150 : 100, eligible: true, blockers: []
    }));
    const compared = compareProcurementBasketBids(bids);
    expect(compared.rows.map(row => [row.vendorId, row.priorityRank])).toEqual([
      ["vendor-z", 2], ["vendor-a", 1], ["vendor-b", 3]
    ]);
    expect(compared.recommendedBidId).toBe("bid-vendor-a");
    expect(compared.rows.filter(row => row.recommended).map(row => row.bidId)).toEqual(["bid-vendor-a"]);
  });

  it("averages positive complete pre-GST totals to the nearest paise without unsafe addition", () => {
    expect(averageProcurementBasketBidNetPaise([])).toBeNull();
    expect(averageProcurementBasketBidNetPaise([0, -1, Number.NaN])).toBeNull();
    expect(averageProcurementBasketBidNetPaise([101, 200, 0])).toBe(151);
    expect(averageProcurementBasketBidNetPaise([9_000_000_000_000, 9_000_000_000_000])).toBe(9_000_000_000_000);
  });

  it("uses gross ₹50,000 boundary and reconciles the five milestones even for a one-paise order", () => {
    expect(requiredProcurementBasketApprovalSlots(5_000_000)).toEqual(["procurement"]);
    expect(requiredProcurementBasketApprovalSlots(5_000_001)).toEqual(["program_manager", "designer", "procurement", "finance_head"]);
    for (const gross of [1, 7, 5_000_000, 5_000_001]) for (const advance of [0, 2_000, 10_000]) {
      const schedule = procurementBasketPaymentSchedule(gross, advance);
      expect(schedule.map(row => row.id)).toEqual(["advance", "mobilisation", "progress_50", "progress_85", "final"]);
      expect(schedule.reduce((sum, row) => sum + row.basisPoints, 0)).toBe(10_000);
      expect(schedule.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(gross);
      expect(schedule.every(row => row.amountPaise >= 0)).toBe(true);
    }
  });

  it("defaults small awards to Procurement on every row and leaves high-value chips open for draft editing", () => {
    const small = withProcurementBasketMilestoneReviewers(4_400_000, procurementBasketPaymentSchedule(4_400_000, 2_000));
    expect(small.map(row => row.reviewerSlots)).toEqual(Array.from({ length: 5 }, () => ["procurement"]));
    const large = withProcurementBasketMilestoneReviewers(5_000_001, procurementBasketPaymentSchedule(5_000_001, 2_000));
    expect(large.map(row => row.reviewerSlots)).toEqual([[], [], [], [], []]);
    expect(() => withProcurementBasketMilestoneReviewers(4_400_000, small,
      small.map(row => ({ id: row.id, reviewerSlots: [] })))).toThrow("require Procurement");
  });

  it("rejects duplicate, missing, and unsupported payment-row approvers", () => {
    const rows = procurementBasketPaymentSchedule(5_000_001, 2_000).map(row => ({ id: row.id, reviewerSlots: ["procurement"] }));
    expect(procurementBasketAwardPreviewSchema.safeParse({ bidId: "bid-a", advanceBasisPoints: 2_000,
      milestoneReviewers: rows }).success).toBe(true);
    expect(procurementBasketAwardPreviewSchema.safeParse({ bidId: "bid-a", advanceBasisPoints: 2_000,
      milestoneReviewers: [...rows.slice(0, 4), rows[0]] }).success).toBe(false);
    expect(procurementBasketAwardPreviewSchema.safeParse({ bidId: "bid-a", advanceBasisPoints: 2_000,
      milestoneReviewers: rows.map(row => ({ ...row, reviewerSlots: ["procurement", "procurement"] })) }).success).toBe(false);
    expect(procurementBasketAwardPreviewSchema.safeParse({ bidId: "bid-a", advanceBasisPoints: 2_000,
      milestoneReviewers: rows.map(row => ({ ...row, reviewerSlots: ["budget_override"] })) }).success).toBe(false);
  });
});
