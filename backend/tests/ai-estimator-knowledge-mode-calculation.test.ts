import { describe, expect, it } from "vitest";

import { calculateKnowledgeInHousePrice, calculateKnowledgeModeBaseRate, calculateKnowledgeModePrice, KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";

describe("simulator discount limits", () => {
  const input = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500, quantity: "1", quantityScale: 0 };

  it.each([[0, 222_750, 3_500, 0], [500, 214_500, 3_000, 8_250], [1_000, 206_250, 2_500, 16_500]])(
    "reduces markup by %s basis points and reconciles the saving", (discountBps, totalPaise, effectiveMarkupBps, amountPaise) => {
      expect(calculateKnowledgeModePrice({ ...input, discountBps })).toEqual({
        revisedUnitRatePaise: 165_000, revisedAmountPaise: 165_000, appliedImpactBps: 1_000, totalPaise,
        discount: { rateBps: discountBps, effectiveMarkupBps, totalBeforeDiscountPaise: 222_750, amountPaise }
      });
      expect(input.startingMarkupBps).toBe(3_500);
    }
  );

  it("rejects a discount one basis point above the limit even for zero quantity", () => {
    for (const quantity of ["0", "1", "15"]) {
      expect(() => calculateKnowledgeModePrice({ ...input, quantity, discountBps: 1_001 })).toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
    }
    expect(() => calculateKnowledgeModePrice({ ...input, minimumMarkupBps: 3_500, discountBps: 1 })).toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });

  it("allows only zero discount when calculating at the minimum markup", () => {
    expect(calculateKnowledgeModePrice({ ...input, markupBasis: "minimum", discountBps: 0 })).toMatchObject({ totalPaise: 206_250, discount: { effectiveMarkupBps: 2_500, amountPaise: 0 } });
    expect(() => calculateKnowledgeModePrice({ ...input, markupBasis: "minimum", discountBps: 1 })).toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });

  it("rounds fractional amounts in paise and derives the saving from rounded totals", () => {
    expect(calculateKnowledgeModePrice({ ...input, baseRatePaise: 997, impactBps: 1_250, quantity: "0.25", quantityScale: 2, discountBps: 525 }))
      .toMatchObject({ revisedAmountPaise: 281, totalPaise: 365, discount: { totalBeforeDiscountPaise: 379, amountPaise: 14, effectiveMarkupBps: 2_975 } });
    expect(calculateKnowledgeModePrice({ ...input, quantity: "15", discountBps: 1_000 }))
      .toMatchObject({ appliedImpactBps: 0, totalPaise: 2_812_500 });
  });

  it("validates discount input and rejects unsafe result amounts", () => {
    for (const discountBps of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateKnowledgeModePrice({ ...input, discountBps })).toThrow();
    }
    expect(() => calculateKnowledgeModePrice({ ...input, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0", discountBps: 1_000 })).toThrow();
  });

  it("limits a shared In-house discount by both independent costs and adds their discounted totals", () => {
    const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
    const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
    const combined = { labor, material, quantity: "1", quantityScale: 0 };
    expect(calculateKnowledgeInHousePrice({ ...combined, discountBps: 500 })).toMatchObject({
      labor: { totalPaise: 53_100, discount: { effectiveMarkupBps: 1_800 } },
      material: { totalPaise: 96_007, discount: { effectiveMarkupBps: 3_100 } }, totalPaise: 149_107
    });
    expect(calculateKnowledgeInHousePrice({ ...combined, discountBps: 1_500 })).toMatchObject({ totalPaise: 137_278 });
    expect(() => calculateKnowledgeInHousePrice({ ...combined, discountBps: 1_501 })).toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
    expect(() => calculateKnowledgeInHousePrice({ ...combined, labor: material, material: labor, discountBps: 1_501 })).toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
    expect(calculateKnowledgeInHousePrice(combined).totalPaise).toBe(155_022);
  });
});

describe("combined In-house calculations", () => {
  const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
  const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };

  it.each([
    ["1", "starting", 55_350, 99_672, 155_022],
    ["1", "minimum", 48_600, 86_480, 135_080],
    ["4", "starting", 221_400, 398_687, 620_087],
    ["9", "starting", 498_150, 795_600, 1_293_750],
    ["0", "minimum", 0, 0, 0]
  ] as const)("adds final cost amounts at quantity %s with %s markup", (quantity, markupBasis, laborTotal, materialTotal, total) => {
    const result = calculateKnowledgeInHousePrice({ labor, material, quantity, quantityScale: 0, markupBasis });
    expect(result.labor.totalPaise).toBe(laborTotal);
    expect(result.material.totalPaise).toBe(materialTotal);
    expect(result.totalPaise).toBe(total);
    expect(result.labor.appliedImpactBps).toBe(0);
    expect(result.material.appliedImpactBps).toBe(quantity === "9" ? 0 : 1_275);
  });

  it("adds independently rounded fractional amounts and keeps unequal configurations isolated", () => {
    const input = { labor: { ...labor, baseRatePaise: 997, impactBps: 1_250, startingMarkupBps: 3_500 },
      material: { ...material, baseRatePaise: 333, impactBps: 500, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 }, quantity: "0.25", quantityScale: 2 };
    expect(calculateKnowledgeInHousePrice(input)).toMatchObject({ labor: { totalPaise: 379 }, material: { totalPaise: 106 }, totalPaise: 485 });
    const second = calculateKnowledgeInHousePrice({ labor, material, quantity: "1", quantityScale: 0 });
    expect(second.totalPaise).toBe(155_022);
    expect(calculateKnowledgeInHousePrice(input).totalPaise).toBe(485);
  });

  it("rejects an invalid cost or overflowing sum instead of returning a partial total", () => {
    expect(() => calculateKnowledgeInHousePrice({ labor, material: { ...material, impactBps: -1 }, quantity: "1", quantityScale: 0 })).toThrow();
    const maximum = { ...labor, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0", minimumMarkupBps: 0, startingMarkupBps: 0 };
    expect(calculateKnowledgeModePrice({ ...maximum, quantity: "1", quantityScale: 0 }).totalPaise).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateKnowledgeInHousePrice({ labor: maximum, material: { ...maximum, baseRatePaise: 1 }, quantity: "1", quantityScale: 0 })).toThrow(/combined In-house total/);
  });
});

describe("Mode low-quantity calculations", () => {
  const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500, quantityScale: 0 };

  it("uses edited Impact below the limit for either markup, with exact paise rounding", () => {
    const input = { ...settings, impactBps: 1_250, quantity: "2" };
    expect(calculateKnowledgeModePrice(input)).toEqual({
      revisedUnitRatePaise: 168_750, revisedAmountPaise: 337_500, appliedImpactBps: 1_250, totalPaise: 455_625
    });
    expect(calculateKnowledgeModePrice({ ...input, markupBasis: "minimum" }).totalPaise).toBe(421_875);
    expect(calculateKnowledgeModePrice({ ...input, baseRatePaise: 997, quantity: "0.25", quantityScale: 2 }))
      .toEqual({ revisedUnitRatePaise: 1_122, revisedAmountPaise: 281, appliedImpactBps: 1_250, totalPaise: 379 });
    expect(calculateKnowledgeModePrice({ ...input, impactBps: 0 }).totalPaise).toBe(405_000);
    expect(calculateKnowledgeModePrice({ ...input, baseRatePaise: 50_000, impactBps: 15_000, quantity: "1" }).totalPaise).toBe(168_750);
    for (const quantity of ["15", "16"]) {
      const result = calculateKnowledgeModePrice({ ...input, quantity });
      expect(result.appliedImpactBps).toBe(0);
      expect(result.revisedUnitRatePaise).toBe(150_000);
      expect(result.totalPaise).toBe(quantity === "15" ? 3_037_500 : 3_240_000);
    }
  });

  it("rejects invalid Impact even when the quantity would not trigger an uplift", () => {
    for (const impactBps of [-1, 1250.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      for (const quantity of ["1", "15"]) {
        expect(() => calculateKnowledgeModePrice({ ...settings, impactBps, quantity })).toThrow(/Impact/);
      }
    }
  });

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
  ])("defaults older settings to 10% impact at quantity $quantity", ({ quantity, expectedRate, expectedAmount, impact }) => {
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
