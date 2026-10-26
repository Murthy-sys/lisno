import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing, estimateComponentLineAmountIsValid, type EstimateComponentPricing } from "../src/domain/estimate-component-pricing.js";

const snapshot = (): EstimateComponentPricing => ({ formulaVersion: ESTIMATE_COMPONENT_PRICING_BASIS,
  mainLineId: "line-a", revisionId: "revision-a", sourceItemVersion: 2, sourceRevisionVersion: 3,
  modeTier: "signature", quantity: "2", uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 },
  selectedComponentIds: ["component-a"], components: [{ id: "component-a", basketId: "basket-b", subBasketId: "sub-b",
    basketName: "Basket B", subBasketName: "Sub B", laborSellingPaise: 25000, materialSellingPaise: 53333, totalPaise: 78333 }],
  totalPaise: 78333, inputFingerprint: "a".repeat(64) });
const line = () => ({ source: "configuration", pricingMode: "in_house", rateSource: "configuration", pricingBasis: ESTIMATE_COMPONENT_PRICING_BASIS,
  componentPricing: snapshot(), mainLineId: "line-a", revisionId: "revision-a", sourceItemVersion: 2, sourceRevisionVersion: 3,
  modeTier: "signature", quantity: 2, uomId: "uom-a", uomDecimalScale: 2, selectedInHouseComponentIds: ["component-a"],
  ratePaise: null, rate: null, amountPaise: 78333, amount: 783.33 });

describe("exact component selling evidence", () => {
  it("keeps backend and shared snapshot validation identical", () => {
    expect(readFileSync(new URL("../src/domain/estimate-component-pricing.ts", import.meta.url), "utf8"))
      .toBe(readFileSync(new URL("../../shared/estimation/estimateComponentPricing.ts", import.meta.url), "utf8"));
  });
  it("accepts independently rounded component totals that cannot be expressed as a two-decimal unit rate", () => {
    expect(readEstimateComponentPricing(snapshot())).toEqual(snapshot());
    expect(estimateComponentLineAmountIsValid(line())).toBe(true);
    expect(estimateComponentLineAmountIsValid({ ...line(), amountPaise: 78334 })).toBe(false);
  });
  it.each(["pmc", "sub_vendor", undefined])("does not activate for estimate mode %s", pricingMode => {
    expect(estimateComponentLineAmountIsValid({ ...line(), pricingMode })).toBe(false);
  });
  it("rejects manual, foreign, changed-quantity and stale-version evidence", () => {
    for (const patch of [{ rateSource: "manual" }, { source: "legacy" }, { mainLineId: "line-b" }, { quantity: 3 },
      { sourceRevisionVersion: 4 }, { selectedInHouseComponentIds: ["component-b"] }, { uomId: "other" }, { ratePaise: 39167 }]) {
      expect(estimateComponentLineAmountIsValid({ ...line(), ...patch })).toBe(false);
    }
  });
  it("rejects malformed, duplicated and unreconciled snapshots without leaking cost settings", () => {
    for (const change of [{ totalPaise: 78334 }, { selectedComponentIds: ["component-a", "component-a"] }, { quantity: "2.00" },
      { inputFingerprint: "invalid" }, { internalCost: 60000 }, { components: [{ ...snapshot().components[0], laborSellingPaise: 25001 }] },
      { components: [{ ...snapshot().components[0], totalPaise: Number.MAX_SAFE_INTEGER + 1 }] }]) {
      expect(readEstimateComponentPricing({ ...snapshot(), ...change })).toBeNull();
    }
  });
});
