import { describe, expect, it } from "vitest";

import {
  calculateKnowledgeInHousePrice,
  calculateKnowledgeModeBaseRate,
  calculateKnowledgeModePrice,
  KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE
} from "../src/domain/ai-estimator-knowledge-mode-calculation.js";

describe("In-house selling-price discount limits", () => {
  const input = {
    baseRatePaise: 150_000,
    lowQuantityLimit: "15",
    impactBps: 1_000,
    minimumMarkupBps: 2_500,
    startingMarkupBps: 3_500,
    quantity: "1",
    quantityScale: 0
  };

  it("matches the ₹30 true-margin reference and rejects one basis point above its conservative cap", () => {
    const reference = { ...input, baseRatePaise: 3_000, lowQuantityLimit: "1", impactBps: 0 };
    expect(calculateKnowledgeModePrice(reference)).toEqual({
      revisedUnitRatePaise: 3_000,
      revisedAmountPaise: 3_000,
      appliedImpactBps: 0,
      floorPricePaise: 4_000,
      maximumDiscountBps: 1_332,
      discountBasis: "selling_price",
      totalPaise: 4_615
    });
    expect(calculateKnowledgeModePrice({ ...reference, discountBps: 1_332 })).toMatchObject({
      floorPricePaise: 4_000,
      maximumDiscountBps: 1_332,
      totalPaise: 4_000,
      discount: { rateBps: 1_332, totalBeforeDiscountPaise: 4_615, amountPaise: 615 }
    });
    expect(() => calculateKnowledgeModePrice({ ...reference, discountBps: 1_333 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });

  it.each([
    [0, 253_846, 0],
    [500, 241_154, 12_692],
    [1_000, 228_461, 25_385],
    [1_333, 220_008, 33_838]
  ])("discounts the rounded selling price by %s basis points", (discountBps, totalPaise, amountPaise) => {
    expect(calculateKnowledgeModePrice({ ...input, discountBps })).toEqual({
      revisedUnitRatePaise: 165_000,
      revisedAmountPaise: 165_000,
      appliedImpactBps: 1_000,
      floorPricePaise: 220_000,
      maximumDiscountBps: 1_333,
      discountBasis: "selling_price",
      totalPaise,
      discount: { rateBps: discountBps, totalBeforeDiscountPaise: 253_846, amountPaise }
    });
  });

  it("uses a zero cap for zero cost and equal margins", () => {
    expect(calculateKnowledgeModePrice({ ...input, quantity: "0" })).toMatchObject({
      floorPricePaise: 0,
      maximumDiscountBps: 0,
      totalPaise: 0
    });
    expect(() => calculateKnowledgeModePrice({ ...input, quantity: "0", discountBps: 1 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
    expect(() => calculateKnowledgeModePrice({ ...input, minimumMarkupBps: 3_500, discountBps: 1 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });

  it("allows only zero discount when calculating at the minimum margin", () => {
    expect(calculateKnowledgeModePrice({ ...input, markupBasis: "minimum", discountBps: 0 })).toMatchObject({
      floorPricePaise: 220_000,
      maximumDiscountBps: 0,
      totalPaise: 220_000,
      discount: { rateBps: 0, totalBeforeDiscountPaise: 220_000, amountPaise: 0 }
    });
    expect(() => calculateKnowledgeModePrice({ ...input, markupBasis: "minimum", discountBps: 1 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });

  it("rounds fractional amounts at each documented stage", () => {
    expect(calculateKnowledgeModePrice({
      ...input,
      baseRatePaise: 997,
      impactBps: 1_250,
      quantity: "0.25",
      quantityScale: 2,
      discountBps: 525
    })).toMatchObject({
      revisedUnitRatePaise: 1_122,
      revisedAmountPaise: 281,
      floorPricePaise: 375,
      maximumDiscountBps: 1_319,
      totalPaise: 409,
      discount: { totalBeforeDiscountPaise: 432, amountPaise: 23 }
    });
    expect(calculateKnowledgeModePrice({ ...input, quantity: "15", discountBps: 1_000 }))
      .toMatchObject({ appliedImpactBps: 1_000, revisedAmountPaise: 2_475_000, totalPaise: 3_426_923 });
  });

  it("rounds half-paisa margin prices and selling-price discounts upward", () => {
    expect(calculateKnowledgeModePrice({
      baseRatePaise: 2,
      lowQuantityLimit: "0",
      impactBps: 0,
      minimumMarkupBps: 0,
      startingMarkupBps: 2_000,
      quantity: "1",
      quantityScale: 0
    })).toMatchObject({ revisedAmountPaise: 2, floorPricePaise: 2, totalPaise: 3 });
    expect(calculateKnowledgeModePrice({
      baseRatePaise: 1,
      lowQuantityLimit: "0",
      impactBps: 0,
      minimumMarkupBps: 0,
      startingMarkupBps: 6_000,
      quantity: "1",
      quantityScale: 0,
      discountBps: 5_000
    })).toMatchObject({
      floorPricePaise: 1,
      maximumDiscountBps: 6_666,
      totalPaise: 1,
      discount: { totalBeforeDiscountPaise: 3, amountPaise: 2 }
    });
  });

  it("validates discount input and rejects unsafe result amounts", () => {
    for (const discountBps of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateKnowledgeModePrice({ ...input, discountBps })).toThrow();
    }
    expect(() => calculateKnowledgeModePrice({
      ...input,
      baseRatePaise: Number.MAX_SAFE_INTEGER,
      lowQuantityLimit: "0",
      discountBps: 1_000
    })).toThrow();
  });

  it("uses the smaller component cap for an unequal combined calculation", () => {
    const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
    const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };
    const combined = { labor, material, quantity: "1", quantityScale: 0 };
    expect(calculateKnowledgeInHousePrice({ ...combined, discountBps: 500 })).toMatchObject({
      labor: {
        floorPricePaise: 48_913,
        maximumDiscountBps: 1_630,
        totalPaise: 55_520,
        discount: { amountPaise: 2_922 }
      },
      material: {
        floorPricePaise: 89_376,
        maximumDiscountBps: 2_195,
        totalPaise: 108_787,
        discount: { amountPaise: 5_726 }
      },
      totalPaise: 164_307
    });
    const atCap = calculateKnowledgeInHousePrice({ ...combined, discountBps: 1_630 });
    expect(atCap).toMatchObject({
      labor: { totalPaise: 48_916 },
      material: { totalPaise: 95_847 },
      totalPaise: 144_763
    });
    expect(atCap.labor.totalPaise).toBeGreaterThanOrEqual(atCap.labor.floorPricePaise);
    expect(atCap.material.totalPaise).toBeGreaterThanOrEqual(atCap.material.floorPricePaise);
    expect(() => calculateKnowledgeInHousePrice({ ...combined, discountBps: 1_631 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
    expect(() => calculateKnowledgeInHousePrice({ ...combined, labor: material, material: labor, discountBps: 1_631 }))
      .toThrow(KNOWLEDGE_DISCOUNT_LIMIT_MESSAGE);
  });
});

describe("combined In-house calculations", () => {
  const labor = { baseRatePaise: 45_000, lowQuantityLimit: "4", impactBps: 0, minimumMarkupBps: 800, startingMarkupBps: 2_300 };
  const material = { baseRatePaise: 65_000, lowQuantityLimit: "9", impactBps: 1_275, minimumMarkupBps: 1_800, startingMarkupBps: 3_600 };

  it.each([
    ["1", "starting", 58_442, 114_513, 172_955],
    ["1", "minimum", 48_913, 89_376, 138_289],
    ["4", "starting", 233_766, 458_050, 691_816],
    ["9", "starting", 525_974, 1_030_613, 1_556_587],
    ["0", "minimum", 0, 0, 0]
  ] as const)("adds independently rounded totals at quantity %s with %s margin", (quantity, markupBasis, laborTotal, materialTotal, total) => {
    const result = calculateKnowledgeInHousePrice({ labor, material, quantity, quantityScale: 0, markupBasis });
    expect(result.labor.totalPaise).toBe(laborTotal);
    expect(result.material.totalPaise).toBe(materialTotal);
    expect(result.totalPaise).toBe(total);
    expect(result.totalPaise).toBe(result.labor.totalPaise + result.material.totalPaise);
    expect(result.labor.appliedImpactBps).toBe(0);
    expect(result.material.appliedImpactBps).toBe(1_275);
  });

  it("adds independently rounded fractional amounts and keeps unequal configurations isolated", () => {
    const input = {
      labor: { ...labor, baseRatePaise: 997, impactBps: 1_250, startingMarkupBps: 3_500 },
      material: { ...material, baseRatePaise: 333, impactBps: 500, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 },
      quantity: "0.25",
      quantityScale: 2
    };
    expect(calculateKnowledgeInHousePrice(input)).toMatchObject({
      labor: { revisedAmountPaise: 281, totalPaise: 432 },
      material: { revisedAmountPaise: 88, totalPaise: 110 },
      totalPaise: 542
    });
    const second = calculateKnowledgeInHousePrice({ labor, material, quantity: "1", quantityScale: 0 });
    expect(second.totalPaise).toBe(172_955);
    expect(calculateKnowledgeInHousePrice(input).totalPaise).toBe(542);
  });

  it("reconciles total expense plus effective margin to the combined subtotal", () => {
    const result = calculateKnowledgeInHousePrice({ labor, material, quantity: "1", quantityScale: 0, discountBps: 500 });
    const totalExpense = result.labor.revisedAmountPaise + result.material.revisedAmountPaise;
    const totalMargin = (result.labor.totalPaise - result.labor.revisedAmountPaise) +
      (result.material.totalPaise - result.material.revisedAmountPaise);
    expect(result.totalPaise).toBe(totalExpense + totalMargin);
  });

  it("rejects an invalid cost or overflowing sum instead of returning a partial total", () => {
    expect(() => calculateKnowledgeInHousePrice({
      labor,
      material: { ...material, impactBps: -1 },
      quantity: "1",
      quantityScale: 0
    })).toThrow();
    const maximum = { ...labor, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0", minimumMarkupBps: 0, startingMarkupBps: 0 };
    expect(calculateKnowledgeModePrice({ ...maximum, quantity: "1", quantityScale: 0 }).totalPaise).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateKnowledgeInHousePrice({
      labor: maximum,
      material: { ...maximum, baseRatePaise: 1 },
      quantity: "1",
      quantityScale: 0
    })).toThrow(/combined In-house total/);
  });
});

describe("In-house low-quantity and true-margin calculations", () => {
  const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500, quantityScale: 0 };

  it("uses edited Impact below and at the limit, then removes it above the limit", () => {
    const input = { ...settings, impactBps: 1_250, quantity: "2" };
    expect(calculateKnowledgeModePrice(input)).toEqual({
      revisedUnitRatePaise: 168_750,
      revisedAmountPaise: 337_500,
      appliedImpactBps: 1_250,
      floorPricePaise: 450_000,
      maximumDiscountBps: 1_333,
      discountBasis: "selling_price",
      totalPaise: 519_231
    });
    expect(calculateKnowledgeModePrice({ ...input, markupBasis: "minimum" })).toMatchObject({
      floorPricePaise: 450_000,
      maximumDiscountBps: 0,
      totalPaise: 450_000
    });
    expect(calculateKnowledgeModePrice({ ...input, baseRatePaise: 997, quantity: "0.25", quantityScale: 2 }))
      .toMatchObject({ revisedUnitRatePaise: 1_122, revisedAmountPaise: 281, totalPaise: 432 });
    expect(calculateKnowledgeModePrice({ ...input, impactBps: 0 }).totalPaise).toBe(461_538);
    expect(calculateKnowledgeModePrice({ ...input, baseRatePaise: 50_000, impactBps: 15_000, quantity: "1" }).totalPaise).toBe(192_308);
    expect(calculateKnowledgeModePrice({ ...input, quantity: "15" })).toMatchObject({
      appliedImpactBps: 1_250,
      revisedUnitRatePaise: 168_750,
      totalPaise: 3_894_231
    });
    expect(calculateKnowledgeModePrice({ ...input, quantity: "16" })).toMatchObject({
      appliedImpactBps: 0,
      revisedUnitRatePaise: 150_000,
      totalPaise: 3_692_308
    });
  });

  it("rejects invalid Impact even when the quantity would not trigger an uplift", () => {
    for (const impactBps of [-1, 1250.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      for (const quantity of ["1", "16"]) {
        expect(() => calculateKnowledgeModePrice({ ...settings, impactBps, quantity })).toThrow(/Impact/);
      }
    }
  });

  it.each([
    ["1", 220_000],
    ["14", 3_080_000],
    ["15", 3_300_000],
    ["16", 3_200_000],
    ["0", 0]
  ])("uses the minimum gross margin at quantity %s", (quantity, totalPaise) => {
    const input = { ...settings, quantity: String(quantity) };
    const preview = calculateKnowledgeModePrice({ ...input, markupBasis: "minimum" });
    expect(preview.totalPaise).toBe(totalPaise);
    expect(preview.maximumDiscountBps).toBe(0);
    expect(preview.revisedAmountPaise).toBe(calculateKnowledgeModePrice(input).revisedAmountPaise);
    expect(input.startingMarkupBps).toBe(3_500);
  });

  it("uses the selected editable minimum on unequal and fractional scenarios", () => {
    expect(calculateKnowledgeModePrice({
      ...settings,
      markupBasis: "minimum",
      baseRatePaise: 50_000,
      quantity: "20",
      minimumMarkupBps: 2_000
    }).totalPaise).toBe(1_250_000);
    expect(calculateKnowledgeModePrice({
      ...settings,
      markupBasis: "minimum",
      baseRatePaise: 997,
      quantity: "0.25",
      quantityScale: 2
    }).totalPaise).toBe(365);
  });

  it.each([
    ["1", 253_846],
    ["14", 3_553_846],
    ["15", 3_807_692],
    ["16", 3_692_308],
    ["0", 0]
  ])("uses a true 35%% gross margin at quantity %s", (quantity, totalPaise) => {
    expect(calculateKnowledgeModePrice({ ...settings, quantity: String(quantity) }).totalPaise).toBe(totalPaise);
  });

  it("uses each line's settings and supports zero through 99.99 percent margin", () => {
    expect(calculateKnowledgeModePrice({ ...settings, baseRatePaise: 50_000, quantity: "20" }).totalPaise).toBe(1_538_462);
    expect(calculateKnowledgeModePrice({ ...settings, startingMarkupBps: 2_500, quantity: "1" }).totalPaise).toBe(220_000);
    expect(calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: 0, startingMarkupBps: 0, quantity: "1" }).totalPaise).toBe(165_000);
    expect(calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: 0, startingMarkupBps: 9_999, quantity: "1" }).totalPaise).toBe(1_650_000_000);
    expect(calculateKnowledgeModePrice({ ...settings, baseRatePaise: 997, quantity: "0.25", quantityScale: 2 }))
      .toEqual({
        revisedUnitRatePaise: 1_097,
        revisedAmountPaise: 274,
        appliedImpactBps: 1_000,
        floorPricePaise: 365,
        maximumDiscountBps: 1_350,
        discountBasis: "selling_price",
        totalPaise: 422
      });
  });

  it("rejects margins below the minimum, at or above 100%, invalid precision, and unsafe totals", () => {
    for (const startingMarkupBps of [-1, 2_499, 3_500.5, 10_000, 15_000, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateKnowledgeModePrice({ ...settings, startingMarkupBps, quantity: "1" })).toThrow();
    }
    expect(() => calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: -1, quantity: "1" })).toThrow();
    expect(() => calculateKnowledgeModePrice({ ...settings, minimumMarkupBps: 10_000, startingMarkupBps: 10_000, quantity: "1" })).toThrow();
    expect(() => calculateKnowledgeModePrice({ ...settings, baseRatePaise: Number.MAX_SAFE_INTEGER, lowQuantityLimit: "0", quantity: "1" })).toThrow();
  });

  it.each([
    { quantity: "14", expectedRate: 165_000, expectedAmount: 2_310_000, impact: 1_000 },
    { quantity: "15", expectedRate: 150_000, expectedAmount: 2_250_000, impact: 0 },
    { quantity: "16", expectedRate: 150_000, expectedAmount: 2_400_000, impact: 0 },
    { quantity: "0", expectedRate: 165_000, expectedAmount: 0, impact: 1_000 }
  ])("retains the base-rate helper's explicit legacy boundary at quantity $quantity", ({ quantity, expectedRate, expectedAmount, impact }) => {
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
