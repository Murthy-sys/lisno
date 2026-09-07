import { describe, expect, it } from "vitest";

import { calculateKnowledgeModeBaseRate, calculateKnowledgeModePrice } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";

describe("Mode low-quantity calculations", () => {
  const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500, quantityScale: 0 };

  it.each([
    ["1", 206_250], ["14", 2_887_500], ["15", 2_812_500], ["0", 0]
  ])("uses minimum markup in the simulator at quantity %s", (quantity, totalPaise) => {
    const input = { ...settings, quantity: String(quantity) };
    const preview = calculateKnowledgeModePrice({ ...input, markupBasis: "minimum" });
    expect(preview.totalPaise).toBe(totalPaise);
    expect(preview.revisedAmountPaise).toBe(calculateKnowledgeModePrice(input).revisedAmountPaise);
    expect(input.startingMarkupBps).toBe(3_500);
  });

  it("uses the selected editable minimum on unequal and fractional scenarios", () => {
    expect(calculateKnowledgeModePrice({ ...settings, markupBasis: "minimum", baseRatePaise: 50_000, quantity: "20", minimumMarkupBps: 2_000 }).totalPaise).toBe(1_200_000);
    expect(calculateKnowledgeModePrice({ ...settings, markupBasis: "minimum", baseRatePaise: 997, quantity: "0.25", quantityScale: 2 }).totalPaise).toBe(343);
  });

  it.each([
    ["1", 222_750], ["14", 3_118_500], ["15", 3_037_500], ["16", 3_240_000], ["0", 0]
  ])("adds 35%% to the revised subtotal at quantity %s", (quantity, totalPaise) => {
    expect(calculateKnowledgeModePrice({ ...settings, quantity: String(quantity) }).totalPaise).toBe(totalPaise);
  });

  it("uses each line's settings and supports editable markup including zero and over 100 percent", () => {
    expect(calculateKnowledgeModePrice({ ...settings, baseRatePaise: 50_000, quantity: "20" }).totalPaise).toBe(1_350_000);
    expect(calculateKnowledgeModePrice({ ...settings, startingMarkupBps: 2_500, quantity: "1" }).totalPaise).toBe(206_250);
    expect(calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: 0, startingMarkupBps: 0, quantity: "1" }).totalPaise).toBe(165_000);
    expect(calculateKnowledgeModePrice({ ...settings, startingMarkupBps: 15_000, quantity: "1" }).totalPaise).toBe(412_500);
    expect(calculateKnowledgeModePrice({ ...settings, baseRatePaise: 997, quantity: "0.25", quantityScale: 2 }))
      .toEqual({ revisedUnitRatePaise: 1_097, revisedAmountPaise: 274, appliedImpactBps: 1_000, totalPaise: 370 });
  });

  it("rejects markup below the minimum, invalid precision, and unsafe totals", () => {
    for (const startingMarkupBps of [-1, 2_499, 3_500.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateKnowledgeModePrice({ ...settings, startingMarkupBps, quantity: "1" })).toThrow();
    }
    expect(() => calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: -1, quantity: "1" })).toThrow();
    expect(() => calculateKnowledgeModePrice({ ...settings, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0", quantity: "1" })).toThrow();
  });

  it.each([
    { quantity: "14", expectedRate: 165_000, expectedAmount: 2_310_000, impact: 1_000 },
    { quantity: "15", expectedRate: 150_000, expectedAmount: 2_250_000, impact: 0 },
    { quantity: "16", expectedRate: 150_000, expectedAmount: 2_400_000, impact: 0 },
    { quantity: "0", expectedRate: 165_000, expectedAmount: 0, impact: 1_000 }
  ])("applies the fixed impact correctly at quantity $quantity", ({ quantity, expectedRate, expectedAmount, impact }) => {
    expect(calculateKnowledgeModeBaseRate({ baseRatePaise: 150_000, lowQuantityLimit: "15", quantity, quantityScale: 0 }))
      .toEqual({ revisedUnitRatePaise: expectedRate, revisedAmountPaise: expectedAmount, appliedImpactBps: impact });
  });

  it("handles fractional quantities and rounds money in paise", () => {
    expect(calculateKnowledgeModeBaseRate({ baseRatePaise: 997, lowQuantityLimit: "1", quantity: "0.25", quantityScale: 2 }))
      .toEqual({ revisedUnitRatePaise: 1_097, revisedAmountPaise: 274, appliedImpactBps: 1_000 });
    expect(calculateKnowledgeModeBaseRate({ baseRatePaise: 50_000, lowQuantityLimit: "15", quantity: "14.999999", quantityScale: 6 }))
      .toEqual({ revisedUnitRatePaise: 55_000, revisedAmountPaise: 825_000, appliedImpactBps: 1_000 });
  });

  it("rejects invalid quantities, unsupported unit precision, and overflowing money", () => {
    const input = { baseRatePaise: 150_000, lowQuantityLimit: "15", quantity: "14", quantityScale: 0 };
    for (const quantity of ["", "-1", "abc", "1.5"]) {
      expect(() => calculateKnowledgeModeBaseRate({ ...input, quantity })).toThrow();
    }
    expect(() => calculateKnowledgeModeBaseRate({ ...input, baseRatePaise: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => calculateKnowledgeModeBaseRate({ ...input, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0" })).toThrow();
  });
});
