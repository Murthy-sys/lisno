import { describe, expect, it } from "vitest";
import * as backend from "../src/domain/estimate-total-rounding.js";
import * as frontend from "../../shared/estimation/estimateTotalRounding.js";

for (const [name, { calculateEstimateTotal, estimateTotalsReconcile }] of Object.entries({ backend, frontend })) {
  describe(`${name} final estimate rounding`, () => {
    it.each([
      [10_224, 10_200, -24], [10_250, 10_200, -50], [10_251, 10_300, 49],
      [10_252, 10_300, 48], [10_299, 10_300, 1], [10_200, 10_200, 0],
      [0, 0, 0], [50, 0, -50], [51, 100, 49]
    ])("rounds %i paise to %i with adjustment %i", (amount, totalPaise, roundOffPaise) => {
      expect(calculateEstimateTotal(amount, 0)).toEqual({ totalPaise, roundOffPaise });
    });

    it("rounds the grand total once after GST, leaving both source amounts intact", () => {
      expect(calculateEstimateTotal(8_664, 1_560)).toEqual({ totalPaise: 10_200, roundOffPaise: -24 });
      expect(calculateEstimateTotal(8_688, 1_564)).toEqual({ totalPaise: 10_300, roundOffPaise: 48 });
      expect(calculateEstimateTotal(8_686, 1_564)).toEqual({ totalPaise: 10_200, roundOffPaise: -50 });
    });

    it("rejects invalid money and unsafe sums or rounding overflow", () => {
      for (const invalid of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(calculateEstimateTotal(invalid, 0)).toBeNull();
        expect(calculateEstimateTotal(0, invalid)).toBeNull();
      }
      expect(calculateEstimateTotal(Number.MAX_SAFE_INTEGER, 1)).toBeNull();
      expect(calculateEstimateTotal(Number.MAX_SAFE_INTEGER, 0)).toBeNull();
      expect(calculateEstimateTotal(9_007_199_254_740_950, 0)).toEqual({ totalPaise: 9_007_199_254_740_900, roundOffPaise: -50 });
    });

    it("keeps historical exact totals valid without silently adding rounding", () => {
      expect(estimateTotalsReconcile({ subtotalPaise: 8_664, gstPaise: 1_560, totalPaise: 10_224 })).toBe(true);
      expect(estimateTotalsReconcile({ subtotalPaise: 8_664, gstPaise: 1_560, totalPaise: 10_200 })).toBe(false);
      expect(estimateTotalsReconcile({ subtotalPaise: 8_664, gstPaise: 1_560, totalPaise: 10_224, roundOffPaise: 0 })).toBe(false);
    });

    it("requires exact signed adjustment evidence for new rounded totals", () => {
      const valid = { subtotalPaise: 8_664, gstPaise: 1_560, totalPaise: 10_200, roundOffPaise: -24 };
      expect(estimateTotalsReconcile(valid)).toBe(true);
      expect(estimateTotalsReconcile({ subtotalPaise: 8_688, gstPaise: 1_564, totalPaise: 10_300, roundOffPaise: 48 })).toBe(true);
      expect(estimateTotalsReconcile({ subtotalPaise: 10_000, gstPaise: 1_800, totalPaise: 11_800, roundOffPaise: 0 })).toBe(true);
      for (const roundOffPaise of [null, "-24", -23, -24.5, -51, 50, NaN, Infinity]) {
        expect(estimateTotalsReconcile({ ...valid, roundOffPaise })).toBe(false);
      }
      expect(estimateTotalsReconcile({ subtotalPaise: 10_250, gstPaise: 0, totalPaise: 10_300, roundOffPaise: 50 })).toBe(false);
      expect(estimateTotalsReconcile({ ...valid, totalPaise: 10_100, roundOffPaise: -124 })).toBe(false);
    });
  });
}
