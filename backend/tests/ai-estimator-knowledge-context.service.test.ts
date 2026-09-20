import { describe, expect, it, vi } from "vitest";

import type { PublicUser } from "../src/services/auth.service.js";
import type { AiEstimatorKnowledgeActorGuard } from "../src/services/ai-estimator-knowledge-actor.js";
import { createAiEstimatorKnowledgeContextService } from "../src/services/ai-estimator-knowledge-context.service.js";

const ACTOR: PublicUser = {
  id: "knowledge-super-admin",
  name: "Knowledge Admin",
  email: "knowledge-admin@lisno.example",
  role: "super_admin"
};

describe("AI estimator knowledge context service", () => {
  it("applies simulator discounts and rejects below-minimum calculations on the server", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: actorGuard() });
    const modeCalculation = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    const input = { modeCalculation, quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 500 };
    expect(await service.preview(ACTOR, input)).toMatchObject({ modeCalculation: {
      floorPricePaise: 220_000, maximumDiscountBps: 1_333, discountBasis: "selling_price", totalPaise: 241_154,
      discount: { rateBps: 500, totalBeforeDiscountPaise: 253_846, amountPaise: 12_692 }
    } });
    for (const invalid of [{ ...input, modeCalculationDiscountBps: 1_334 }, { ...input, modeCalculationMarkupBasis: "minimum" as const }]) {
      await expect(service.preview(ACTOR, invalid)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: expect.stringContaining("minimum gross-margin floor") });
    }
    await expect(service.preview(ACTOR, { quantityScale: 0, modeCalculationDiscountBps: 0 }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(await service.preview(ACTOR, { inHouseCalculation: { labor: modeCalculation, material: { ...modeCalculation, baseRatePaise: 50_000 } }, quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 1_000 }))
      .toMatchObject({ inHouseCalculation: { labor: { totalPaise: 228_461 }, material: { totalPaise: 76_153 }, totalPaise: 304_614 } });
    await expect(service.preview(ACTOR, { inHouseCalculation: { labor: modeCalculation, material: { ...modeCalculation, minimumMarkupBps: 3_000 } }, quantity: "1", quantityScale: 0, modeCalculationDiscountBps: 715 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringContaining("minimum gross-margin floor") });
  });

  it("returns the complete In-house total through the authorized preview service", async () => {
    const requireReadActor = vi.fn().mockResolvedValue({ id: ACTOR.id, role: "super_admin" });
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: actorGuard({ requireReadActor }) });
    const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
    const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
    const input = { inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 0 };
    expect(await service.preview(ACTOR, input)).toMatchObject({ inHouseCalculation: {
      labor: { floorPricePaise: 48_913, maximumDiscountBps: 1_630, totalPaise: 58_442 },
      material: { floorPricePaise: 89_376, maximumDiscountBps: 2_195, totalPaise: 114_513 },
      totalPaise: 172_955
    } });
    expect(await service.preview(ACTOR, { ...input, modeCalculationMarkupBasis: "minimum" })).toMatchObject({ inHouseCalculation: {
      labor: { maximumDiscountBps: 0 }, material: { maximumDiscountBps: 0 }, totalPaise: 138_289
    } });
    expect(requireReadActor).toHaveBeenCalledWith(ACTOR);
    for (const invalid of [
      { ...input, quantity: null }, { ...input, modeCalculation: labor },
      { ...input, inHouseCalculation: { labor, material: { ...material, startingMarkupBps: 0 } } }
    ]) await expect(service.preview(ACTOR, invalid)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    const denial = new Error("Read denied");
    requireReadActor.mockRejectedValueOnce(denial);
    await expect(service.preview({ ...ACTOR, id: "other", role: "client" }, input)).rejects.toBe(denial);
  });

  it("calculates true In-house margin without changing the separate legacy price preview", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: actorGuard() });
    const input = { quantity: "1", quantityScale: 0, unitRatePaise: 165_000, startMarginBps: 3_500 };
    const legacy = await service.preview(ACTOR, input);
    expect(legacy).not.toHaveProperty("modeCalculation");
    const preview = await service.preview(ACTOR, { ...input, modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } });
    expect(preview).toEqual({ ...legacy, modeCalculation: {
      revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, floorPricePaise: 220_000,
      maximumDiscountBps: 1_333, discountBasis: "selling_price", totalPaise: 253_846, appliedImpactBps: 1_000
    } });
    const minimum = await service.preview(ACTOR, { ...input, modeCalculationMarkupBasis: "minimum", modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } });
    expect(minimum).toEqual({ ...legacy, modeCalculation: {
      revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, floorPricePaise: 220_000,
      maximumDiscountBps: 0, discountBasis: "selling_price", totalPaise: 220_000, appliedImpactBps: 1_000
    } });
    const customImpact = await service.preview(ACTOR, { ...input, modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_250, minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } });
    expect(customImpact).toEqual({ ...legacy, modeCalculation: {
      revisedUnitRatePaise: 168_750, revisedAmountPaise: 168_750, floorPricePaise: 225_000,
      maximumDiscountBps: 1_333, discountBasis: "selling_price", totalPaise: 259_615, appliedImpactBps: 1_250
    } });
    await expect(service.preview(ACTOR, { quantityScale: 0, modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("checks read authorization before Mode calculations", async () => {
    const denial = new Error("Read access denied");
    const requireReadActor = vi.fn().mockRejectedValue(denial);
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: actorGuard({ requireReadActor }) });
    const actor = { ...ACTOR, id: "other-actor", role: "client" as const };
    await expect(service.preview(actor, { quantity: "1", quantityScale: 0, modeCalculation: {
      baseRatePaise: 50_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } })).rejects.toBe(denial);
    expect(requireReadActor).toHaveBeenCalledWith(actor);
  });

  it("authorizes preview reads and returns transparent server-owned components", async () => {
    const requireReadActor = vi.fn().mockResolvedValue({
      id: ACTOR.id,
      role: "super_admin"
    });
    const service = createAiEstimatorKnowledgeContextService({
      actorGuard: actorGuard({ requireReadActor })
    });

    const preview = await service.preview(ACTOR, {
      priceVersionId: "price-version-1",
      taxVersionId: "tax-version-1",
      unitRatePaise: 7_500,
      quantityAdjustmentBps: 500,
      quantity: "1",
      quantityScale: 2,
      taxRateBps: 1_800,
      taxTreatment: "exclusive",
      startMarginBps: 2_500,
      bottomMarginBps: 1_500,
      pmcMarkupBps: 1_500
    });

    expect(requireReadActor).toHaveBeenCalledWith(ACTOR);
    expect(preview).toMatchObject({
      formulaVersion: "knowledge-preview-v1",
      effectivePriceVersionId: "price-version-1",
      taxVersionId: "tax-version-1",
      adjustedUnitRate: {
        amountPaise: 7_875,
        basisAmountPaise: 7_500,
        rateBps: 500
      }
    });
    expect(preview).not.toHaveProperty("finalPrice");
  });

  it("maps unsafe preview input to the bounded validation error contract", async () => {
    const service = createAiEstimatorKnowledgeContextService({
      actorGuard: actorGuard()
    });

    await expect(
      service.preview(ACTOR, {
        unitRatePaise: Number.MAX_VALUE,
        quantityScale: 0
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });
});

function actorGuard(
  input: {
    requireReadActor?: AiEstimatorKnowledgeActorGuard["requireReadActor"];
  } = {}
): AiEstimatorKnowledgeActorGuard {
  return {
    requireReadActor:
      input.requireReadActor ??
      vi.fn().mockResolvedValue({ id: ACTOR.id, role: "super_admin" }),
    requireMutationActor: vi.fn()
  };
}
