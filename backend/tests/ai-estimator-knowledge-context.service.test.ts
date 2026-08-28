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
