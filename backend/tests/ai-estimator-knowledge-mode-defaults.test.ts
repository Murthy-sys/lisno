import { describe, expect, it } from "vitest";
import { subBasketDefaultModeCalculations, subBasketMarginRanges, withSubBasketMarginDefaults } from "../src/domain/ai-estimator-knowledge-sub-basket-margins.js";
import { estimateModeBaseRatesPaise } from "../src/domain/estimate-mode-pricing.js";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";

const owner = { basketId: "basket-own", subBasketId: "sub-own" };
const cost = (base = 12345, minimum = 1000, starting = 2000) => ({ baseRatePaise: base, lowQuantityLimit: "2.5", minimumMarkupBps: minimum, startingMarkupBps: starting });
const defaults = (same = true) => subBasketMarginRanges({ modeCalculations: {
  pmc: null, sub_vendor: null, in_house_labor: cost(99999, 2000, 3000), in_house_material: cost(88888, same ? 2000 : 2500, same ? 3000 : 3500)
} }, "in_house");

describe("saved default Mode configuration", () => {
  it("projects saved price, quantity and nullable impact without duplicating a single legacy cost", () => {
    const projected = subBasketDefaultModeCalculations({ modeCalculation: cost() });
    expect(projected.in_house.calculations).toEqual([{ scope: "in_house", baseRatePaise: 12345, lowQuantityLimit: "2.5", impactBps: null }]);
    expect(projected.pmc.calculations[0]).toMatchObject({ baseRatePaise: 12345, impactBps: null });
    expect(subBasketDefaultModeCalculations({ modeCalculations: { pmc: null, sub_vendor: null, in_house: { ...cost(), impactBps: 0 } } }).in_house.calculations)
      .toEqual([{ scope: "in_house", baseRatePaise: 12345, lowQuantityLimit: "2.5", impactBps: 0 }]);
  });

  it("does not fall back from explicit missing scoped values or an empty authoritative component list", () => {
    const projected = subBasketDefaultModeCalculations({ modeCalculation: cost(), modeCalculations: { pmc: null, in_house_labor: null } });
    expect(projected.pmc.calculations[0]?.baseRatePaise).toBeNull();
    expect(projected.sub_vendor.calculations[0]?.baseRatePaise).toBeNull();
    expect(projected.in_house.calculations).toEqual([
      { scope: "in_house_labor", baseRatePaise: null, lowQuantityLimit: null, impactBps: null },
      { scope: "in_house_material", baseRatePaise: null, lowQuantityLimit: null, impactBps: null }
    ]);
    expect(subBasketDefaultModeCalculations({ modeCalculation: cost(), inHouseComponents: [] }).in_house.calculations).toEqual([]);
  });

  it("keeps component metadata and null costs without using another component as fallback", () => {
    const component = { id: "part-a", ...owner, inclusions: [], exclusions: [], labor: cost(), material: null };
    const projected = subBasketDefaultModeCalculations({ inHouseComponents: [component] }).in_house.calculations;
    expect(projected).toEqual([
      { scope: "in_house_labor", component: { id: "part-a", ...owner }, baseRatePaise: 12345, lowQuantityLimit: "2.5", impactBps: null },
      { scope: "in_house_material", component: { id: "part-a", ...owner }, baseRatePaise: null, lowQuantityLimit: null, impactBps: null }
    ]);
  });
});

describe("current-line margin-only patches", () => {
  it("preserves a scoped legacy single base and other mode rates", () => {
    const single = cost();
    const payload = { modeCalculations: { pmc: null, sub_vendor: cost(45678), in_house: single } };
    const patched = withSubBasketMarginDefaults(payload, "in_house", defaults(), owner, { allowIncompleteMargins: true });
    expect(patched).toEqual({ modeCalculations: { ...payload.modeCalculations, in_house: cost(12345, 2000, 3000) } });
    expect(validateKnowledgeSectionPayload("advanced", patched!)).toEqual([]);
    expect(subBasketDefaultModeCalculations(patched!).in_house.calculations).toHaveLength(1);
    expect(estimateModeBaseRatesPaise(patched)).toEqual(estimateModeBaseRatesPaise(payload));
    expect(withSubBasketMarginDefaults(payload, "in_house", defaults(false), owner, { allowIncompleteMargins: true })).toBeNull();
  });

  it("blocks global legacy materialization so a margin-only apply cannot introduce other mode prices", () => {
    const payload = { modeCalculation: cost() };
    const before = structuredClone(payload);
    const rates = estimateModeBaseRatesPaise(payload);
    expect(rates).toEqual({ pmc: null, sub_vendor: null, in_house: null });
    expect(withSubBasketMarginDefaults(payload, "in_house", defaults(), owner, { allowIncompleteMargins: true })).toBeNull();
    expect(withSubBasketMarginDefaults(payload, "in_house", defaults(), owner)).toBeNull();
    expect(payload).toEqual(before);
    expect(estimateModeBaseRatesPaise(payload)).toEqual(rates);
    const pmcPatch = withSubBasketMarginDefaults(payload, "pmc", [{ key: "margin", minimumBps: 1000, maximumBps: 1500 }], owner);
    expect(estimateModeBaseRatesPaise(pmcPatch)).toEqual(rates);
  });

  it("repairs only missing margins in existing matching cost objects without adding components", () => {
    const matching = { id: "part-a", ...owner, inclusions: [], exclusions: [], labor: { ...cost(), minimumMarkupBps: null }, material: { ...cost(23456), startingMarkupBps: null } };
    const other = { id: "part-b", basketId: "basket-other", subBasketId: "sub-other", inclusions: [], exclusions: [], labor: null, material: null };
    const patched = withSubBasketMarginDefaults({ inHouseComponents: [matching, other] }, "in_house", defaults(false), owner, { allowIncompleteMargins: true });
    expect(patched?.inHouseComponents).toEqual([
      { ...matching, labor: cost(12345, 2000, 3000), material: cost(23456, 2500, 3500) }, other
    ]);
    expect(validateKnowledgeSectionPayload("advanced", patched!)).toEqual([]);
    expect(withSubBasketMarginDefaults({ inHouseComponents: [{ ...matching, material: null }] }, "in_house", defaults(), owner, { allowIncompleteMargins: true })).toBeNull();
    expect(withSubBasketMarginDefaults({ inHouseComponents: [other] }, "in_house", defaults(), owner, { allowIncompleteMargins: true })).toBeNull();
  });

  it("does not fabricate missing costs or erase invalid unrelated settings", () => {
    expect(withSubBasketMarginDefaults({}, "in_house", defaults(), owner, { allowIncompleteMargins: true })).toBeNull();
    const payload = { modeCalculations: { pmc: "bad saved data", sub_vendor: null, in_house: cost() } };
    const patched = withSubBasketMarginDefaults(payload, "in_house", defaults(), owner, { allowIncompleteMargins: true });
    expect(patched).toHaveProperty("modeCalculations.pmc", "bad saved data");
    expect(validateKnowledgeSectionPayload("advanced", patched!)).not.toEqual([]);
  });
});
