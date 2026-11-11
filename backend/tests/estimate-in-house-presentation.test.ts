import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { resolveEstimateComponentPricing } from "../src/services/estimate-component-pricing.service.js";
import { describe, expect, it, vi } from "vitest";
import { projectEstimateInHouseResponse } from "../src/services/estimate-in-house-presentation.js";
import type { EstimatorCatalogueLine } from "../src/services/estimator-catalogue.service.js";
import { readEstimateComponentPricing } from "../src/domain/estimate-component-pricing.js";

const evidence = {
  formulaVersion: "in_house_components_v1", mainLineId: "main", revisionId: "revision", sourceItemVersion: 2,
  sourceRevisionVersion: 3, modeTier: "signature", quantity: "2", uom: { id: "uom", code: "EA", name: "Each", decimalScale: 0 },
  selectedComponentIds: ["secret-id"], components: [{ id: "secret-id", basketId: "secret-target", subBasketId: null,
    basketName: "Secret basket", subBasketName: null, laborSellingPaise: 1101, materialSellingPaise: 2202, totalPaise: 3303 }],
  totalPaise: 3303, inputFingerprint: "a".repeat(64)
};
const line = { source: "configuration", pricingMode: "in_house", mainLineId: "main", modeTier: "signature", selectedInHouseComponentIds: ["secret-id"], componentPricing: evidence, amountPaise: 3303 };
function sources(state: "legacy" | "ready" | "invalid" = "ready") {
  const pricing = { modeBaseRatesPaise: { pmc: null, sub_vendor: null, in_house: null },
    ...(state === "legacy" ? {} : { inHousePolicy: { state, usage: "execution" as const, componentIds: ["secret-id"], issues: [] }, inHouseUsage: "execution" as const, inHousePricingState: state }) };
  const source = { mainLineId: "main", revisionId: "revision", itemVersion: 2, revisionVersion: 3, applicableTiers: ["signature"], tierPricing: { signature: pricing }, ...pricing } as unknown as EstimatorCatalogueLine;
  return new Map([["main", { line: source, mainBasketName: "Main", subBasketName: "Sub" }]]);
}
describe("governed In-house response projection", () => {
  it("redacts nested current and frozen snapshots without mutating their evidence or whole estimate totals", () => {
    const data = { lineItems: [line], preApprovedReview: { snapshot: { lineItems: [line], totalPaise: 7007 } }, totalPaise: 7007 };
    const before = structuredClone(data);
    const result = projectEstimateInHouseResponse(data, sources());
    expect(JSON.stringify(result)).not.toMatch(/secret-id|secret-target|Secret basket|selectedComponentIds|selectedInHouseComponentIds|laborSellingPaise|materialSellingPaise/);
    expect(result.totalPaise).toBe(7007);
    expect(result.lineItems[0]).toMatchObject({ amountPaise: 3303, aggregatePricing: { visibility: "aggregate", totalPaise: 3303 } });
    expect(data).toEqual(before);
    expect(readEstimateComponentPricing(data.lineItems[0].componentPricing)).not.toBeNull();
  });
  it("keeps legacy payloads unchanged and fails closed for malformed or unresolved current policies", () => {
    expect(projectEstimateInHouseResponse(line, sources("legacy"))).toEqual(line);
    for (const current of [sources("invalid"), new Map()]) {
      const projected = projectEstimateInHouseResponse(line, current);
      expect(projected).not.toHaveProperty("componentPricing");
      expect(projected).not.toHaveProperty("selectedInHouseComponentIds");
      expect(projected).toMatchObject({ aggregatePricing: { totalPaise: 3303 }, configurationPricingChanged: true });
    }
  });
  it.each(["deselected", "missing"])("keeps current and frozen component prices private when the exact tier is %s", unavailable => {
    const current = sources("legacy");
    const source = current.get("main")!.line;
    if (unavailable === "deselected") source.tierPricing.premium = sources().get("main")!.line.tierPricing.signature;
    else source.applicableTiers.push("premium");
    const premium = { ...line, modeTier: "premium", componentPricing: { ...evidence, modeTier: "premium" } };
    const data = { lineItems: [premium], preApprovedReview: { snapshot: { lineItems: [premium], totalPaise: 7007 } }, totalPaise: 7007 };
    const before = structuredClone(data);
    const projected = projectEstimateInHouseResponse(data, current);
    for (const result of [projected.lineItems[0], projected.preApprovedReview.snapshot.lineItems[0]]) {
      expect(result).not.toHaveProperty("componentPricing");
      expect(result).not.toHaveProperty("selectedInHouseComponentIds");
      expect(result).toMatchObject({ modeTier: "premium", amountPaise: 3303, inHouseUsage: null,
        inHousePricingState: "invalid", aggregatePricing: { modeTier: "premium", totalPaise: 3303 },
        configurationPricingChanged: true, configurationPricingIssue: "Configuration changed. Refresh price." });
    }
    expect(JSON.stringify(projected)).not.toMatch(/secret-id|secret-target|Secret basket|selectedComponentIds|laborSellingPaise|materialSellingPaise/);
    expect(projected.totalPaise).toBe(7007);
    expect(projected.preApprovedReview.snapshot.totalPaise).toBe(7007);
    expect(data).toEqual(before);
    expect(projectEstimateInHouseResponse(line, current)).toEqual(line);
  });
  it("rejects a policy change between catalogue resolution and calculation instead of returning legacy details", async () => {
    const query = vi.spyOn(AiEstimatorKnowledgeSectionModel, "findOne").mockReturnValue({ session: () => ({ lean: async () => ({
      sectionKey: "advanced", applicability: "configured", payload: { inHouseUsage: "estimator", inHousePresetComponentIds: ["secret-id"], inHouseComponents: [{ id: "secret-id" }] }
    }) }) } as never);
    try {
      await expect(resolveEstimateComponentPricing(sources("legacy").get("main")!, "signature", 2, ["secret-id"]))
        .rejects.toMatchObject({ code: "ESTIMATE_CONFIGURATION_CHANGED" });
    } finally { query.mockRestore(); }
  });
  it("isolates a legacy tier from a governed tier sharing the same Main Line", () => {
    const current = sources();
    current.get("main")!.line.applicableTiers.push("premium");
    current.get("main")!.line.tierPricing.premium = { modeBaseRatesPaise: { pmc: null, sub_vendor: null, in_house: null } };
    const premium = { ...line, modeTier: "premium", componentPricing: { ...evidence, modeTier: "premium" } };
    expect(projectEstimateInHouseResponse(premium, current)).toEqual(premium);
    expect(projectEstimateInHouseResponse(line, current)).not.toHaveProperty("componentPricing");
  });
});
