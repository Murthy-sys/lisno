import { describe, expect, it } from "vitest";

import {
  KnowledgeCalculationError,
  adjustMoneyByBasisPoints,
  applyBasisPoints,
  calculateDuration,
  calculateKnowledgePreview,
  calculateMarginSellingPrice,
  calculateProcurementQuantity,
  calculateSlabRateEstimatedCost,
  canonicalizeScaledDecimal,
  deriveTaxAmounts,
  parseScaledDecimal
} from "../src/domain/ai-estimator-knowledge-calculation.js";

describe("AI estimator knowledge calculation", () => {
  it("matches every approved ₹75 component example with integer paise", () => {
    expect(adjustMoneyByBasisPoints(7_500, 500)).toBe(7_875);
    expect(calculateMarginSellingPrice(7_500, 2_500)).toBe(10_000);
    expect(calculateMarginSellingPrice(7_500, 1_500)).toBe(8_824);
    expect(applyBasisPoints(7_500, 1_500)).toBe(1_125);
    expect(applyBasisPoints(7_500, 1_800)).toBe(1_350);
  });

  it("derives exclusive and inclusive tax without trusting client totals", () => {
    expect(deriveTaxAmounts({ inputAmountPaise: 7_500, rateBps: 1_800, treatment: "exclusive" })).toEqual({
      inputAmountPaise: 7_500,
      rateBps: 1_800,
      treatment: "exclusive",
      baseAmountPaise: 7_500,
      taxAmountPaise: 1_350,
      totalAmountPaise: 8_850
    });
    expect(deriveTaxAmounts({ inputAmountPaise: 11_800, rateBps: 1_800, treatment: "inclusive" })).toEqual({
      inputAmountPaise: 11_800,
      rateBps: 1_800,
      treatment: "inclusive",
      baseAmountPaise: 10_000,
      taxAmountPaise: 1_800,
      totalAmountPaise: 11_800
    });
    expect(deriveTaxAmounts({ inputAmountPaise: 1, rateBps: 5_000, treatment: "exclusive" })).toEqual({
      inputAmountPaise: 1,
      rateBps: 5_000,
      treatment: "exclusive",
      baseAmountPaise: 1,
      taxAmountPaise: 1,
      totalAmountPaise: 2
    });
    expect(deriveTaxAmounts({ inputAmountPaise: 25, rateBps: 1_800, treatment: "exclusive" })).toEqual({
      inputAmountPaise: 25,
      rateBps: 1_800,
      treatment: "exclusive",
      baseAmountPaise: 25,
      taxAmountPaise: 5,
      totalAmountPaise: 30
    });
  });

  it("keeps wastage limited to procurement quantity", () => {
    expect(calculateProcurementQuantity({ quantity: "10", quantityScale: 2, wastageBps: 500 })).toBe("10.5");
    const preview = calculateKnowledgePreview({
      unitRatePaise: 7_500,
      quantity: "10",
      quantityScale: 2,
      wastageBps: 500
    });
    expect(preview.requiredQuantity).toBe("10");
    expect(preview.procurementQuantity).toBe("10.5");
    expect(preview.vendorPreTax?.amountPaise).toBe(75_000);
  });

  it("derives priced slab cost with checked half-up paise arithmetic", () => {
    expect(calculateSlabRateEstimatedCost({
      unitRatePaise: 8_000,
      quantity: "12.5",
      quantityScale: 1
    })).toBe(100_000);
    expect(calculateSlabRateEstimatedCost({
      unitRatePaise: 1,
      quantity: "0.5",
      quantityScale: 1
    })).toBe(1);
    expect(calculateSlabRateEstimatedCost({
      unitRatePaise: 0,
      quantity: "999",
      quantityScale: 0
    })).toBe(0);
    expect(calculateSlabRateEstimatedCost({
      unitRatePaise: Number.MAX_SAFE_INTEGER,
      quantity: "1",
      quantityScale: 0
    })).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateSlabRateEstimatedCost({
      unitRatePaise: Number.MAX_SAFE_INTEGER,
      quantity: "2",
      quantityScale: 0
    })).toThrowError(/safe-integer boundary/u);
  });

  it("rounds duration half-up to at most six digits and then clamps", () => {
    expect(calculateDuration({ quantity: "2", quantityScale: 0, productivity: "3", productivityScale: 0, unit: "days" })).toEqual({
      raw: "0.666667",
      clamped: "0.666667",
      unit: "days"
    });
    expect(calculateDuration({ quantity: "2", quantityScale: 0, productivity: "3", productivityScale: 0, unit: "days", minimum: "1.25" })).toEqual({
      raw: "0.666667",
      clamped: "1.25",
      unit: "days"
    });
  });

  it("rejects excess quantity precision, invalid margins, and unsafe results", () => {
    expect(() => parseScaledDecimal("1.001", 2)).toThrow(KnowledgeCalculationError);
    expect(() => canonicalizeScaledDecimal("1e2", 2)).toThrow(KnowledgeCalculationError);
    expect(() => adjustMoneyByBasisPoints(7_500, -1)).toThrowError(/between 0 and 10000/u);
    expect(() => calculateMarginSellingPrice(7_500, 10_000)).toThrowError(/less than 10000|between 0 and 9999/u);
    expect(() => adjustMoneyByBasisPoints(Number.MAX_SAFE_INTEGER, 10_000)).toThrowError(/safe-integer boundary/u);
  });

  it("returns transparent components and never exposes a finalPrice", () => {
    const preview = calculateKnowledgePreview({
      priceVersionId: "price-v1",
      taxVersionId: "tax-v1",
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
    expect(preview.adjustedUnitRate).toEqual({ amountPaise: 7_875, basisAmountPaise: 7_500, rateBps: 500 });
    expect(preview.vendorTax).toEqual({ amountPaise: 1_418, basisAmountPaise: 7_875, rateBps: 1_800 });
    expect(preview.startMargin).toEqual({ amountPaise: 10_500, basisAmountPaise: 7_875, rateBps: 2_500 });
    expect(preview).not.toHaveProperty("finalPrice");
  });
});
