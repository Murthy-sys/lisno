import { describe, expect, it } from "vitest";
import { estimateModeBaseRatesPaise, estimateConfigurationRateMatches } from "../src/domain/estimate-mode-pricing.js";

describe("configured estimate mode bases", () => {
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
