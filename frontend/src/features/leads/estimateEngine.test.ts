import { describe, expect, it } from "vitest";
import { calculateEstimateTotals, defaultQuantity, resolveRate } from "./estimateEngine";

describe("estimate engine", () => {
  const room = { sqft: 200, length: 10, width: 20 };

  it("uses the reference quantity bases", () => {
    expect(defaultQuantity("area", room)).toBe(200);
    expect(defaultQuantity("area_x2", room)).toBe(400);
    expect(defaultQuantity("perimeter", room)).toBe(60);
    expect(defaultQuantity("1", room)).toBe(1);
    expect(defaultQuantity("custom", room)).toBe(1);
    expect(defaultQuantity("perimeter", { sqft: 225, length: null, width: null })).toBe(60);
  });

  it("uses specification rates and rounds line, GST, and grand totals like the reference", () => {
    expect(resolveRate({ baseRate: 95, rates: { Premium: 125 } }, "Premium")).toBe(125);
    expect(calculateEstimateTotals([{ included: true, quantity: 10.25, rate: 95 }, { included: false, quantity: 99, rate: 100 }])).toEqual({ subtotal: 974, gst: 175, total: 1149 });
  });
});
