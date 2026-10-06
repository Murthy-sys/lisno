import { describe, expect, it } from "vitest";
import { calculateKnowledgeInHousePrice, calculateKnowledgePmcPrice, calculateKnowledgeSubVendorPrice } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { analyzePurchaseOrderModeSettings, buildPurchaseOrderModeCalculationStages,
  purchaseOrderModeDecisionSaveSchema, purchaseOrderModePreviewSchema,
  suggestStandardSubVendorCost } from "../src/domain/project-purchase-order-mode.js";

const uom = { id: "uom-area", name: "Square foot", decimalScale: 2 };
const pmc = { baseRatePaise: 997, lowQuantityLimit: "2.75", impactBps: 1_250, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 };
const subVendor = { ...pmc, baseRatePaise: 1_789, impactBps: 0 };
const labor = { ...pmc, baseRatePaise: 743, impactBps: 0, minimumMarkupBps: 1_000, startingMarkupBps: 2_500 };
const material = { ...pmc, baseRatePaise: 1_057, impactBps: 700, minimumMarkupBps: 1_500, startingMarkupBps: 3_000 };
const advanced = { modeCalculations: { pmc, sub_vendor: subVendor, in_house_labor: labor, in_house_material: material },
  pmcMarginBps: 1_525, subVendorMarginBps: 3_000 };

