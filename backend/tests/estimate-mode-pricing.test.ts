import { describe, expect, it } from "vitest";
import { estimateModeBaseRatesPaise, estimateModeSellingRatesPaise, estimateConfigurationRateMatches, estimatePricingMetadataIsValid } from "../src/domain/estimate-mode-pricing.js";

describe("configured estimate mode bases", () => {
  it("validates tier metadata independently from pricing mode and keeps legacy Signature omissions", () => {
    for (const modeTier of [undefined, "signature", "premium", "functional"]) expect(estimatePricingMetadataIsValid({ modeTier })).toBe(true);
    for (const modeTier of [null, "unknown", "Signature", [], 1]) expect(estimatePricingMetadataIsValid({ modeTier })).toBe(false);
  });

  it.each([undefined, null, {}, [], { modeCalculations: [] }])("keeps missing data unpriced: %j", (payload) => {
    expect(estimateModeBaseRatesPaise(payload)).toEqual({ pmc: null, sub_vendor: null, in_house: null });
  });
  it.each(["pmc", "sub_vendor", "in_house"])("validates exact nonnegative paise for %s", (mode) => {
    for (const invalid of [undefined, null, "100", -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(estimateModeBaseRatesPaise({ modeCalculations: { [mode]: { baseRatePaise: invalid } } })[mode as "pmc"]).toBeNull();
    }
    for (const valid of [0, 1001, Number.MAX_SAFE_INTEGER]) {
      expect(estimateModeBaseRatesPaise({ modeCalculations: { [mode]: { baseRatePaise: valid } } })[mode as "pmc"]).toBe(valid);
    }
  });
  it("requires both split bases and never substitutes a legacy combined rate", () => {
    for (const split of [{ in_house_labor: {} }, { in_house_material: null },
      { in_house_labor: { baseRatePaise: 10 }, in_house_material: { baseRatePaise: -1 } },
      { in_house_labor: { baseRatePaise: Number.MAX_SAFE_INTEGER }, in_house_material: { baseRatePaise: 1 } }]) {
      expect(estimateModeBaseRatesPaise({ modeCalculations: { in_house: { baseRatePaise: 900 }, ...split } }).in_house).toBeNull();
    }
    expect(estimateModeBaseRatesPaise({ modeCalculations: {
      pmc: { baseRatePaise: 125 }, sub_vendor: { baseRatePaise: 987 }, in_house: { baseRatePaise: 900 },
      in_house_labor: { baseRatePaise: 101 }, in_house_material: { baseRatePaise: 202 }
    } })).toEqual({ pmc: 125, sub_vendor: 987, in_house: 303 });
  });
  it("compares only valid configuration-derived modes, preserving manual and historical rates", () => {
    const bases = { pmc: 0, sub_vendor: 1001, in_house: null };
    expect(estimateConfigurationRateMatches({ ratePaise: 2345 }, bases)).toBe(true);
    expect(estimateConfigurationRateMatches({ classification: "special", pricingMode: "pmc", rateSource: "manual", ratePaise: 2345 }, bases)).toBe(true);
    expect(estimateConfigurationRateMatches({ pricingMode: "pmc", rateSource: "configuration", ratePaise: 0 }, bases)).toBe(false);
    expect(estimateConfigurationRateMatches({ rateSource: "configuration", ratePaise: 0 }, bases)).toBe(false);
    expect(estimateConfigurationRateMatches({ classification: "special", pricingMode: "pmc", rateSource: "configuration", ratePaise: 0 }, bases)).toBe(true);
    expect(estimateConfigurationRateMatches({ classification: "special", pricingMode: "in_house", rateSource: "configuration", ratePaise: null }, bases)).toBe(true);
    expect(estimateConfigurationRateMatches({ classification: "special", pricingMode: "in_house", rateSource: "configuration", ratePaise: 0 }, bases)).toBe(false);
  });
});


describe("configured estimate selling rates", () => {
  it("adds the configured maximum profit to the base price without using a gross-margin divisor", () => {
    expect(estimateModeSellingRatesPaise({
      subVendorMinimumMarginBps: 500, subVendorMarginBps: 2500,
      modeCalculations: { sub_vendor: { baseRatePaise: 20_000, startingMarkupBps: 9000 } }
    })).toEqual({ pmc: null, sub_vendor: 25_000, in_house: null });
  });

  it("uses each mode's own maximum rather than its minimum or another mode's maximum", () => {
    expect(estimateModeSellingRatesPaise({
      pmcMinimumMarginBps: 1000, pmcMarginBps: 1500,
      subVendorMinimumMarginBps: 500, subVendorMarginBps: 2500,
      modeCalculations: { pmc: { baseRatePaise: 12_000 }, sub_vendor: { baseRatePaise: 20_000 } }
    })).toEqual({ pmc: 13_800, sub_vendor: 25_000, in_house: null });
  });

  it("preserves explicit zero margins and zero prices", () => {
    expect(estimateModeSellingRatesPaise({ pmcMarginBps: 0, subVendorMarginBps: 0,
      modeCalculations: { pmc: { baseRatePaise: 1001 }, sub_vendor: { baseRatePaise: Number.MAX_SAFE_INTEGER } }
    })).toEqual({ pmc: 1001, sub_vendor: Number.MAX_SAFE_INTEGER, in_house: null });
    expect(estimateModeSellingRatesPaise({ subVendorMarginBps: 9500,
      modeCalculations: { sub_vendor: { baseRatePaise: 0 } }
    }).sub_vendor).toBe(0);
  });

  it.each([undefined, null, "2500", -1, 1.5, NaN, Infinity, 9501, Number.MAX_SAFE_INTEGER + 1])(
    "leaves missing or invalid maxima unpriced without borrowing other settings: %s", maximum => {
      for (const [mode, marginKey, otherKey] of [
        ["pmc", "pmcMarginBps", "subVendorMarginBps"],
        ["sub_vendor", "subVendorMarginBps", "pmcMarginBps"]
      ] as const) {
        const result = estimateModeSellingRatesPaise({
          [marginKey]: maximum, [otherKey]: 1500, pmcMinimumMarginBps: 1000, subVendorMinimumMarginBps: 500,
          modeCalculations: { [mode]: { baseRatePaise: 20_000, startingMarkupBps: 2500 } }
        });
        expect(result[mode]).toBeNull();
      }
    }
  );

  it("keeps missing or invalid costs unpriced even with a valid maximum", () => {
    for (const baseRatePaise of [undefined, null, "20000", -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(estimateModeSellingRatesPaise({ subVendorMarginBps: 2500,
        modeCalculations: { sub_vendor: { baseRatePaise } }
      }).sub_vendor).toBeNull();
    }
    expect(estimateModeSellingRatesPaise(undefined)).toEqual({ pmc: null, sub_vendor: null, in_house: null });
  });

  it.each([[1, 2500, 1], [2, 2500, 3], [3, 2500, 4], [101, 1500, 116], [101, 9500, 197]])(
    "rounds %i paise plus %i basis points once to %i paise", (baseRatePaise, subVendorMarginBps, expected) => {
      expect(estimateModeSellingRatesPaise({ subVendorMarginBps,
        modeCalculations: { sub_vendor: { baseRatePaise } }
      }).sub_vendor).toBe(expected);
    }
  );

  it("rejects unsafe selling totals without overflowing intermediate arithmetic", () => {
    expect(estimateModeSellingRatesPaise({ subVendorMarginBps: 1,
      modeCalculations: { sub_vendor: { baseRatePaise: Number.MAX_SAFE_INTEGER } }
    }).sub_vendor).toBeNull();
    expect(estimateModeSellingRatesPaise({ subVendorMarginBps: 2500,
      modeCalculations: { sub_vendor: { baseRatePaise: 7_205_759_403_792_793 } }
    }).sub_vendor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("adds the legacy In-house maximum to its own combined base", () => {
    expect(estimateModeSellingRatesPaise({
      pmcMarginBps: 1500, subVendorMarginBps: 500,
      modeCalculations: { in_house: { baseRatePaise: 20_000, minimumMarkupBps: 1000, startingMarkupBps: 2500 } }
    }).in_house).toBe(25_000);
    expect(estimateModeSellingRatesPaise({
      modeCalculations: { in_house: { baseRatePaise: 20_000, startingMarkupBps: 9999 } }
    }).in_house).toBe(39_998);
    expect(estimateModeSellingRatesPaise({
      modeCalculations: { in_house: { baseRatePaise: 20_000, startingMarkupBps: 0 } }
    }).in_house).toBe(20_000);
  });

  it("adds independently rounded labor and material selling rates using their own maxima", () => {
    expect(estimateModeSellingRatesPaise({ modeCalculations: {
      in_house: { baseRatePaise: 99_000, startingMarkupBps: 9000 },
      in_house_labor: { baseRatePaise: 1001, startingMarkupBps: 1500 },
      in_house_material: { baseRatePaise: 2002, startingMarkupBps: 2500 }
    } }).in_house).toBe(3654);
  });

  it.each([undefined, null, "2500", -1, 1.5, NaN, Infinity, 10_000])(
    "does not borrow a missing or invalid In-house maximum: %s", startingMarkupBps => {
      expect(estimateModeSellingRatesPaise({ subVendorMarginBps: 2500,
        modeCalculations: { in_house: { baseRatePaise: 20_000, minimumMarkupBps: 1000, startingMarkupBps } }
      }).in_house).toBeNull();
      for (const incompleteScope of ["in_house_labor", "in_house_material"]) {
        expect(estimateModeSellingRatesPaise({ modeCalculations: {
          in_house: { baseRatePaise: 30_000, startingMarkupBps: 1500 },
          in_house_labor: { baseRatePaise: 10_000, startingMarkupBps: 2000 },
          in_house_material: { baseRatePaise: 20_000, startingMarkupBps: 2500 },
          [incompleteScope]: { baseRatePaise: 10_000, startingMarkupBps }
        } }).in_house).toBeNull();
      }
    }
  );

  it("requires both split costs and never falls back to a combined rate", () => {
    for (const split of [
      { in_house_labor: { baseRatePaise: 100, startingMarkupBps: 2500 } },
      { in_house_material: null },
      { in_house_labor: { baseRatePaise: 100, startingMarkupBps: 2500 }, in_house_material: { baseRatePaise: -1, startingMarkupBps: 2500 } }
    ]) {
      expect(estimateModeSellingRatesPaise({ modeCalculations: {
        in_house: { baseRatePaise: 20_000, startingMarkupBps: 2500 }, ...split
      } }).in_house).toBeNull();
    }
  });

  it("rejects overflow in combined or summed In-house selling rates", () => {
    expect(estimateModeSellingRatesPaise({ modeCalculations: {
      in_house: { baseRatePaise: Number.MAX_SAFE_INTEGER, startingMarkupBps: 1 }
    } }).in_house).toBeNull();
    expect(estimateModeSellingRatesPaise({ modeCalculations: {
      in_house_labor: { baseRatePaise: Number.MAX_SAFE_INTEGER, startingMarkupBps: 0 },
      in_house_material: { baseRatePaise: 1, startingMarkupBps: 0 }
    } }).in_house).toBeNull();
  });

  it("leaves modern In-house components to their separate calculation path", () => {
    for (const inHouseComponents of [[], null, [{ id: "component" }]]) {
      expect(estimateModeSellingRatesPaise({ inHouseComponents,
        modeCalculations: { in_house: { baseRatePaise: 20_000, startingMarkupBps: 2500 } }
      }).in_house).toBeNull();
    }
  });
});
