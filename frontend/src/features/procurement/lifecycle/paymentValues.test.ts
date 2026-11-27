import { describe, expect, it } from "vitest";
import { paymentPaise, paymentSum } from "./paymentValues";

describe("payment input boundaries", () => {
  it("converts rupees exactly and rejects extra precision or unsafe totals", () => {
    expect(paymentPaise("120.34")).toBe(12034);
    expect(paymentPaise("0.1")).toBe(10);
    expect(paymentSum([25000, 13000])).toBe(38000);
    for (const value of ["", "1.234", "-1", "1e3", "9,999", "90071992547410"]) expect(() => paymentPaise(value)).toThrow();
    expect(() => paymentSum([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});