describe("procurement's read-only configured mode adapter", () => {
  it("prices a Standard Sub-Vendor suggestion from the pinned scope across the low-quantity boundary", () => {
    const configured = { ...advanced, modeCalculations: { ...advanced.modeCalculations,
      sub_vendor: { ...subVendor, baseRatePaise: 997, lowQuantityLimit: "2.75", impactBps: 1_250 } } };
    for (const quantity of ["2.74", "2.75", "2.76"]) {
      const suggestion = suggestStandardSubVendorCost({ advanced: configured, uom, quantity });
      const expected = calculateKnowledgeSubVendorPrice({ ...configured.modeCalculations.sub_vendor,
        subVendorMarginBps: configured.subVendorMarginBps, quantity, quantityScale: 2, discountBps: 0 });
      expect(suggestion.issues).toEqual([]);
      expect(suggestion.preview).toEqual({ mode: "sub_vendor", quantity,
        baseCostPaise: expected.baseAmountPaise, adjustedCostPaise: expected.revisedAmountPaise,
        baseRates: [{ scope: "sub_vendor", ratePaise: 997 }] });
      expect(suggestion.preview!.adjustedCostPaise - suggestion.preview!.baseCostPaise)
        .toBe(expected.lowQuantityImpactAmountPaise);
      expect(suggestion.preview).not.toHaveProperty("sellingPaise");
    }
    expect(suggestStandardSubVendorCost({ advanced, uom, quantity: "2.75" }).preview?.adjustedCostPaise)
      .toBe(suggestStandardSubVendorCost({ advanced, uom, quantity: "2.75" }).preview?.baseCostPaise);
    const missing = suggestStandardSubVendorCost({ advanced: { ...advanced,
      modeCalculations: { ...advanced.modeCalculations, sub_vendor: null } }, uom, quantity: "2.75" });
    expect(missing.preview).toBeNull();
    expect(missing.issues).toContainEqual(expect.objectContaining({ code: "CALCULATION_NOT_CONFIGURED" }));
  });
  it("prices Standard base and inclusive low-quantity impact without selling margin, markup or quantity slabs", () => {
    const costOnly = { modeCalculations: { sub_vendor: {
      baseRatePaise: 6_500, lowQuantityLimit: "1", impactBps: 1_500,
      minimumMarkupBps: -1, startingMarkupBps: null
    } }, subVendorMarginBps: null };
    expect(suggestStandardSubVendorCost({ advanced: costOnly, uom, quantity: "1" })).toEqual({
      preview: { mode: "sub_vendor", quantity: "1", baseCostPaise: 6_500, adjustedCostPaise: 7_475,
        baseRates: [{ scope: "sub_vendor", ratePaise: 6_500 }] }, issues: []
    });
    expect(analyzePurchaseOrderModeSettings({ advanced: costOnly, uom, mode: "sub_vendor", quantity: "1" }).preview).toBeNull();
    expect(suggestStandardSubVendorCost({ advanced: costOnly, uom, quantity: "1.01" }).preview)
      .toMatchObject({ baseCostPaise: 6_565, adjustedCostPaise: 6_565 });
    expect(suggestStandardSubVendorCost({ advanced: { modeCalculation: {
      baseRatePaise: 6_500, lowQuantityLimit: "1", impactBps: 1_500 } }, uom, quantity: "1" }).preview)
      .toMatchObject({ baseCostPaise: 6_500, adjustedCostPaise: 7_475 });
  });
  it("uses a project Base amount with the pinned Sub-vendor limit and accepts zero", () => {
    const saved = { modeCalculations: { sub_vendor: { baseRatePaise: 7_500,
      lowQuantityLimit: "1", impactBps: 1_000 } } };
    expect(suggestStandardSubVendorCost({ advanced: saved, uom, quantity: "1" }).preview)
      .toMatchObject({ baseCostPaise: 7_500, adjustedCostPaise: 8_250,
        baseRates: [{ ratePaise: 7_500 }] });
    expect(suggestStandardSubVendorCost({ advanced: saved, uom, quantity: "1",
      baseRateOverridePaise: 8_000 }).preview)
      .toMatchObject({ baseCostPaise: 8_000, adjustedCostPaise: 8_800,
        baseRates: [{ ratePaise: 8_000 }] });
    expect(suggestStandardSubVendorCost({ advanced: saved, uom, quantity: "1.01",
      baseRateOverridePaise: 8_000 }).preview)
      .toMatchObject({ baseCostPaise: 8_080, adjustedCostPaise: 8_080 });
    expect(suggestStandardSubVendorCost({ advanced: saved, uom, quantity: "1",
      baseRateOverridePaise: 0 }).preview)
      .toMatchObject({ baseCostPaise: 0, adjustedCostPaise: 0,
        baseRates: [{ ratePaise: 0 }] });
    expect(suggestStandardSubVendorCost({ advanced: { modeCalculations: { sub_vendor: null } },
      uom, quantity: "1", baseRateOverridePaise: 8_000 }).preview).toBeNull();
  });
  it("offers only complete saved scopes without borrowing another mode's cost or margin", () => {
    const payload = { ...advanced, modeCalculations: { ...advanced.modeCalculations, sub_vendor: null, in_house_material: null } };
    const before = structuredClone(payload);
    const result = analyzePurchaseOrderModeSettings({ advanced: payload, uom });
    expect(result.options.map((option) => option.key)).toEqual(["pmc"]);
    expect(result.availability).toEqual([
      { key: "pmc", label: "PMC", available: true, issues: [] },
      { key: "sub_vendor", label: "Sub-Vendor", available: false,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: expect.any(String) }] },
      { key: "in_house", label: "In-house", available: false,
        issues: [{ code: "CALCULATION_NOT_CONFIGURED", message: expect.any(String) }] }
    ]);
    expect(result.preview).toBeNull();
    expect(payload).toEqual(before);
    expect(analyzePurchaseOrderModeSettings({ advanced: { ...advanced, pmcMarginBps: null }, uom }).options.map((option) => option.key))
      .toEqual(["sub_vendor", "in_house"]);
  });

  it("uses PMC's inclusive low quantity boundary and freezes the exact selected settings", () => {
    const quantity = "2.75";
    const result = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "pmc", quantity, discountBps: 400 });
    const expected = calculateKnowledgePmcPrice({ ...pmc, pmcMarginBps: advanced.pmcMarginBps, quantity, quantityScale: 2, discountBps: 400 });
    expect(result.issues).toEqual([]);
    expect(result.preview).toMatchObject({ mode: "pmc", quantity, baseCostPaise: expected.baseAmountPaise,
      adjustedCostPaise: expected.revisedAmountPaise, appliedImpactBps: 1_250, sellingPaise: expected.totalPaise,
      marginBps: 1_525, settings: { configuredMarginBps: 1_525,
        scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 997, lowQuantityLimit: "2.75", impactBps: 1_250 }] } });
    expect(result.preview?.sellingPaise).not.toBe(result.preview?.adjustedCostPaise);
    const above = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "pmc", quantity: "2.76" });
    expect(above.preview?.appliedImpactBps).toBe(0);
  });

  it("exposes Sub-Vendor's signed remainder as internal evidence without using it as the purchase benchmark", () => {
    const result = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "sub_vendor", quantity: "1.50", discountBps: 9_500 });
    const expected = calculateKnowledgeSubVendorPrice({ ...subVendor, subVendorMarginBps: 3_000,
      quantity: "1.50", quantityScale: 2, discountBps: 9_500 });
    expect(expected.finalVendorChargesPaise).toBeLessThan(0);
    expect(result.preview).toMatchObject({ mode: "sub_vendor", adjustedCostPaise: expected.revisedAmountPaise,
      sellingPaise: expected.totalPaise, finalVendorChargesPaise: expected.finalVendorChargesPaise,
      settings: { configuredMarginBps: 3_000 } });
    expect(result.preview?.finalVendorChargesPaise).toBeLessThan(0);
  });

  it("rounds In-house labor and material independently with separate impact and floor", () => {
    const result = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "in_house", quantity: "2.75",
      discountBps: 500, markupBasis: "starting" });
    const expected = calculateKnowledgeInHousePrice({ labor, material, quantity: "2.75", quantityScale: 2,
      discountBps: 500, markupBasis: "starting" });
    expect(result.preview).toMatchObject({ mode: "in_house", sellingPaise: expected.totalPaise,
      adjustedCostPaise: expected.labor.revisedAmountPaise + expected.material.revisedAmountPaise,
      components: [{ scope: "labor", sellingPaise: expected.labor.totalPaise },
        { scope: "material", sellingPaise: expected.material.totalPaise }],
      settings: { scopes: [{ scope: "in_house_labor", baseRatePaise: 743 },
        { scope: "in_house_material", baseRatePaise: 1_057 }] } });
  });

  it("reports saved UOM precision, quantity slab boundaries and a separate wastage suggestion", () => {
    const quantityMargin = { gapBehavior: "no_adjustment", wastageBps: 500, quantitySlabs: [
      { id: "small", minimumQuantity: "0", maximumQuantity: "2.75", adjustmentBps: 500 },
      { id: "large", minimumQuantity: "2.75", maximumQuantity: null, adjustmentBps: 750 }
    ] };
    const exact = analyzePurchaseOrderModeSettings({ advanced, quantityMargin, uom, mode: "pmc", quantity: "2.75" });
    expect(exact.preview?.quantityRule).toEqual({ slabId: "large", minimumQuantity: "2.75", maximumQuantity: null,
      adjustmentBps: 750 });
    expect(exact.preview?.procurementQuantitySuggestion).toBe("2.89");
    expect(exact.preview?.adjustedCostPaise).toBe(calculateKnowledgePmcPrice({ ...pmc, pmcMarginBps: 1_525,
      quantity: "2.75", quantityScale: 2 }).revisedAmountPaise);
    const invalid = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "pmc", quantity: "2.751" });
    expect(invalid.preview).toBeNull();
    expect(invalid.issues.map((issue) => issue.code)).toContain("INVALID_QUANTITY_PRECISION");
    const gap = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "pmc", quantity: "4", quantityMargin: {
      gapBehavior: "reject", quantitySlabs: [{ id: "short", minimumQuantity: "0", maximumQuantity: "2", adjustmentBps: 0 }]
    } });
    expect(gap.preview).toBeNull();
    expect(gap.issues).toContainEqual(expect.objectContaining({ code: "MODE_CALCULATION_INVALID" }));
  });

  it("reconciles below, equal and above-limit PMC stages using the calculator's unit-rate rounding", () => {
    for (const quantity of ["2.74", "2.75", "2.76"]) {
      const preview = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "pmc", quantity,
        discountBps: 375 }).preview;
      expect(preview).not.toBeNull();
      const stage = buildPurchaseOrderModeCalculationStages(preview!)[0]!;
      const expected = calculateKnowledgePmcPrice({ ...pmc, pmcMarginBps: advanced.pmcMarginBps,
        quantity, quantityScale: 2, discountBps: 375 });
      expect(stage).toMatchObject({ scope: "pmc", baseRatePaise: pmc.baseRatePaise,
        thresholdMet: quantity !== "2.76", configuredImpactBps: pmc.impactBps,
        appliedImpactBps: quantity === "2.76" ? 0 : pmc.impactBps,
        adjustedUnitRatePaise: expected.revisedUnitRatePaise,
        adjustedCostPaise: expected.revisedAmountPaise, marginBps: advanced.pmcMarginBps,
        marginAmountPaise: expected.pmcMarginAmountPaise,
        discountBasisPaise: expected.pmcMarginAmountPaise,
        discountAmountPaise: expected.discount?.amountPaise,
        floorSellingPaise: expected.revisedAmountPaise, sellingPaise: expected.totalPaise });
      expect(stage.baseSubtotalPaise + stage.lowQuantityImpactPaise).toBe(stage.adjustedCostPaise);
      expect(stage.sellingBeforeDiscountPaise - stage.discountAmountPaise).toBe(stage.sellingPaise);
      expect(stage.sellingPaise).toBe(preview?.sellingPaise);
    }
  });

  it("distinguishes an explicit zero impact from the omitted compatibility default", () => {
    const zero = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "sub_vendor", quantity: "2.75" }).preview;
    expect(zero).not.toBeNull();
    expect(buildPurchaseOrderModeCalculationStages(zero!)).toMatchObject([{ scope: "sub_vendor", thresholdMet: true,
      configuredImpactBps: 0, appliedImpactBps: 0, lowQuantityImpactPaise: 0, floorSellingPaise: null }]);
    const legacyPmc = { ...pmc } as Record<string, unknown>;
    delete legacyPmc.impactBps;
    const inherited = analyzePurchaseOrderModeSettings({
      advanced: { ...advanced, modeCalculations: { ...advanced.modeCalculations, pmc: legacyPmc } },
      uom, mode: "pmc", quantity: "2.75"
    }).preview;
    expect(inherited).not.toBeNull();
    expect(buildPurchaseOrderModeCalculationStages(inherited!)).toMatchObject([{ scope: "pmc", thresholdMet: true,
      configuredImpactBps: 1_000, appliedImpactBps: 1_000 }]);
  });

  it("rounds unequal In-house labor and material separately and reconciles their stages", () => {
    const preview = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "in_house", quantity: "2.75",
      discountBps: 500, markupBasis: "starting" }).preview;
    expect(preview).not.toBeNull();
    const stages = buildPurchaseOrderModeCalculationStages(preview!);
    const expected = calculateKnowledgeInHousePrice({ labor, material, quantity: "2.75", quantityScale: 2,
      discountBps: 500, markupBasis: "starting" });
    expect(stages).toMatchObject([
      { scope: "in_house_labor", baseRatePaise: labor.baseRatePaise, thresholdMet: true,
        configuredImpactBps: 0, appliedImpactBps: 0, adjustedCostPaise: expected.labor.revisedAmountPaise,
        floorSellingPaise: expected.labor.floorPricePaise, sellingPaise: expected.labor.totalPaise },
      { scope: "in_house_material", baseRatePaise: material.baseRatePaise, thresholdMet: true,
        configuredImpactBps: 700, appliedImpactBps: 700, adjustedCostPaise: expected.material.revisedAmountPaise,
        floorSellingPaise: expected.material.floorPricePaise, sellingPaise: expected.material.totalPaise }
    ]);
    expect(stages[0]!.sellingPaise + stages[1]!.sellingPaise).toBe(preview?.sellingPaise);
    expect(stages[0]!.baseSubtotalPaise + stages[1]!.baseSubtotalPaise).toBe(preview?.baseCostPaise);
  });
});

