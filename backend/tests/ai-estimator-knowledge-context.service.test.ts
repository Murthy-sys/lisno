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
  it("calculates additive Mode markup without changing legacy gross-margin results", async () => {
    const service = createAiEstimatorKnowledgeContextService({ actorGuard: actorGuard() });
    const input = { quantity: "1", quantityScale: 0, unitRatePaise: 165_000, startMarginBps: 3_500 };
    const legacy = await service.preview(ACTOR, input);
    expect(legacy).not.toHaveProperty("modeCalculation");
    const preview = await service.preview(ACTOR, { ...input, modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } });
    expect(preview).toEqual({ ...legacy, modeCalculation: {
      revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, totalPaise: 222_750, appliedImpactBps: 1_000
    } });
    const minimum = await service.preview(ACTOR, { ...input, modeCalculationMarkupBasis: "minimum", modeCalculation: {
      baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500
    } });
    expect(minimum).toEqual({ ...legacy, modeCalculation: { ...preview.modeCalculation, totalPaise: 206_250 } });
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
