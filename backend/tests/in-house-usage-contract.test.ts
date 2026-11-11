import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInHouseUsagePolicy } from "../src/domain/in-house-usage-policy.js";
import { readEstimateAggregatePricing, toEstimateAggregatePricing, estimateAggregateLineAmountIsValid } from "../src/domain/estimate-aggregate-pricing.js";
import { readEstimateComponentPricing, type EstimateComponentPricing } from "../src/domain/estimate-component-pricing.js";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";

const cost = { baseRatePaise: 1501, lowQuantityLimit: "1", impactBps: 750, minimumMarkupBps: 1000, startingMarkupBps: 2500 };
const components = ["one", "two", "three"].map((id, index) => ({ id, basketId: "basket", subBasketId: `sub-${id}`,
  inclusions: [], exclusions: [], labor: { ...cost, baseRatePaise: 1501 + index * 701 }, material: cost }));
const payload = { inHouseComponents: components, inHouseUsage: "estimator", inHousePresetComponentIds: ["one", "three"] };
const evidence: EstimateComponentPricing = { formulaVersion: "in_house_components_v1", mainLineId: "line-a", revisionId: "revision-a",
  sourceItemVersion: 2, sourceRevisionVersion: 3, modeTier: "signature", quantity: "3",
  uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 },
  selectedComponentIds: ["one", "three"], components: [
    { id: "one", basketId: "basket", subBasketId: "sub-one", basketName: "Hidden basket", subBasketName: "Hidden one", laborSellingPaise: 101, materialSellingPaise: 202, totalPaise: 303 },
    { id: "three", basketId: "basket", subBasketId: "sub-three", basketName: "Hidden basket", subBasketName: "Hidden three", laborSellingPaise: 501, materialSellingPaise: 799, totalPaise: 1300 }
  ], totalPaise: 1603, inputFingerprint: "a".repeat(64) };

describe("In-house use and subset contract", () => {
  it("keeps backend and shared contracts identical", () => {
    for (const [server, shared] of [["in-house-usage-policy", "knowledge/knowledgeInHouseUsage"], ["estimate-aggregate-pricing", "estimation/estimateAggregatePricing"]]) {
      expect(readFileSync(new URL(`../src/domain/${server}.ts`, import.meta.url), "utf8"))
        .toBe(readFileSync(new URL(`../../shared/${shared}.ts`, import.meta.url), "utf8"));
    }
  });
  it("distinguishes legacy from a deliberately incomplete preset", () => {
    expect(readInHouseUsagePolicy({}).state).toBe("legacy");
    expect(readInHouseUsagePolicy({ ...payload, inHousePresetComponentIds: [] }).state).toBe("incomplete");
    expect(validateKnowledgeSectionPayload("advanced", { ...payload, inHousePresetComponentIds: [] })).toEqual([]);
  });
  it("accepts a proper subset without including remaining components", () => {
    expect(readInHouseUsagePolicy(payload)).toMatchObject({ state: "ready", usage: "estimator", componentIds: ["one", "three"], issues: [] });
    expect(validateKnowledgeSectionPayload("advanced", payload)).toEqual([]);
  });
  it.each([
    { inHouseUsage: undefined }, { inHouseUsage: "unknown" }, { inHousePresetComponentIds: undefined },
    { inHousePresetComponentIds: ["one", "one"] }, { inHousePresetComponentIds: ["foreign"] },
    { inHousePresetComponentIds: [" one"] }, { inHousePresetComponentIds: Array(51).fill("one") }
  ])("fails closed for malformed explicit policy %j", change => {
    expect(readInHouseUsagePolicy({ ...payload, ...change }).state).toBe("invalid");
    expect(validateKnowledgeSectionPayload("advanced", { ...payload, ...change }).length).toBeGreaterThan(0);
  });
  it("validates membership in the exact tier", () => {
    const root = { ...payload, tierConfigurations: { premium: { applicability: "applicable", payload: {
      inHouseComponents: [], inHouseUsage: "execution", inHousePresetComponentIds: ["one"]
    } } } };
    expect(validateKnowledgeSectionPayload("advanced", root).some(issue => issue.path.includes("tierConfigurations.premium"))).toBe(true);
  });
});

describe("aggregate selling response", () => {
  it("preserves exact totals and identity while excluding component evidence", () => {
    const projected = toEstimateAggregatePricing(evidence);
    expect(projected.totalPaise).toBe(1603);
    expect(projected.inputFingerprint).toBe(evidence.inputFingerprint);
    expect(readEstimateAggregatePricing(projected)).toEqual(projected);
    expect(JSON.stringify(projected)).not.toMatch(/Hidden|selectedComponentIds|laborSelling|materialSelling|subBasket|components"/u);
    expect(readEstimateComponentPricing(evidence)).toEqual(evidence);
    expect(readEstimateComponentPricing(projected)).toBeNull();
  });
  it("rejects leaked fields and malformed aggregate evidence", () => {
    for (const patch of [{ components: evidence.components }, { selectedComponentIds: ["one"] }, { quantity: "3.00" },
      { totalPaise: Number.MAX_SAFE_INTEGER + 1 }, { inputFingerprint: "bad" }, { visibility: "full" }]) {
      expect(readEstimateAggregatePricing({ ...toEstimateAggregatePricing(evidence), ...patch })).toBeNull();
    }
  });
  it("matches authoritative amount without multiplying the rounded display rate", () => {
    const line = { source: "configuration", pricingMode: "in_house", rateSource: "configuration", pricingBasis: evidence.formulaVersion,
      mainLineId: evidence.mainLineId, revisionId: evidence.revisionId, sourceItemVersion: 2, sourceRevisionVersion: 3,
      modeTier: "signature", quantity: 3, uomId: "uom-a", uomDecimalScale: 2,
      ratePaise: null, amountPaise: 1603, aggregatePricing: toEstimateAggregatePricing(evidence) };
    expect(estimateAggregateLineAmountIsValid(line)).toBe(true);
    for (const change of [{ quantity: 2 }, { mainLineId: "line-b" }, { amountPaise: 1602 }, { ratePaise: 534 }, { sourceRevisionVersion: 4 }]) {
      expect(estimateAggregateLineAmountIsValid({ ...line, ...change })).toBe(false);
    }
  });
});
