import { describe, expect, it, vi } from "vitest";

import { calculateKnowledgePreview, KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE, type CalculateKnowledgePreviewInput } from "../src/domain/ai-estimator-knowledge-calculation.js";
import {
  calculateKnowledgePmcPrice, calculateKnowledgeSubVendorPrice,
  KNOWLEDGE_PMC_MAX_IMPACT_BPS
} from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { aiEstimatorKnowledgePreviewSchema } from "../src/routes/ai-estimator-knowledge-admin.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";
import type { PublicUser } from "../src/services/auth.service.js";

const settings = { baseRatePaise: 12_345, lowQuantityLimit: "3", impactBps: 1_250, subVendorMarginBps: 1_525 };
const input = { ...settings, quantity: "2.5", quantityScale: 1 };
const previewInput = { subVendorCalculation: settings, quantity: "2.5", quantityScale: 1 };
const execution = { baseRatePaise: 50_000, lowQuantityLimit: "7", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const actor: PublicUser = { id: "sub-vendor-reader", name: "Sub-Vendor reader", email: "sub-vendor-reader@lisno.example", role: "super_admin" };

describe("Sub-Vendor margin simulator", () => {
  it("reports independently rounded charges, margin and a discount on the subtotal", () => {
    expect(calculateKnowledgeSubVendorPrice({ ...input, discountBps: 455 })).toEqual({
      baseAmountPaise: 30_863, lowQuantityImpactAmountPaise: 3_857,
      revisedUnitRatePaise: 13_888, revisedAmountPaise: 34_720, appliedImpactBps: 1_250,
      subVendorMarginBps: 1_525, subVendorMarginAmountPaise: 5_295,
      totalBeforeDiscountPaise: 40_015, totalPaise: 38_194, finalVendorChargesPaise: 32_899,
      discount: { rateBps: 455, totalBeforeDiscountPaise: 40_015, amountPaise: 1_821 }
    });
  });

  it.each([
    { quantity: "0" }, { quantity: "2.5" }, { quantity: "3" }, { quantity: "3.1" },
    { impactBps: undefined }, { impactBps: 0 }, { impactBps: 725 },
    { subVendorMarginBps: 1_000 }, { subVendorMarginBps: 2_000, discountBps: 833 },
    { subVendorMarginBps: 1_000, discountBps: 2_000 }, { subVendorMarginBps: 1_000, discountBps: 5_000 },
    { subVendorMarginBps: 1_000, discountBps: 10_000 }, { discountBps: 9_999 },
    { baseRatePaise: 997, quantity: "0.25", quantityScale: 2, discountBps: 455 },
    { baseRatePaise: 0, impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS }
  ])("matches PMC arithmetic for %j", (patch) => {
    const subVendorInput = { ...input, ...patch };
    const { subVendorMarginBps, ...common } = subVendorInput;
    const { pmcMarginBps, pmcMarginAmountPaise, ...pmc } = calculateKnowledgePmcPrice({ ...common, pmcMarginBps: subVendorMarginBps });
    const result = calculateKnowledgeSubVendorPrice(subVendorInput);
    expect(result).toEqual({ ...pmc, subVendorMarginBps: pmcMarginBps, subVendorMarginAmountPaise: pmcMarginAmountPaise });
    expect(result.baseAmountPaise + result.lowQuantityImpactAmountPaise).toBe(result.revisedAmountPaise);
    expect(result.finalVendorChargesPaise + result.subVendorMarginAmountPaise).toBe(result.totalPaise);
    expect(result).not.toHaveProperty("pmcMarginBps");
  });

  it.each([["14.9", 1_000], ["15", 1_000], ["15.1", 0]] as const)("uses the inclusive configured limit for quantity %s", (quantity, appliedImpactBps) => {
    expect(calculateKnowledgeSubVendorPrice({ ...input, lowQuantityLimit: "15", impactBps: undefined, quantity }))
      .toMatchObject({ appliedImpactBps });
  });

  it("allows former margin-capped discounts and rounded totals below the former floor", () => {
    for (const [subVendorMarginBps, discountBps, totalPaise] of [[1_000, 1, 38_188], [1_525, 456, 38_190], [2_000, 834, 38_189]]) {
      expect(calculateKnowledgeSubVendorPrice({ ...input, subVendorMarginBps, discountBps }).totalPaise).toBe(totalPaise);
    }
    expect(calculateKnowledgeSubVendorPrice({ ...input, baseRatePaise: 2_275, lowQuantityLimit: "0", quantity: "1", subVendorMarginBps: 1_003, discountBps: 2 }))
      .toMatchObject({ discount: { amountPaise: 1 }, totalPaise: 2_502 });
  });

  it.each([[2_000, 7_590, 30_360, 26_910], [5_000, 18_975, 18_975, 15_525], [10_000, 37_950, 0, -3_450]])(
    "allows custom %s-bps discount at 10% Sub-Vendor margin without changing the margin", (discountBps, amountPaise, totalPaise, finalVendorChargesPaise) => {
      const result = calculateKnowledgeSubVendorPrice({ baseRatePaise: 12_000, lowQuantityLimit: "3", impactBps: 1_500,
        quantity: "2.5", quantityScale: 1, subVendorMarginBps: 1_000, discountBps });
      expect(result).toMatchObject({ baseAmountPaise: 30_000, lowQuantityImpactAmountPaise: 4_500,
        revisedAmountPaise: 34_500, subVendorMarginAmountPaise: 3_450, totalBeforeDiscountPaise: 37_950,
        discount: { rateBps: discountBps, amountPaise }, totalPaise, finalVendorChargesPaise });
      expect(result.totalPaise + result.discount!.amountPaise).toBe(result.totalBeforeDiscountPaise);
      expect(result.finalVendorChargesPaise + result.subVendorMarginAmountPaise).toBe(result.totalPaise);
    }
  );

  it.each([-1, 1.5, 10_001, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])("rejects invalid custom discount %s", (discountBps) => {
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, discountBps })).toThrow(KNOWLEDGE_CUSTOM_DISCOUNT_MESSAGE);
  });

  it.each([
    { subVendorMarginBps: 999 }, { subVendorMarginBps: 2_001 }, { subVendorMarginBps: 1_000.5 },
    { subVendorMarginBps: undefined }, { subVendorMarginBps: null }, { subVendorMarginBps: "15" },
    { impactBps: -1 }, { impactBps: KNOWLEDGE_PMC_MAX_IMPACT_BPS + 1 },
    { discountBps: -1 }, { discountBps: 1.5 }, { discountBps: Number.NaN },
    { quantity: null }, { quantity: "-1" }, { quantity: "2.25" }, { lowQuantityLimit: null },
    { baseRatePaise: -1 }, { baseRatePaise: Number.MAX_SAFE_INTEGER, quantity: "1", impactBps: 0 }
  ])("rejects invalid margin settings, precision and overflow: %j", (patch) => {
    expect(() => calculateKnowledgeSubVendorPrice({ ...input, ...patch } as unknown as Parameters<typeof calculateKnowledgeSubVendorPrice>[0])).toThrow();
  });

  it("does not use an unrelated PMC margin or legacy markup passed by a direct caller", () => {
    const result = calculateKnowledgeSubVendorPrice({ ...input, pmcMarginBps: 2_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 } as Parameters<typeof calculateKnowledgeSubVendorPrice>[0]);
    expect(result.subVendorMarginBps).toBe(1_525);
    expect(result.totalPaise).toBe(40_015);
  });
});