describe("mode decision write contract", () => {
  const base = { sourceLineItemKey: "approved-line", expectedVersion: 0, idempotencyKey: "mode-key-0001",
    expectedEstimateSource: { estimateId: "estimate-a", estimateVersion: 1, estimateReviewRoundId: "round-a" },
    expectedRevisionDigest: "a".repeat(64), mode: "pmc" as const, quantity: "2.75" };
  it("requires a confirmed quantity for a selected mode", () => {
    expect(purchaseOrderModeDecisionSaveSchema.safeParse(base).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, expectedEstimateSource: undefined }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, expectedRevisionDigest: undefined }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, quantity: null }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, exceptionReason: "Historical exception" }).success).toBe(false);
  });
  it("allows a versioned clear or a reasoned historical exception", () => {
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, mode: null, quantity: null }).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, mode: null, quantity: null,
      exceptionReason: "Saved configuration is unavailable" }).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, mode: null, quantity: null,
      expectedRevisionDigest: undefined }).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, mode: null, quantity: null,
      discountBps: 100 }).success).toBe(false);
  });

  it("validates exact preview source and excludes write-only fields", () => {
    const input = { estimateSource: { estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "round-a" },
      sourceLineItemKey: "approved-line", expectedVersion: 0, mode: "pmc", quantity: "2.75",
      discountBps: 0, markupBasis: "starting" };
    expect(purchaseOrderModePreviewSchema.safeParse(input).success).toBe(true);
    expect(purchaseOrderModePreviewSchema.safeParse({ ...input, idempotencyKey: "forbidden" }).success).toBe(false);
    expect(purchaseOrderModePreviewSchema.safeParse({ ...input, estimateSource: { ...input.estimateSource,
      estimateReviewRoundId: "round-a", unexpected: true } }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base,
      expectedEstimateSource: input.estimateSource, expectedRevisionDigest: "a".repeat(64) }).success).toBe(true);
  });

  it("requires an exact observed digest and explicit reasoned acknowledgment for recovery", () => {
    const recovery = { expectedObservedDigest: "b".repeat(64),
      reason: "Buyer reviewed the saved calculation values.", acknowledge: true };
    expect(purchaseOrderModePreviewSchema.safeParse({ estimateSource: base.expectedEstimateSource,
      sourceLineItemKey: base.sourceLineItemKey, expectedVersion: base.expectedVersion,
      mode: base.mode, quantity: base.quantity, discountBps: 0, markupBasis: "starting",
      expectedObservedDigest: recovery.expectedObservedDigest }).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, recovery }).success).toBe(true);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, recovery: { ...recovery,
      acknowledge: false } }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, recovery: { ...recovery,
      reason: "short" } }).success).toBe(false);
    expect(purchaseOrderModeDecisionSaveSchema.safeParse({ ...base, mode: null, quantity: null,
      recovery }).success).toBe(false);
  });
});
