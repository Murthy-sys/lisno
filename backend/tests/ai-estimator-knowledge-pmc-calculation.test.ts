import { describe, expect, it, vi } from "vitest";

import { calculateKnowledgePreview, KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE, type CalculateKnowledgePreviewInput } from "../src/domain/ai-estimator-knowledge-calculation.js";
import { calculateKnowledgePmcPrice, calculateKnowledgeModePrice, calculateKnowledgeInHousePrice, KNOWLEDGE_PMC_MAX_IMPACT_BPS } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { aiEstimatorKnowledgePreviewSchema } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import type { PublicUser } from "../src/services/auth.service.js";

const settings = { baseRatePaise: 12_345, lowQuantityLimit: "3", impactBps: 1_250, pmcMarginBps: 1_525 };
const input = { ...settings, quantity: "2.5", quantityScale: 1 };
const previewInput = { pmcCalculation: settings, quantity: "2.5", quantityScale: 1 };
const execution = { baseRatePaise: 50_000, lowQuantityLimit: "7", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const actor: PublicUser = { id: "pmc-reader", name: "PMC reader", email: "pmc-reader@lisno.example", role: "super_admin" };

describe("PMC simulator arithmetic", () => {
  it.each([[1_000, 38_192], [1_525, 40_015], [2_000, 41_664]])(
    "adds the %s-bps PMC margin to an independently rounded rate and quantity", (pmcMarginBps, totalPaise) => {
      expect(calculateKnowledgePmcPrice({ ...input, pmcMarginBps })).toEqual({
        baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
        revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
        totalPaise, pmcMarginBps, pmcMarginAmountPaise: totalPaise - 34_720, totalBeforeDiscountPaise: totalPaise,
        finalVendorChargesPaise: 34_720
      });
    }
  );

  it("applies configured Impact at the threshold and stops above it", () => {
    expect(calculateKnowledgePmcPrice({ ...input, quantity: "3" })).toMatchObject({
      baseAmountPaise: 37_035, lowQuantityImpactAmountPaise: 4_629, revisedUnitRatePaise: 13_888, revisedAmountPaise: 41_664,
      appliedImpactBps: 1_250, pmcMarginAmountPaise: 6_354, totalPaise: 48_018, finalVendorChargesPaise: 41_664
    });
    expect(calculateKnowledgePmcPrice({ ...input, quantity: "4" })).toMatchObject({
      baseAmountPaise: 49_380, lowQuantityImpactAmountPaise: 0, revisedUnitRatePaise: 12_345, revisedAmountPaise: 49_380,
      appliedImpactBps: 0, totalPaise: 56_910, finalVendorChargesPaise: 49_380
    });
  });

  it.each([
    ["14", 154_000, 1_000, 170_016], ["15", 165_000, 1_000, 182_160], ["16", 160_000, 0, 176_640]
  ] as const)("uses the inclusive limit of 15 for quantity %s, including margin and discount", (quantity, revisedAmountPaise, appliedImpactBps, totalPaise) => {
    const result = calculateKnowledgePmcPrice({ baseRatePaise: 10_000, lowQuantityLimit: "15", quantity, quantityScale: 0, pmcMarginBps: 1_500, discountBps: 400 });
    expect(result).toMatchObject({ revisedAmountPaise, appliedImpactBps, totalPaise });
    expect(result.baseAmountPaise + result.lowQuantityImpactAmountPaise).toBe(result.revisedAmountPaise);
    expect(result.finalVendorChargesPaise + result.pmcMarginAmountPaise).toBe(result.totalPaise);
  });

  it("uses an unequal fractional limit and preserves paise rounding at equality", () => {
    const fractional = { baseRatePaise: 997, lowQuantityLimit: "2.75", impactBps: 1_250, quantityScale: 2, pmcMarginBps: 1_525, discountBps: 400 };
    expect(calculateKnowledgePmcPrice({ ...fractional, quantity: "2.74" })).toMatchObject({ revisedAmountPaise: 3_074, appliedImpactBps: 1_250 });
    expect(calculateKnowledgePmcPrice({ ...fractional, quantity: "2.75" })).toMatchObject({
      baseAmountPaise: 2_742, lowQuantityImpactAmountPaise: 344, revisedAmountPaise: 3_086,
      pmcMarginAmountPaise: 471, totalBeforeDiscountPaise: 3_557, discount: { amountPaise: 142 },
      totalPaise: 3_415, finalVendorChargesPaise: 2_944
    });
    expect(calculateKnowledgePmcPrice({ ...fractional, quantity: "2.76" })).toMatchObject({ revisedAmountPaise: 2_752, appliedImpactBps: 0 });
  });

  it("keeps Execution and In-house equality outside their low-quantity range", () => {
    const rate = { ...execution, baseRatePaise: 10_000, lowQuantityLimit: "15", impactBps: 1_000 };
    expect(calculateKnowledgeModePrice({ ...rate, quantity: "15", quantityScale: 0 })).toMatchObject({ revisedAmountPaise: 150_000, appliedImpactBps: 0 });
    expect(calculateKnowledgeInHousePrice({ labor: rate, material: { ...rate, baseRatePaise: 7_000 }, quantity: "15", quantityScale: 0 }))
      .toMatchObject({ labor: { revisedAmountPaise: 150_000, appliedImpactBps: 0 }, material: { revisedAmountPaise: 105_000, appliedImpactBps: 0 } });
  });

  it("charges no Impact when configured zero, including at or below the limit", () => {
    expect(calculateKnowledgePmcPrice({ ...input, impactBps: 0 })).toMatchObject({
      baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 0, revisedUnitRatePaise: 12_345, revisedAmountPaise: 30_863,
      appliedImpactBps: 0, totalPaise: 35_570, finalVendorChargesPaise: 30_863
    });
    expect(calculateKnowledgePmcPrice({ ...input, impactBps: 0, quantity: "3" })).toMatchObject({
      lowQuantityImpactAmountPaise: 0, revisedUnitRatePaise: 12_345, revisedAmountPaise: 37_035, appliedImpactBps: 0
    });
  });

  it("returns zero amounts for zero quantity", () => {
    expect(calculateKnowledgePmcPrice({ ...input, quantity: "0", discountBps: 455 })).toMatchObject({
      baseAmountPaise: 0, lowQuantityImpactAmountPaise: 0,
      revisedAmountPaise: 0, pmcMarginAmountPaise: 0, totalBeforeDiscountPaise: 0,
      discount: { amountPaise: 0 }, totalPaise: 0, finalVendorChargesPaise: 0
    });
  });

  it("defaults old Impact to 10% and reconciles fractional-paise rounding", () => {
    expect(calculateKnowledgePmcPrice({ baseRatePaise: 997, lowQuantityLimit: "1", quantity: "0.25", quantityScale: 2, pmcMarginBps: 1_525, discountBps: 455 }))
      .toEqual({ baseAmountPaise: 249, lowQuantityImpactAmountPaise: 25,
        revisedUnitRatePaise: 1_097, revisedAmountPaise: 274, appliedImpactBps: 1_000,
        totalPaise: 302, pmcMarginBps: 1_525, pmcMarginAmountPaise: 42, totalBeforeDiscountPaise: 316,
        discount: { rateBps: 455, totalBeforeDiscountPaise: 316, amountPaise: 14 }, finalVendorChargesPaise: 260
      });
  });

  it.each([[0, 40_015, 0], [125, 39_515, 500], [455, 38_194, 1_821]])(
    "applies a %s-bps discount after adding PMC margin", (discountBps, totalPaise, amountPaise) => {
      const result = calculateKnowledgePmcPrice({ ...input, discountBps });
      expect(result).toMatchObject({
        pmcMarginBps: 1_525, pmcMarginAmountPaise: 5_295, totalBeforeDiscountPaise: 40_015, totalPaise,
        discount: { rateBps: discountBps, totalBeforeDiscountPaise: 40_015, amountPaise }, finalVendorChargesPaise: totalPaise - 5_295
      });
      expect(result).not.toHaveProperty("effectiveMarginBps");
      expect(result).not.toHaveProperty("additionalLowQuantityImpactBps");
      expect(result).not.toHaveProperty("additionalLowQuantityImpactAmountPaise");
      expect(result.discount).not.toHaveProperty("effectiveMarginBps");
      expect(result.totalPaise + result.discount!.amountPaise).toBe(result.totalBeforeDiscountPaise);
      expect(result.finalVendorChargesPaise + result.pmcMarginAmountPaise).toBe(result.totalPaise);
      expect(result.baseAmountPaise + result.lowQuantityImpactAmountPaise).toBe(result.revisedAmountPaise);
      expect(settings.pmcMarginBps).toBe(1_525);
    }
  );

  it("uses each amount's own margin subtotal as the discount basis", () => {
    const result = calculateKnowledgePmcPrice({ baseRatePaise: 50_000, lowQuantityLimit: "1", impactBps: 0, quantity: "3.25", quantityScale: 2, pmcMarginBps: 2_000, discountBps: 500 });
    expect(result).toMatchObject({ revisedAmountPaise: 162_500, pmcMarginAmountPaise: 32_500,
      totalBeforeDiscountPaise: 195_000, totalPaise: 185_250,
      discount: { rateBps: 500, totalBeforeDiscountPaise: 195_000, amountPaise: 9_750 }
    });
  });

  it("rounds a half-paisa discount before subtracting it from the margin subtotal", () => {
    expect(calculateKnowledgePmcPrice({ baseRatePaise: 1_042, lowQuantityLimit: "0", quantity: "1", quantityScale: 0, pmcMarginBps: 2_000, discountBps: 4 }))
      .toMatchObject({ revisedAmountPaise: 1_042, pmcMarginAmountPaise: 208, totalBeforeDiscountPaise: 1_250,
        discount: { amountPaise: 1 }, totalPaise: 1_249
      });
  });

  it("retains the separate margin amount when no discount was requested", () => {
    const result = calculateKnowledgePmcPrice(input);
    expect(result).toMatchObject({ pmcMarginAmountPaise: 5_295, totalBeforeDiscountPaise: 40_015, totalPaise: 40_015, finalVendorChargesPaise: 34_720 });
    expect(result).not.toHaveProperty("discount");
  });

  it.each([[1_000, 1, 38_188], [1_525, 456, 38_190], [2_000, 834, 38_189]])(
    "accepts custom discount %s/%s that previously crossed the margin floor", (pmcMarginBps, discountBps, totalPaise) => {
      expect(calculateKnowledgePmcPrice({ ...input, pmcMarginBps, discountBps }).totalPaise).toBe(totalPaise);
    }
  );

  it.each([[0, 0, 11_000, 10_000], [2_000, 2_200, 8_800, 7_800], [5_000, 5_500, 5_500, 4_500], [10_000, 11_000, 0, -1_000]])(
    "allows a %s-bps custom discount at the lowest configured PMC margin", (discountBps, amountPaise, totalPaise, finalVendorChargesPaise) => {
      const result = calculateKnowledgePmcPrice({ baseRatePaise: 10_000, lowQuantityLimit: "0", impactBps: 0,
        quantity: "1", quantityScale: 0, pmcMarginBps: 1_000, discountBps });
      expect(result).toMatchObject({ revisedAmountPaise: 10_000, pmcMarginAmountPaise: 1_000, totalBeforeDiscountPaise: 11_000,
        discount: { rateBps: discountBps, amountPaise }, totalPaise, finalVendorChargesPaise });
      expect(result.totalPaise + result.discount!.amountPaise).toBe(result.totalBeforeDiscountPaise);
      expect(result.finalVendorChargesPaise + result.pmcMarginAmountPaise).toBe(result.totalPaise);
    }
  );

  it("preserves the generic Mode and In-house markup discount guards", () => {
    expect(() => calculateKnowledgeModePrice({ ...execution, quantity: "1", quantityScale: 0, discountBps: 1_001 })).toThrow("below the minimum standard");
    expect(() => calculateKnowledgeInHousePrice({ labor: execution, material: { ...execution, startingMarkupBps: 3_000 },
      quantity: "1", quantityScale: 0, discountBps: 501 })).toThrow("below the minimum standard");
  });

  it("rounds a custom discount without enforcing a minimum final margin", () => {
    const roundingInput = { baseRatePaise: 2_275, lowQuantityLimit: "0", quantity: "1", quantityScale: 0, pmcMarginBps: 1_003 };
    expect(calculateKnowledgePmcPrice(roundingInput)).toMatchObject({ revisedAmountPaise: 2_275, pmcMarginAmountPaise: 228, totalBeforeDiscountPaise: 2_503, totalPaise: 2_503 });
    expect(calculateKnowledgePmcPrice({ ...roundingInput, discountBps: 1 }).totalPaise).toBe(2_503);
    expect(calculateKnowledgePmcPrice({ ...roundingInput, discountBps: 2 })).toMatchObject({ discount: { amountPaise: 1 }, totalPaise: 2_502, finalVendorChargesPaise: 2_274 });
  });

  it.each([999, 2_001, 1_525.5, NaN, Infinity])("rejects invalid PMC margin %s", (pmcMarginBps) => {
    expect(() => calculateKnowledgePmcPrice({ ...input, pmcMarginBps })).toThrow("PMC margin must be between 10% and 20%");
  });

  it.each([-1, 1.5, 10_001, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("rejects invalid PMC discount %s", (discountBps) => {
    expect(() => calculateKnowledgePmcPrice({ ...input, discountBps })).toThrow(KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
  });

  it("rejects malformed source values and unsafe results", () => {
    for (const patch of [
      { quantity: "-1" }, { quantity: "1.25" }, { quantity: 2 }, { lowQuantityLimit: null },
      { baseRatePaise: -1 }, { baseRatePaise: 1.5 }, { impactBps: -1 }, { quantityScale: 19 },
      { baseRatePaise: Number.MAX_SAFE_INTEGER, impactBps: 0, quantity: "1" }
    ]) {
      expect(() => calculateKnowledgePmcPrice({ ...input, ...patch } as unknown as Parameters<typeof calculateKnowledgePmcPrice>[0])).toThrow();
    }
  });

  it("accepts the restored safe Impact maximum for PMC and keeps Execution's boundary", () => {
    const boundaryInput = { ...input, baseRatePaise: 0, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS };
    expect(calculateKnowledgePmcPrice(boundaryInput)).toMatchObject({ revisedAmountPaise: 0, appliedImpactBps: Number.MAX_SAFE_INTEGER - 10_000 });
    expect(aiEstimatorKnowledgePreviewSchema.safeParse({ ...previewInput, pmcCalculation: { ...settings, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS } }).success).toBe(true);
    for (const quantity of ["2.5", "3", "4"]) {
      expect(() => calculateKnowledgePmcPrice({ ...boundaryInput, quantity, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 }))
        .toThrow("PMC Impact must be a supported non-negative percentage");
    }
    expect(aiEstimatorKnowledgePreviewSchema.safeParse({ ...previewInput, pmcCalculation: { ...settings, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 } }).success).toBe(false);
    expect(aiEstimatorKnowledgePreviewSchema.safeParse({ quantity: "1", quantityScale: 0, modeCalculation: { ...execution, impactBps: Number.MAX_SAFE_INTEGER - 10_000 } }).success).toBe(true);
  });
});

describe("PMC preview boundaries", () => {
  it("accepts only the independent PMC request and bounded discounts at the route schema", () => {
    expect(aiEstimatorKnowledgePreviewSchema.parse(previewInput)).toEqual(previewInput);
    for (const modeCalculationDiscountBps of [0, 1, 455, 456, 2_000, 5_000, 10_000]) {
      const request = { ...previewInput, pmcCalculation: { ...settings, pmcMarginBps: 1_000 }, modeCalculationDiscountBps };
      expect(aiEstimatorKnowledgePreviewSchema.parse(request)).toEqual(request);
    }
    const invalidRequests = [
      { ...previewInput, quantity: undefined }, { ...previewInput, quantity: null },
      { ...previewInput, quantity: 2 }, { ...previewInput, pmcCalculation: null },
      { ...previewInput, modeCalculation: execution },
      { ...previewInput, inHouseCalculation: { labor: execution, material: execution } },
      { ...previewInput, modeCalculationMarkupBasis: "starting" },
      { ...previewInput, modeCalculationMarkupBasis: "minimum" },
      { ...previewInput, modeCalculationDiscountBps: 10_001 },
      ...[-1, 1.5, null, "5"].map((discount) => ({ ...previewInput, modeCalculationDiscountBps: discount })),
      ...[999, 2_001, 1_500.5, null, "15", undefined].map((pmcMarginBps) => ({ ...previewInput, pmcCalculation: { ...settings, pmcMarginBps } })),
      ...[{ baseRatePaise: -1 }, { baseRatePaise: 1.5 }, { lowQuantityLimit: "-1" }, { impactBps: -1 }, { startingMarkupBps: 3_500 }]
        .map((patch) => ({ ...previewInput, pmcCalculation: { ...settings, ...patch } }))
    ];
    for (const request of invalidRequests) expect(aiEstimatorKnowledgePreviewSchema.safeParse(request).success).toBe(false);
    const excessiveDiscount = aiEstimatorKnowledgePreviewSchema.safeParse({ ...previewInput, modeCalculationDiscountBps: 10_001 });
    expect(excessiveDiscount.success).toBe(false);
    if (!excessiveDiscount.success) expect(excessiveDiscount.error.issues).toContainEqual(expect.objectContaining({
      path: ["modeCalculationDiscountBps"], message: KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE
    }));
  });

  it("checks the calculation selection even for direct domain callers", () => {
    for (const patch of [
      { quantity: null }, { quantity: undefined }, { quantity: 2 }, { pmcCalculation: null },
      { modeCalculation: execution }, { inHouseCalculation: { labor: execution, material: execution } },
      { modeCalculationMarkupBasis: "starting" }, { modeCalculationMarkupBasis: "minimum" }
    ]) {
      expect(() => calculateKnowledgePreview({ ...previewInput, ...patch } as unknown as CalculateKnowledgePreviewInput)).toThrow();
    }
  });

  it("validates custom discount bounds even for direct preview domain callers", () => {
    for (const modeCalculationDiscountBps of [0, 456, 2_000, 5_000, 10_000]) {
      expect(() => calculateKnowledgePreview({ ...previewInput, modeCalculationDiscountBps })).not.toThrow();
    }
    for (const modeCalculationDiscountBps of [-1, 1.5, 10_001, NaN, Infinity]) {
      expect(() => calculateKnowledgePreview({ ...previewInput, modeCalculationDiscountBps })).toThrow(KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
    }
  });

  it("authorizes the PMC service preview and leaves legacy margin arithmetic unchanged", async () => {
    const requireReadActor = vi.fn().mockResolvedValue({ id: actor.id, role: actor.role });
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: { requireReadActor, requireMutationActor: vi.fn() } });
    const legacyInput = { quantity: "2.5", quantityScale: 1, unitRatePaise: 10_000, startMarginBps: 2_000 };
    const legacy = await service.preview(actor, legacyInput);
    const result = await service.preview(actor, { ...legacyInput, ...previewInput, modeCalculationDiscountBps: 455 });
    expect(result).toEqual({ ...legacy, pmcCalculation: {
      baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857, revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
      pmcMarginBps: 1_525, pmcMarginAmountPaise: 5_295, totalBeforeDiscountPaise: 40_015, totalPaise: 38_194,
      discount: { rateBps: 455, totalBeforeDiscountPaise: 40_015, amountPaise: 1_821 }, finalVendorChargesPaise: 32_899
    } });
    expect(result.startMargin?.amountPaise).toBe(12_500);
    expect(result).not.toHaveProperty("modeCalculation");
    expect(result).not.toHaveProperty("inHouseCalculation");
    expect(requireReadActor).toHaveBeenCalledWith(actor);
    const denial = new Error("Read denied");
    requireReadActor.mockRejectedValueOnce(denial);
    await expect(service.preview({ ...actor, id: "other-actor", role: "client" }, previewInput)).rejects.toBe(denial);
  });

  it("rejects malformed and incompatible PMC requests when the service is called directly", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor: vi.fn()
    } });
    for (const patch of [
      { quantity: null }, { quantity: undefined }, { quantity: 2 }, { pmcCalculation: null },
      { modeCalculation: execution }, { inHouseCalculation: { labor: execution, material: execution } },
      { modeCalculationMarkupBasis: "starting" }, { modeCalculationMarkupBasis: "minimum" },
      { pmcCalculation: { ...settings, pmcMarginBps: 999 } },
      { pmcCalculation: { ...settings, pmcMarginBps: 2_001 } },
      { pmcCalculation: { ...settings, lowQuantityLimit: null } },
      { pmcCalculation: { ...settings, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 } },
      { modeCalculationDiscountBps: -1 }, { modeCalculationDiscountBps: 1.5 }, { modeCalculationDiscountBps: 10_001 }
    ]) {
      await expect(service.preview(actor, { ...previewInput, ...patch } as unknown as CalculateKnowledgePreviewInput))
        .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    }
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 10_001 }))
      .rejects.toMatchObject({ message: KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE });
  });

  it("returns custom discounts and a signed residual through the service", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor: vi.fn()
    } });
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 456 }))
      .resolves.toMatchObject({ pmcCalculation: { totalPaise: 38_190 } });
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 10_000 }))
      .resolves.toMatchObject({ pmcCalculation: { totalPaise: 0, pmcMarginAmountPaise: 5_295, finalVendorChargesPaise: -5_295 } });
    await expect(service.preview(actor, { quantity: "1", quantityScale: 0, pmcCalculation: {
      baseRatePaise: 2_275, lowQuantityLimit: "0", pmcMarginBps: 1_003
    }, modeCalculationDiscountBps: 2 })).resolves.toMatchObject({ pmcCalculation: { totalPaise: 2_502 } });
  });
});
