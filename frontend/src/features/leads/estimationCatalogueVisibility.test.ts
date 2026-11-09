import { describe, expect, it } from "vitest";
import type { EstimationBasePriceAvailability } from "./estimationCatalogueApi";
import { configuredTierUnavailableReason } from "./configuredEstimate";
import { isEstimationLinePriceVisible } from "./estimationCatalogueVisibility";

const matrix = (): EstimationBasePriceAvailability => ({
  default: { pmc: false, sub_vendor: false, in_house: false },
  signature: { pmc: false, sub_vendor: false, in_house: false },
  premium: { pmc: false, sub_vendor: false, in_house: false },
  functional: { pmc: false, sub_vendor: false, in_house: false }
});

describe("method-aware estimation availability", () => {
  it.each(["default", "signature", "premium", "functional"] as const)("accepts a sole positive Sub-vendor base in %s", scope => {
    const availability = matrix();
    availability[scope].sub_vendor = true;
    expect(isEstimationLinePriceVisible({ basePriceAvailability: availability })).toBe(true);
  });

  it("does not borrow PMC availability for Standard, and evaluates saved Special by its method", () => {
    const basePriceAvailability = matrix();
    basePriceAvailability.signature.pmc = true;
    const source = { hasConfiguredBasePrice: true, basePriceAvailability };
    expect(isEstimationLinePriceVisible(source)).toBe(false);
    expect(isEstimationLinePriceVisible({ ...source, classification: "special", pricingMode: "pmc" })).toBe(true);
    expect(isEstimationLinePriceVisible({ ...source, classification: "standard", pricingMode: "pmc" })).toBe(false);
  });

  it.each([null, 0, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("does not treat aggregate true or legacy Sub-vendor %s as proof", sub_vendor => {
    expect(isEstimationLinePriceVisible({ hasConfiguredBasePrice: true,
      modeBaseRatesPaise: { pmc: 9000, sub_vendor, in_house: 10000 } })).toBe(false);
  });

  it("uses only positive matching-method legacy projections and keeps authoritative false decisive", () => {
    const source = { modeBaseRatesPaise: { pmc: null, sub_vendor: 1, in_house: null } };
    expect(isEstimationLinePriceVisible(source)).toBe(true);
    expect(isEstimationLinePriceVisible({ ...source, hasConfiguredBasePrice: false })).toBe(false);
    expect(isEstimationLinePriceVisible({ ...source, basePriceAvailability: matrix() })).toBe(false);
  });

  it("requires the tier's own positive base and usable selling price", () => {
    const basePriceAvailability = matrix();
    basePriceAvailability.premium.sub_vendor = true;
    const source = { basePriceAvailability, applicableTiers: ["signature", "premium", "functional"] as const,
      tierPricing: { signature: { modeBaseRatesPaise: { pmc: 9900, sub_vendor: 1200, in_house: null } },
        premium: { modeBaseRatesPaise: { pmc: null, sub_vendor: 2500, in_house: null } } } };
    const line = { ...source, applicableTiers: [...source.applicableTiers] };
    expect(configuredTierUnavailableReason(line, "signature", "sub_vendor")).toBe("Price not configured");
    expect(configuredTierUnavailableReason(line, "premium", "sub_vendor")).toBeNull();
    expect(configuredTierUnavailableReason(line, "functional", "sub_vendor")).toBe("Not configured");
    const unavailable = { ...line, tierPricing: { ...line.tierPricing, premium: { modeBaseRatesPaise: { pmc: null, sub_vendor: null, in_house: null } } } };
    expect(configuredTierUnavailableReason(unavailable, "premium", "sub_vendor")).toBe("Price not configured");
  });
});
