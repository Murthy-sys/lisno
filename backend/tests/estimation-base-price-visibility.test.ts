import { describe, expect, it } from "vitest";
import { configuredKnowledgeBasePriceAvailability, hasConfiguredBasePriceForMode, hasConfiguredKnowledgeBasePrice } from "../src/domain/estimation-base-price-visibility.js";
import { estimateModeSellingRatesPaise } from "../src/domain/estimate-mode-pricing.js";

const section = (payload: unknown, applicability = "configured") => ({ sectionKey: "advanced", applicability, payload });
const base = (value: unknown) => ({ modeCalculations: { sub_vendor: { baseRatePaise: value } } });
const settings = (baseRatePaise: number) => ({ baseRatePaise, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1000, startingMarkupBps: 2500 });
const component = () => ({ id: "part", basketId: "basket", subBasketId: "sub", inclusions: [], exclusions: [], labor: settings(100), material: settings(200) });
const available = () => true;
const scopes = ["default", "signature", "premium", "functional"] as const;
const scopeBases = (values: Record<string, unknown>) => ({ ...base(values.signature), tierConfigurations: Object.fromEntries(
  scopes.filter(scope => scope !== "signature").map(scope => [scope, { applicability: "configured", payload: base(values[scope]) }])) });

describe("estimation base-price visibility", () => {
  it.each(scopes.flatMap(scope => (["pmc", "sub_vendor", "in_house"] as const).map(mode => ({ scope, mode }))))(
    "projects an independent sole positive $scope/$mode base", ({ scope, mode }) => {
      const price = { modeCalculations: { [mode]: { baseRatePaise: 1 } } };
      const payload = scope === "signature" ? price : { tierConfigurations: { [scope]: { applicability: "configured", payload: price } } };
      const matrix = configuredKnowledgeBasePriceAvailability(section(payload), available);
      expect(matrix).toEqual(Object.fromEntries(scopes.map(entry => [entry,
        Object.fromEntries(["pmc", "sub_vendor", "in_house"].map(method => [method, entry === scope && method === mode]))])));
      expect(hasConfiguredBasePriceForMode(matrix, mode)).toBe(true);
      expect(hasConfiguredBasePriceForMode(matrix, mode === "sub_vendor" ? "pmc" : "sub_vendor")).toBe(false);
    });

  it("does not let Signature PMC qualify Standard and keeps zero Signature separate from positive Premium", () => {
    const matrix = configuredKnowledgeBasePriceAvailability(section({ modeCalculations: { pmc: { baseRatePaise: 100 }, sub_vendor: { baseRatePaise: 0 } },
      tierConfigurations: { premium: { applicability: "configured", payload: base(10) } } }), available);
    expect(matrix.signature).toEqual({ pmc: true, sub_vendor: false, in_house: false });
    expect(matrix.premium).toEqual({ pmc: false, sub_vendor: true, in_house: false });
    expect(matrix.default).toEqual({ pmc: false, sub_vendor: false, in_house: false });
  });

  it.each(scopes)("accepts a sole saved one-paise %s base without requiring selling margins", scope => {
    const payload = scope === "signature" ? base(1) : { tierConfigurations: { [scope]: { applicability: "configured", payload: base(1) } } };
    expect(hasConfiguredKnowledgeBasePrice(section(payload), available)).toBe(true);
    expect(estimateModeSellingRatesPaise(payload)).toEqual({ pmc: null, sub_vendor: null, in_house: null });
    expect(hasConfiguredKnowledgeBasePrice(section(scopeBases({ default: 0, signature: 0, premium: 0, functional: 0, [scope]: 1 })), available)).toBe(true);
  });

  it.each(scopes)("hides zero-only and mixed zero/invalid %s scopes", scope => {
    expect(hasConfiguredKnowledgeBasePrice(section(scopeBases({ [scope]: 0 })), available)).toBe(false);
    expect(hasConfiguredKnowledgeBasePrice(section(scopeBases({ default: null, signature: -1, premium: 1.5, functional: undefined, [scope]: 0 })), available)).toBe(false);
  });

  it.each([1, Number.MAX_SAFE_INTEGER])("accepts valid positive integer-paise base %s", value => {
    expect(hasConfiguredKnowledgeBasePrice(section(base(value)), available)).toBe(true);
  });

  it.each([undefined, null, "", "20", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects nonpositive or invalid base %s", value => {
    expect(hasConfiguredKnowledgeBasePrice(section(base(value)), available)).toBe(false);
  });

  it("requires configured scope and ignores descriptions, margins and placeholders", () => {
    expect(hasConfiguredKnowledgeBasePrice(undefined, available)).toBe(false);
    expect(hasConfiguredKnowledgeBasePrice(section(base(100), "not_configured"), available)).toBe(false);
    expect(hasConfiguredKnowledgeBasePrice(section({ description: "Available", pmcMarginBps: 2000, subVendorMarginBps: 3000,
      tierConfigurations: { default: { applicability: "not_configured", payload: base(100) } } }), available)).toBe(false);
  });

  it("accepts combined or complete split In-house and rejects incomplete or overflowing split pairs", () => {
    const mode = (modeCalculations: unknown) => hasConfiguredKnowledgeBasePrice(section({ modeCalculations }), available);
    expect(mode({ in_house: { baseRatePaise: 0 } })).toBe(false);
    expect(mode({ in_house: { baseRatePaise: 1 } })).toBe(true);
    expect(mode({ in_house_labor: { baseRatePaise: 0 }, in_house_material: { baseRatePaise: 0 } })).toBe(false);
    expect(mode({ in_house_labor: { baseRatePaise: 1200 }, in_house_material: { baseRatePaise: 0 } })).toBe(true);
    expect(mode({ in_house_labor: { baseRatePaise: 0 }, in_house_material: { baseRatePaise: 1 } })).toBe(true);
    expect(mode({ in_house: { baseRatePaise: 500 }, in_house_labor: { baseRatePaise: 100 } })).toBe(false);
    expect(mode({ in_house_labor: { baseRatePaise: Number.MAX_SAFE_INTEGER }, in_house_material: { baseRatePaise: 1 } })).toBe(false);
  });

  it("requires a valid usable component and respects component precedence over legacy costs", () => {
    const payload = { inHouseComponents: [component()], modeCalculations: { in_house: { baseRatePaise: 500 } } };
    expect(hasConfiguredKnowledgeBasePrice(section(payload), available)).toBe(true);
    expect(hasConfiguredKnowledgeBasePrice(section(payload), () => false)).toBe(false);
    for (const inHouseComponents of [[], null, [{ ...component(), material: null }], [{ ...component(), labor: settings(-1) }],
      [{ ...component(), labor: settings(1.5) }], [{ ...component(), labor: settings(NaN) }],
      [{ ...component(), labor: settings(Number.MAX_SAFE_INTEGER), material: settings(1) }]]) {
      expect(hasConfiguredKnowledgeBasePrice(section({ ...payload, inHouseComponents }), available)).toBe(false);
    }
    expect(hasConfiguredKnowledgeBasePrice(section({ inHouseComponents: [{ ...component(), labor: settings(0), material: settings(0) }] }), available)).toBe(false);
    expect(hasConfiguredKnowledgeBasePrice(section({ inHouseComponents: [{ ...component(), labor: settings(0), material: settings(1) }] }), available)).toBe(true);
    expect(hasConfiguredKnowledgeBasePrice(section({ inHouseComponents: [{ ...component(), labor: settings(1), material: settings(0) }] }), available)).toBe(true);
    expect(hasConfiguredKnowledgeBasePrice(section({ inHouseComponents: [component(), { ...component(), id: "unavailable", basketId: "other", subBasketId: "other-sub" }] }), part => part.id === "part")).toBe(true);
  });
});
