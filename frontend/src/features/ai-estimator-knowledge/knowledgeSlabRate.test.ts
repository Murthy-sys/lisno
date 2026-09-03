import { describe, expect, it } from "vitest";

import {
  estimateSlabCostPaise,
  parseScaledQuantity,
  slabRateSpecificationIds
} from "./knowledgeSlabRate";

describe("priced Quantity slab calculations", () => {
  it.each([
    ["12.5", 8_000, 2, 100_000],
    ["0.5", 1, 1, 1],
    ["2", 0, 0, 0]
  ] as const)("calculates %s × %i paise at scale %i", (quantity, rate, scale, expected) => {
    expect(estimateSlabCostPaise(quantity, rate, scale)).toBe(expected);
  });

  it("rejects non-canonical, zero, excessive-scale, and unsafe totals", () => {
    expect(parseScaledQuantity("01", 2)).toEqual({ status: "invalid", reason: "format" });
    expect(parseScaledQuantity("1".repeat(65), 2)).toEqual({ status: "invalid", reason: "format" });
    expect(parseScaledQuantity("0", 2)).toEqual({ status: "invalid", reason: "positive" });
    expect(parseScaledQuantity("1.234", 2)).toEqual({ status: "invalid", reason: "scale" });
    expect(estimateSlabCostPaise("2", Number.MAX_SAFE_INTEGER, 0)).toBeNull();
  });

  it("collects stable Specification references without copying labels", () => {
    expect([...slabRateSpecificationIds([
      { id: "slab-1", specificationId: "spec-one" },
      { id: "slab-2", specificationId: "spec-one" },
      { id: "slab-3", specificationId: "spec-two" }
    ])]).toEqual(["spec-one", "spec-two"]);
  });
});
