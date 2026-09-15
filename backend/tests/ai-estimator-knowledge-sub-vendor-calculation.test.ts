import { describe, expect, it, vi } from "vitest";

import { calculateKnowledgePreview, KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE, type CalculateKnowledgePreviewInput } from "../src/domain/ai-estimator-knowledge-calculation.js";
import {
  calculateKnowledgePmcPrice, calculateKnowledgeSubVendorPrice,
  KNOWLEDGE_PMC_MAX_IMPACT_BPS
} from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { aiEstimatorKnowledgePreviewSchema } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import type { PublicUser } from "../src/services/auth.service.js";

const settings = { baseRatePaise: 12_345, lowQuantityLimit: "3", impactBps: 1_250, subVendorMarginBps: 1_500 };
const input = { ...settings, quantity: "2.5", quantityScale: 1 };
const previewInput = { subVendorCalculation: settings, quantity: "2.5", quantityScale: 1 };
const execution = { baseRatePaise: 50_000, lowQuantityLimit: "7", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const actor: PublicUser = { id: "sub-vendor-reader", name: "Sub-Vendor reader", email: "sub-vendor-reader@lisno.example", role: "super_admin" };
const configuredMarginExamples = [
  [0, 20_000], [500, 21_053], [1_000, 22_222], [1_500, 23_529], [2_000, 25_000],
  [2_500, 26_667], [3_000, 28_571], [3_500, 30_769], [4_000, 33_333], [4_500, 36_364],
  [5_000, 40_000], [5_500, 44_444], [6_000, 50_000], [6_500, 57_143], [7_000, 66_667],
  [7_500, 80_000], [8_000, 100_000], [8_500, 133_333], [9_000, 200_000], [9_500, 400_000]
] as const;

describe("Sub-Vendor Lisno margin simulator", () => {
  it.each(configuredMarginExamples)("prices ₹200 at each supported %s-bps configured margin", (subVendorMarginBps, sellingPrice) => {
    const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0,
      quantity: "1", quantityScale: 0, subVendorMarginBps });
    expect(result).toMatchObject({ revisedAmountPaise: 20_000, totalBeforeDiscountPaise: sellingPrice,
      totalPaise: sellingPrice, subVendorMarginBps, subVendorMarginAmountPaise: sellingPrice - 20_000,
      finalVendorChargesPaise: 20_000 });
  });

  it("enforces the safe selling-price boundary at 95%", () => {
    const boundary = { baseRatePaise: 450_359_962_737_049, lowQuantityLimit: "0", impactBps: 0,
      quantity: "1", quantityScale: 0, subVendorMarginBps: 9_500 };
    expect(calculateKnowledgeSubVendorPrice(boundary).totalBeforeDiscountPaise).toBe(9_007_199_254_740_980);
    expect(() => calculateKnowledgeSubVendorPrice({ ...boundary, baseRatePaise: boundary.baseRatePaise + 1 }))
      .toThrow(/safe-integer boundary/u);
  });

  it("prices the same cost at both configured Sub-Vendor margins and the matching single PMC margins", () => {
    const common = { baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0, quantity: "1", quantityScale: 0 };
    const minimum = calculateKnowledgeSubVendorPrice({ ...common, subVendorMarginBps: 1_500 });
    const maximum = calculateKnowledgeSubVendorPrice({ ...common, subVendorMarginBps: 2_000 });
    expect(minimum).toMatchObject({ revisedAmountPaise: 20_000, subVendorMarginAmountPaise: 3_529, totalBeforeDiscountPaise: 23_529, totalPaise: 23_529 });
    expect(maximum).toMatchObject({ revisedAmountPaise: 20_000, subVendorMarginAmountPaise: 5_000, totalBeforeDiscountPaise: 25_000, totalPaise: 25_000 });
    expect(maximum.totalBeforeDiscountPaise).toBeGreaterThan(minimum.totalBeforeDiscountPaise);
    expect(calculateKnowledgePmcPrice({ ...common, pmcMarginBps: 1_500 })).toMatchObject({ pmcMarginAmountPaise: 3_529, totalPaise: 23_529 });
    expect(calculateKnowledgePmcPrice({ ...common, pmcMarginBps: 2_000 })).toMatchObject({ pmcMarginAmountPaise: 5_000, totalPaise: 25_000 });
  });

  it("applies discount after selling price and retains the configured margin", () => {
    const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000,
      quantity: "10", quantityScale: 0, subVendorMarginBps: 2_000, discountBps: 1_000 });
    expect(result).toMatchObject({ revisedAmountPaise: 220_000, totalBeforeDiscountPaise: 275_000,
      subVendorMarginAmountPaise: 55_000, discount: { amountPaise: 27_500, totalBeforeDiscountPaise: 275_000 },
      totalPaise: 247_500, finalVendorChargesPaise: 192_500 });
  });

  it("rounds a half-paise selling-price tie upward before deriving margin and discount", () => {
    const common = { baseRatePaise: 2, lowQuantityLimit: "0", impactBps: 0, quantity: "1", quantityScale: 0, subVendorMarginBps: 2_000 };
    expect(calculateKnowledgeSubVendorPrice(common)).toMatchObject({ revisedAmountPaise: 2,
      totalBeforeDiscountPaise: 3, subVendorMarginAmountPaise: 1, totalPaise: 3, finalVendorChargesPaise: 2 });
    expect(calculateKnowledgeSubVendorPrice({ ...common, discountBps: 5_000 })).toMatchObject({
      totalBeforeDiscountPaise: 3, subVendorMarginAmountPaise: 1, discount: { amountPaise: 2 }, totalPaise: 1, finalVendorChargesPaise: 0 });
  });

  it.each([[1_500, 7_656_119_366_529_842], [2_000, 7_205_759_403_792_793]])(
    "preserves exact selling-price safe-integer boundaries for %s-bps margin", (subVendorMarginBps, baseRatePaise) => {
      const boundary = { baseRatePaise, lowQuantityLimit: "0", impactBps: 0, quantity: "1", quantityScale: 0, subVendorMarginBps };
      expect(calculateKnowledgeSubVendorPrice(boundary).totalBeforeDiscountPaise).toBe(Number.MAX_SAFE_INTEGER);
      expect(() => calculateKnowledgeSubVendorPrice({ ...boundary, baseRatePaise: baseRatePaise + 1 }))
        .toThrow(/safe-integer boundary/u);
    }
  );

  it("keeps a near-100% discount and signed vendor balance exact", () => {
    expect(calculateKnowledgeSubVendorPrice({ ...input, discountBps: 9_999 })).toMatchObject({
      totalBeforeDiscountPaise: 40_847, subVendorMarginAmountPaise: 6_127,
      discount: { amountPaise: 40_843 }, totalPaise: 4, finalVendorChargesPaise: -6_123 });
  });

  it.each([
    [1_500, 38_824, 258_824], [2_000, 55_000, 275_000]
  ])("divides adjusted cost by the remaining price fraction at %s-bps Lisno margin", (subVendorMarginBps, marginAmountPaise, totalPaise) => {
    const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000,
      quantity: "10", quantityScale: 0, subVendorMarginBps, discountBps: 0 });
    expect(result).toEqual({ baseAmountPaise: 200_000, lowQuantityImpactAmountPaise: 20_000,
      revisedUnitRatePaise: 22_000, revisedAmountPaise: 220_000, appliedImpactBps: 1_000,
      subVendorMarginBps, subVendorMarginAmountPaise: marginAmountPaise, totalBeforeDiscountPaise: totalPaise,
      totalPaise, finalVendorChargesPaise: 220_000,
      discount: { rateBps: 0, amountPaise: 0, totalBeforeDiscountPaise: totalPaise } });
  });

  it.each([
    ["14.9", 1_500, 1_000, 327_800, 57_847, 385_647],
    ["15", 1_500, 1_000, 330_000, 58_235, 388_235],
    ["15.1", 1_500, 0, 302_000, 53_294, 355_294],
    ["14.9", 2_000, 1_000, 327_800, 81_950, 409_750],
    ["15", 2_000, 1_000, 330_000, 82_500, 412_500],
    ["15.1", 2_000, 0, 302_000, 75_500, 377_500]
  ] as const)("keeps inclusive impact for quantity %s at %s-bps Lisno margin", (quantity, subVendorMarginBps, appliedImpactBps, revisedAmountPaise, subVendorMarginAmountPaise, totalPaise) => {
    const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000,
      quantity, quantityScale: 1, subVendorMarginBps });
    expect(result).toMatchObject({ appliedImpactBps, revisedAmountPaise, subVendorMarginAmountPaise, totalPaise });
    expect(result.revisedAmountPaise + result.subVendorMarginAmountPaise).toBe(result.totalBeforeDiscountPaise);
    expect(result.finalVendorChargesPaise + result.subVendorMarginAmountPaise).toBe(result.totalPaise);
  });

  it.each([
    [1_500, 6_127, 40_847, 1_859, 38_988, 32_861],
    [2_000, 8_680, 43_400, 1_975, 41_425, 32_745]
  ])("rounds fractional quantities and selling-price discounts at %s-bps Lisno margin", (subVendorMarginBps, margin, subtotal, discount, total, vendorBalance) => {
    const result = calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps, discountBps: 455 });
    expect(result).toMatchObject({ revisedAmountPaise: 34_720, subVendorMarginAmountPaise: margin,
      totalBeforeDiscountPaise: subtotal, discount: { rateBps: 455, amountPaise: discount },
      totalPaise: total, finalVendorChargesPaise: vendorBalance });
    const fullyDiscounted = calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps, discountBps: 10_000 });
    expect(fullyDiscounted).toMatchObject({ totalPaise: 0, subVendorMarginAmountPaise: margin, finalVendorChargesPaise: -margin });
  });

  it("uses Lisno for margin errors while retaining the Sub-Vendor quantity context", () => {
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps: 999 }))
      .toThrow("Lisno margin must be between 0% and 95%, in multiples of 5%.");
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, quantity: null } as unknown as Parameters<typeof calculateKnowledgeSubVendorPrice>[0]))
      .toThrow("Sub-Vendor quantity and low quantity limit must be non-negative decimal strings.");
  });

  it("derives margin from rounded selling price and discounts that selling price", () => {
    expect(calculateKnowledgeSubVendorPrice({ ...input, discountBps: 455 })).toEqual({
      baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
      revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
      subVendorMarginBps: 1_500, subVendorMarginAmountPaise: 6_127,
      totalBeforeDiscountPaise: 40_847, totalPaise: 38_988, finalVendorChargesPaise: 32_861,
      discount: { rateBps: 455, totalBeforeDiscountPaise: 40_847, amountPaise: 1_859 }
    });
  });

  it.each([
    { quantity: "0" }, { quantity: "2.5" }, { quantity: "3" }, { quantity: "3.1" },
    { impactBps: undefined }, { impactBps: 0 }, { impactBps: 725 },
    { subVendorMarginBps: 1_500 }, { subVendorMarginBps: 2_000, discountBps: 833 },
    { subVendorMarginBps: 1_500, discountBps: 2_000 }, { subVendorMarginBps: 1_500, discountBps: 5_000 },
    { subVendorMarginBps: 1_500, discountBps: 10_000 }, { discountBps: 9_999 },
    { baseRatePaise: 997, quantity: "0.25", quantityScale: 2, discountBps: 455 },
    { baseRatePaise: 0, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS }
  ])("matches PMC's quantity, impact, selling-price and discount arithmetic for %j", (patch) => {
    const subVendorInput = { ...input, ...patch };
    const { subVendorMarginBps, ...common } = subVendorInput;
    const { pmcMarginBps, pmcMarginAmountPaise, ...pmc } = calculateKnowledgePmcPrice({ ...common, pmcMarginBps: subVendorMarginBps });
    const result = calculateKnowledgeSubVendorPrice(subVendorInput);
    expect(result).toMatchObject({ baseAmountPaise: pmc.baseAmountPaise, lowQuantityImpactAmountPaise: pmc.lowQuantityImpactAmountPaise,
      revisedUnitRatePaise: pmc.revisedUnitRatePaise, revisedAmountPaise: pmc.revisedAmountPaise, appliedImpactBps: pmc.appliedImpactBps });
    expect(result).toEqual({ ...pmc, subVendorMarginBps: pmcMarginBps, subVendorMarginAmountPaise: pmcMarginAmountPaise });
    expect(result.baseAmountPaise + result.lowQuantityImpactAmountPaise).toBe(result.revisedAmountPaise);
    expect(result.revisedAmountPaise + result.subVendorMarginAmountPaise).toBe(result.totalBeforeDiscountPaise);
    expect(result.totalPaise + (result.discount?.amountPaise ?? 0)).toBe(result.totalBeforeDiscountPaise);
    expect(result.finalVendorChargesPaise + result.subVendorMarginAmountPaise).toBe(result.totalPaise);
    expect(result).not.toHaveProperty("pmcMarginBps");
  });

  it.each([["14.9", 1_000], ["15", 1_000], ["15.1", 0]] as const)("uses the inclusive configured limit for quantity %s", (quantity, appliedImpactBps) => {
    expect(calculateKnowledgeSubVendorPrice({ ...input, lowQuantityLimit: "15", impactBps: undefined, quantity }))
      .toMatchObject({ appliedImpactBps });
  });

  it("allows former margin-capped discounts and rounded totals below the former floor", () => {
    for (const [subVendorMarginBps, discountBps, totalPaise] of [[1_500, 500, 38_805], [1_500, 456, 38_984], [2_000, 834, 39_780]]) {
      expect(calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps, discountBps }).totalPaise).toBe(totalPaise);
    }
    expect(calculateKnowledgeSubVendorPrice({ ...input, baseRatePaise: 2_275, lowQuantityLimit: "0", quantity: "1", subVendorMarginBps: 1_500, discountBps: 435 }))
      .toMatchObject({ discount: { amountPaise: 116 }, totalPaise: 2_560 });
  });

  it.each([[2_000, 8_118, 32_470, 26_382], [5_000, 20_294, 20_294, 14_206], [10_000, 40_588, 0, -6_088]])(
    "allows custom %s-bps discount at 15% Lisno margin without changing the margin", (discountBps, amountPaise, totalPaise, finalVendorChargesPaise) => {
      const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 12_000, lowQuantityLimit: "3", impactBps: 1_500,
        quantity: "2.5", quantityScale: 1, subVendorMarginBps: 1_500, discountBps });
      expect(result).toMatchObject({ baseAmountPaise: 30_000, lowQuantityImpactAmountPaise: 4_500,
        revisedAmountPaise: 34_500, subVendorMarginAmountPaise: 6_088, totalBeforeDiscountPaise: 40_588,
        discount: { rateBps: discountBps, amountPaise }, totalPaise, finalVendorChargesPaise });
      expect(result.totalPaise + result.discount!.amountPaise).toBe(result.totalBeforeDiscountPaise);
      expect(result.finalVendorChargesPaise + result.subVendorMarginAmountPaise).toBe(result.totalPaise);
    }
  );

  it.each([-1, 1.5, 10_001, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("rejects invalid custom discount %s", (discountBps) => {
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, discountBps })).toThrow(KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
  });

  it.each([
    { subVendorMarginBps: -1 }, { subVendorMarginBps: 999 }, { subVendorMarginBps: 1_499 },
    { subVendorMarginBps: 1_600 }, { subVendorMarginBps: 1_750 }, { subVendorMarginBps: 2_001 }, { subVendorMarginBps: 1_000.5 },
    { subVendorMarginBps: 1_250 }, { subVendorMarginBps: 1_700 }, { subVendorMarginBps: 1_800 },
    { subVendorMarginBps: 9_900 }, { subVendorMarginBps: 10_000 }, { subVendorMarginBps: 10_500 },
    { subVendorMarginBps: Number.NaN }, { subVendorMarginBps: Infinity }, { subVendorMarginBps: Number.MAX_SAFE_INTEGER + 1 },
    { subVendorMarginBps: undefined }, { subVendorMarginBps: null }, { subVendorMarginBps: "15" },
    { impactBps: -1 }, { impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 },
    { discountBps: -1 }, { discountBps: 1.5 }, { discountBps: Number.NaN },
    { quantity: null }, { quantity: "-1" }, { quantity: "2.25" }, { lowQuantityLimit: null },
    { baseRatePaise: -1 }, { baseRatePaise: Number.MAX_SAFE_INTEGER, quantity: "1", impactBps: 0 }
  ])("rejects invalid margin settings, precision and overflow: %j", (patch) => {
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, ...patch } as unknown as Parameters<typeof calculateKnowledgeSubVendorPrice>[0])).toThrow();
  });

  it.each([1_499, 1_600, 1_750, 1_999])("preserves PMC's independent historical %s-bps range", (pmcMarginBps) => {
    const { subVendorMarginBps: _margin, ...common } = input;
    expect(() => calculateKnowledgePmcPrice({ ...common, pmcMarginBps })).not.toThrow();
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps: pmcMarginBps }))
      .toThrow("Lisno margin must be between 0% and 95%, in multiples of 5%.");
  });

  it("does not use an unrelated PMC margin or legacy markup passed by a direct caller", () => {
    const result = calculateKnowledgeSubVendorPrice({ ...input, pmcMarginBps: 2_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 } as Parameters<typeof calculateKnowledgeSubVendorPrice>[0]);
    expect(result.subVendorMarginBps).toBe(1_500);
    expect(result.totalPaise).toBe(40_847);
  });
});

