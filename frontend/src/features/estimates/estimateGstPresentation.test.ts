import { describe, expect, it } from "vitest";
import { estimatePriceIncludingGst } from "../../../../shared/estimation/estimateGstPresentation";

describe("GST-inclusive estimate price presentation", () => {
  it.each([
    [0, 0], [10_000, 11_800], [25_000, 29_500], [8_664, 10_224],
    [2, 2], [3, 4], [25, 30], [26, 31], [78_333, 92_433]
  ])("displays %i net paise as %i paise including 18%% GST", (net, gross) => {
    expect(estimatePriceIncludingGst(net)).toBe(gross);
  });

  it.each([undefined, null, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER])(
    "keeps invalid, missing, or overflowing price %s unavailable", value => {
      expect(estimatePriceIncludingGst(value)).toBeNull();
    });

  it("calculates from each net line amount without multiplying a rounded gross rate", () => {
    // 3 units at 3 paise: the displayed 4-paise unit price must not create a 12-paise line.
    expect(estimatePriceIncludingGst(3)).toBe(4);
    expect(estimatePriceIncludingGst(9)).toBe(11);
    // Fractional quantity: 2.5 units at 100 paise has an authoritative 250-paise net amount.
    expect(estimatePriceIncludingGst(250)).toBe(295);
  });

  it("does not round displayed line prices to whole rupees or combine project totals", () => {
    expect(estimatePriceIncludingGst(12_125)).toBe(14_308);
    expect(estimatePriceIncludingGst(7_003)).toBe(8_264);
  });
});
