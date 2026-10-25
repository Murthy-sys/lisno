import { describe, expect, it } from "vitest";
import { comparableInHouseMarginRanges, configuredInHouseMarginRanges, subBasketMarginRanges, validSubBasketMarginRanges, withSubBasketMarginDefaults } from "../src/domain/ai-estimator-knowledge-sub-basket-margins.js";

const owner = { basketId: "basket-own", subBasketId: "sub-own" };
const cost = (base: number, minimum = 2000, starting = 3000) => ({ baseRatePaise: base, lowQuantityLimit: "15", impactBps: 1000, minimumMarkupBps: minimum, startingMarkupBps: starting });
const component = (id: string, basketId: string, subBasketId: string, minimum = 2000, starting = 3000) => ({
  id, basketId, subBasketId, inclusions: [], exclusions: [], labor: cost(10100, minimum, starting), material: cost(20300, minimum + 500, starting + 500)
});
const ranges = (components: unknown[]) => subBasketMarginRanges({ inHouseComponents: components }, "in_house");

describe("component-specific default margins", () => {
  it("matches references across different component IDs and order without combining margins", () => {
    const defaults = ranges([component("source-own", owner.basketId, owner.subBasketId), component("source-other", "basket-other", "sub-other", 1500, 2500)]);
    const targets = ranges([component("target-other", "basket-other", "sub-other", 1500, 2500), component("target-own", owner.basketId, owner.subBasketId)]);
    const compared = comparableInHouseMarginRanges(defaults, targets, owner);
    expect(compared.source.map(({ minimumBps }) => minimumBps)).toEqual([1500, 2000, 2000, 2500]);
    expect(compared.source).toEqual(compared.target);
  });

  it("skips unconfigured components and components absent from the first main line", () => {
    const defaults = ranges([component("source-own", owner.basketId, owner.subBasketId), { ...component("source-empty", "basket-empty", "sub-empty"), material: null }]);
    const targets = ranges([component("target-own", owner.basketId, owner.subBasketId, 0, 500), component("target-extra", "basket-extra", "sub-extra"), { ...component("target-empty", "basket-empty", "sub-empty"), labor: null }]);
    expect(configuredInHouseMarginRanges(defaults, owner)).toHaveLength(2);
    expect(comparableInHouseMarginRanges(defaults, targets, owner).target).toHaveLength(2);
    expect(validSubBasketMarginRanges([], "in_house")).toBe(false);
  });

  it("copies only matching configured margins while preserving rates, scopes, other components and old fields", () => {
    const selected = component("target-own", owner.basketId, owner.subBasketId, 0, 500);
    const extra = component("target-extra", "basket-extra", "sub-extra", 1000, 1500);
    const blank = { ...component("target-blank", "basket-blank", "sub-blank"), labor: null, material: null };
    const payload = { pmcMarginBps: 1800, modeCalculations: { in_house_labor: cost(99999) }, inHouseComponents: [extra, selected, blank] };
    const defaults = ranges([component("source-own", owner.basketId, owner.subBasketId), component("source-blank", "basket-blank", "sub-blank")]);
    expect(withSubBasketMarginDefaults(payload, "in_house", defaults, owner)).toEqual({ ...payload, inHouseComponents: [extra,
      { ...selected, labor: { ...selected.labor, minimumMarkupBps: 2000, startingMarkupBps: 3000 }, material: { ...selected.material, minimumMarkupBps: 2500, startingMarkupBps: 3500 } }, blank] });
  });

  it("matches legacy defaults only to the component for the current main line's basket and sub-basket", () => {
    const legacy = { modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: cost(11100), in_house_material: cost(22200, 2500, 3500) } };
    const same = component("target-own", owner.basketId, owner.subBasketId, 0, 500);
    const other = component("target-other", "basket-other", "sub-other", 1000, 2000);
    const result = withSubBasketMarginDefaults({ inHouseComponents: [same, other] }, "in_house", subBasketMarginRanges(legacy, "in_house"), owner);
    expect(result?.inHouseComponents).toEqual([{ ...same, labor: cost(10100), material: cost(20300, 2500, 3500) }, other]);
    const source = ranges([component("source-other", "basket-other", "sub-other", 1000, 2000), component("source-own", owner.basketId, owner.subBasketId, 3000, 4000)]);
    expect(withSubBasketMarginDefaults(legacy, "in_house", source, owner)).toEqual({ modeCalculations: { ...legacy.modeCalculations,
      in_house_labor: cost(11100, 3000, 4000), in_house_material: cost(22200, 3500, 4500) } });
  });
});