describe("Sub-Vendor preview contract", () => {
  const incompatiblePatches = [
    { quantity: undefined }, { quantity: null }, { quantity: 2 }, { subVendorCalculation: null }, { subVendorCalculation: [] },
    { modeCalculation: execution }, { inHouseCalculation: { labor: execution, material: execution } },
    { pmcCalculation: { ...settings, pmcMarginBps: 1_900 } },
    { modeCalculationMarkupBasis: "starting" }, { modeCalculationMarkupBasis: "minimum" }
  ];

  it.each(configuredMarginExamples)("accepts %s-bps configured margins through schema and read-only service", async (subVendorMarginBps, totalPaise) => {
    const requireMutationActor = vi.fn();
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor
    } });
    const request = Object.freeze({ quantity: "1", quantityScale: 0,
      subVendorCalculation: Object.freeze({ baseRatePaise: 20_000, lowQuantityLimit: "0", impactBps: 0, subVendorMarginBps }) });
    expect(aiEstimatorKnowledgePreviewSchema.parse(request)).toEqual(request);
    expect(await service.preview(actor, request)).toMatchObject({ subVendorCalculation: {
      subVendorMarginBps, revisedAmountPaise: 20_000, totalBeforeDiscountPaise: totalPaise, totalPaise
    } });
    expect(requireMutationActor).not.toHaveBeenCalled();
  });

  it.each([[1_500, 258_824], [2_000, 275_000]])("returns the selected %s-bps configured rate through the unchanged preview API", async (subVendorMarginBps, totalPaise) => {
    const requireMutationActor = vi.fn();
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor
    } });
    const request = Object.freeze({ quantity: "10", quantityScale: 0, modeCalculationDiscountBps: 0,
      subVendorCalculation: Object.freeze({ baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000, subVendorMarginBps }) });
    expect(aiEstimatorKnowledgePreviewSchema.parse(request)).toEqual(request);
    const result = await service.preview(actor, request);
    expect(result.subVendorCalculation).toMatchObject({ subVendorMarginBps, totalPaise });
    expect(result.subVendorCalculation).toEqual(calculateKnowledgeSubVendorPrice({ ...request.subVendorCalculation,
      quantity: request.quantity, quantityScale: request.quantityScale, discountBps: request.modeCalculationDiscountBps }));
    expect(requireMutationActor).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("pmcCalculation");
    expect(result).not.toHaveProperty("modeCalculation");
    expect(result).not.toHaveProperty("inHouseCalculation");
  });

  it("accepts the separate request and applies strict branch, margin and discount validation", () => {
    for (const modeCalculationDiscountBps of [0, 1, 455, 456, 2_000, 5_000, 10_000]) {
      const request = { ...previewInput, subVendorCalculation: { ...settings, subVendorMarginBps: 1_500 }, modeCalculationDiscountBps };
      expect(aiEstimatorKnowledgePreviewSchema.parse(request)).toEqual(request);
    }
    for (const patch of [
      ...incompatiblePatches,
      { modeCalculationDiscountBps: 10_001 }, { modeCalculationDiscountBps: -1 }, { modeCalculationDiscountBps: null },
      ...[null, undefined, "15", -1, 999, 1_250, 1_499, 1_600, 1_700, 1_750, 1_800, 2_001, 9_900, 10_000, 10_500, 1_500.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((subVendorMarginBps) => ({ subVendorCalculation: { ...settings, subVendorMarginBps } })),
      ...[{ pmcMarginBps: 1_500 }, { startingMarkupBps: 3_500 }, { impactBps: -1 }, { impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 }]
        .map((patch) => ({ subVendorCalculation: { ...settings, ...patch } }))
    ]) {
      expect(aiEstimatorKnowledgePreviewSchema.safeParse({ ...previewInput, ...patch }).success).toBe(false);
    }
    const result = aiEstimatorKnowledgePreviewSchema.safeParse({ ...previewInput, modeCalculationDiscountBps: 10_001 });
    if (result.success) throw new Error("Excessive discount was accepted");
    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["modeCalculationDiscountBps"], message: KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE }));
  });

  it.each(incompatiblePatches)("rejects malformed and mixed branches for direct domain callers: %j", (patch) => {
    expect(() => calculateKnowledgePreview({ ...previewInput, ...patch } as unknown as CalculateKnowledgePreviewInput)).toThrow();
  });

  it("enforces the custom discount range for direct preview domain callers", () => {
    for (const modeCalculationDiscountBps of [0, 456, 2_000, 5_000, 10_000]) {
      expect(() => calculateKnowledgePreview({ ...previewInput, modeCalculationDiscountBps })).not.toThrow();
    }
    for (const modeCalculationDiscountBps of [-1, 1.5, 10_001, NaN, Infinity]) {
      expect(() => calculateKnowledgePreview({ ...previewInput, modeCalculationDiscountBps })).toThrow(KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
    }
  });

  it("keeps legacy individual and In-house requests mutually exclusive", () => {
    const legacy = { modeCalculation: execution, quantity: "2", quantityScale: 0 };
    const inHouse = { inHouseCalculation: { labor: execution, material: { ...execution, baseRatePaise: 12_345 } }, quantity: "2", quantityScale: 0 };
    expect(aiEstimatorKnowledgePreviewSchema.safeParse(legacy).success).toBe(true);
    expect(aiEstimatorKnowledgePreviewSchema.safeParse(inHouse).success).toBe(true);
    const mixed = { ...legacy, ...inHouse };
    expect(aiEstimatorKnowledgePreviewSchema.safeParse(mixed).success).toBe(false);
    expect(() => calculateKnowledgePreview(mixed)).toThrow("Choose either an individual calculation or an In-house total.");
  });

  it("authorizes preview, returns the independent response and preserves the existing legacy result", async () => {
    const requireReadActor = vi.fn().mockResolvedValue({ id: actor.id, role: actor.role });
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: { requireReadActor, requireMutationActor: vi.fn() } });
    const legacyInput = { quantity: "2.5", quantityScale: 1, unitRatePaise: 10_000, startMarginBps: 2_000 };
    const legacy = await service.preview(actor, legacyInput);
    const result = await service.preview(actor, { ...legacyInput, ...previewInput, modeCalculationDiscountBps: 455 });
    expect(result).toEqual({ ...legacy, subVendorCalculation: calculateKnowledgeSubVendorPrice({ ...input, discountBps: 455 }) });
    expect(result).not.toHaveProperty("pmcCalculation");
    expect(result).not.toHaveProperty("modeCalculation");
    expect(requireReadActor).toHaveBeenCalledWith(actor);
    const denial = new Error("Read denied");
    requireReadActor.mockRejectedValueOnce(denial);
    await expect(service.preview({ ...actor, id: "other-actor", role: "client" }, previewInput)).rejects.toBe(denial);
  });

  it("enforces validation for direct service requests", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor: vi.fn()
    } });
    for (const patch of [...incompatiblePatches,
      ...[-1, 999, 1_250, 1_499, 1_600, 1_700, 1_750, 1_800, 9_900, 10_000, 10_500].map((subVendorMarginBps) => ({ subVendorCalculation: { ...settings, subVendorMarginBps } })),
      { subVendorCalculation: { ...settings, subVendorMarginBps: 2_001 } },
      { modeCalculationDiscountBps: 10_001 }, { modeCalculationDiscountBps: -1 }, { modeCalculationDiscountBps: 1.5 }
    ]) {
      await expect(service.preview(actor, { ...previewInput, ...patch } as unknown as CalculateKnowledgePreviewInput))
        .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    }
  });

  it("returns custom discounts and signed residuals through the service", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: {
      requireReadActor: vi.fn().mockResolvedValue({ id: actor.id, role: actor.role }), requireMutationActor: vi.fn()
    } });
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 456 }))
      .resolves.toMatchObject({ subVendorCalculation: { totalPaise: 38_984 } });
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 10_000 }))
      .resolves.toMatchObject({ subVendorCalculation: { totalPaise: 0, subVendorMarginAmountPaise: 6_127, finalVendorChargesPaise: -6_127 } });
  });
});