describe("Sub-Vendor preview contract", () => {
  const incompatiblePatches = [
    { quantity: undefined }, { quantity: null }, { quantity: 2 }, { subVendorCalculation: null }, { subVendorCalculation: [] },
    { modeCalculation: execution }, { inHouseCalculation: { labor: execution, material: execution } },
    { pmcCalculation: { ...settings, pmcMarginBps: 1_900 } },
    { modeCalculationMarkupBasis: "starting" }, { modeCalculationMarkupBasis: "minimum" }
  ];

  it("accepts the separate request and applies strict branch, margin and discount validation", () => {
    for (const modeCalculationDiscountBps of [0, 1, 455, 456, 2_000, 5_000, 10_000]) {
      const request = { ...previewInput, subVendorCalculation: { ...settings, subVendorMarginBps: 1_000 }, modeCalculationDiscountBps };
      expect(aiEstimatorKnowledgePreviewSchema.parse(request)).toEqual(request);
    }
    for (const patch of [
      ...incompatiblePatches,
      { modeCalculationDiscountBps: 10_001 }, { modeCalculationDiscountBps: -1 }, { modeCalculationDiscountBps: null },
      ...[null, undefined, "15", 999, 2_001, 1_500.5].map((subVendorMarginBps) => ({ subVendorCalculation: { ...settings, subVendorMarginBps } })),
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
      { subVendorCalculation: { ...settings, subVendorMarginBps: 999 } },
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
      .resolves.toMatchObject({ subVendorCalculation: { totalPaise: 38_190 } });
    await expect(service.preview(actor, { ...previewInput, modeCalculationDiscountBps: 10_000 }))
      .resolves.toMatchObject({ subVendorCalculation: { totalPaise: 0, subVendorMarginAmountPaise: 5_295, finalVendorChargesPaise: -5_295 } });
  });
});
