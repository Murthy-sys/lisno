import { describe, expect, it } from "vitest";

import { combinedInHouseMaximumDiscountBps, reconcilesInHouseCalculation, type InHouseCalculationResult } from "./knowledgeInHouseCalculation";

const settings = { baseRatePaise: 3_000, lowQuantityLimit: "1", impactBps: 0, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const context = { quantity: "1", quantityScale: 0 };
const starting: InHouseCalculationResult = {
  revisedUnitRatePaise: 3_000,
  revisedAmountPaise: 3_000,
  floorPricePaise: 4_000,
  maximumDiscountBps: 1_332,
  discountBasis: "selling_price",
  totalPaise: 4_615,
  appliedImpactBps: 0
};
const atCap: InHouseCalculationResult = {
  ...starting,
  totalPaise: 4_000,
  discount: { rateBps: 1_332, totalBeforeDiscountPaise: 4_615, amountPaise: 615 }
};

describe("In-house preview reconciliation", () => {
  it("accepts the rounded ₹30 true-margin example, its floor and the exact 13.32% cap", () => {
    expect(reconcilesInHouseCalculation(starting, settings, "starting", 0, context)).toBe(true);
    expect(reconcilesInHouseCalculation(atCap, settings, "starting", 1_332, context)).toBe(true);
    expect(reconcilesInHouseCalculation({ ...atCap, discount: { ...atCap.discount!, rateBps: 1_333 } }, settings, "starting", 1_333, context)).toBe(false);
    expect(reconcilesInHouseCalculation({ ...starting, maximumDiscountBps: 0, totalPaise: 4_000 }, settings, "minimum", 0, context)).toBe(true);
  });

  it.each([
    ["discount basis", { ...starting, discountBasis: "markup" as "selling_price" }],
    ["floor", { ...starting, floorPricePaise: 3_999 }],
    ["maximum", { ...starting, maximumDiscountBps: 1_333 }],
    ["selected price", { ...starting, totalPaise: 4_614 }],
    ["discount amount", { ...atCap, discount: { ...atCap.discount!, amountPaise: 614 }, totalPaise: 4_001 }],
    ["discount total", { ...atCap, totalPaise: 3_999 }],
    ["floor breach", { ...atCap, discount: { ...atCap.discount!, amountPaise: 616 }, totalPaise: 3_999 }]
  ] as const)("rejects a mismatched %s", (_label, result) => {
    const requested = result.discount?.rateBps ?? 0;
    expect(reconcilesInHouseCalculation(result, settings, "starting", requested, context)).toBe(false);
  });

  it("rejects adjusted costs that do not match the requested quantity, scale, Impact, and inclusive limit", () => {
    expect(reconcilesInHouseCalculation({ ...starting, revisedUnitRatePaise: 3_001 }, settings, "starting", 0, context)).toBe(false);
    expect(reconcilesInHouseCalculation({ ...starting, revisedAmountPaise: 3_001 }, settings, "starting", 0, context)).toBe(false);
    expect(reconcilesInHouseCalculation({ ...starting, appliedImpactBps: 1 }, settings, "starting", 0, context)).toBe(false);

    const impactedSettings = { ...settings, baseRatePaise: 1_001, lowQuantityLimit: "1.25", impactBps: 1_000 };
    const impactedResult = {
      revisedUnitRatePaise: 1_101, revisedAmountPaise: 1_376, floorPricePaise: 1_835,
      maximumDiscountBps: 1_332, discountBasis: "selling_price" as const, totalPaise: 2_117, appliedImpactBps: 1_000
    };
    expect(reconcilesInHouseCalculation(impactedResult, impactedSettings, "starting", 0,
      { quantity: "1.25", quantityScale: 2 })).toBe(true);
    expect(reconcilesInHouseCalculation({ ...impactedResult, appliedImpactBps: 0 }, impactedSettings, "starting", 0,
      { quantity: "1.25", quantityScale: 2 })).toBe(false);
  });

  it("uses the smaller valid component cap and rejects malformed component caps", () => {
    expect(combinedInHouseMaximumDiscountBps([starting, { ...starting, maximumDiscountBps: 2_195 }])).toBe(1_332);
    expect(combinedInHouseMaximumDiscountBps([])).toBeUndefined();
    expect(combinedInHouseMaximumDiscountBps([{ ...starting, maximumDiscountBps: -1 }])).toBeUndefined();
  });
});
