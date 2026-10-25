import { describe, expect, it } from "vitest";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";
import { readInHouseComponents, inHouseComponentBaseRate, selectedInHouseBaseRate } from "../src/domain/ai-estimator-knowledge-in-house-components.js";
import { estimateModeBaseRatesPaise, estimateConfigurationRateMatches } from "../src/domain/estimate-mode-pricing.js";
import { buildKnowledgeConfigurationContext } from "../src/domain/ai-estimator-knowledge-configuration-context.js";
import { calculateKnowledgeInHousePrice } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { analyzePurchaseOrderModeSettings, buildPurchaseOrderModeCalculationStages } from "../src/domain/project-purchase-order-mode.js";
import { assistantSellingAmount } from "../src/services/project-assistant-pricing.js";

const settings = (baseRatePaise: number, lowQuantityLimit = "2.75", impactBps = 1250) => ({ baseRatePaise, lowQuantityLimit, impactBps, minimumMarkupBps: 1000, startingMarkupBps: 2500 });
const component = (id: string, basketId = "basket-other", subBasketId: string | null = `sub-${id}`) => ({
  id, basketId, subBasketId, inclusions: [{ id: "incl-one", name: "Delivery", selected: true }], exclusions: [],
  labor: settings(743), material: settings(1057, "2.50", 700)
});
const first = component("first");
const second = { ...component("second"), labor: settings(997), material: settings(1789, "2.80", 0) };
const advanced = { inHouseComponents: [first, second], modeCalculations: { pmc: settings(999), sub_vendor: settings(888), in_house: settings(99999) }, pmcMarginBps: 1500, subVendorMarginBps: 2500 };
const uom = { id: "uom-area", name: "Square foot", decimalScale: 2 };
const price = { classification: "special", pricingMode: "in_house", rateSource: "configuration" };
const rates = advanced.inHouseComponents.map((row) => ({ id: row.id, baseRatePaise: inHouseComponentBaseRate(row) }));

describe("independent In-house component storage and selection", () => {
  it("accepts independent scopes across catalogues while retaining legacy fields unchanged", () => {
    const payload = { ...advanced, modeCalculations: { ...advanced.modeCalculations, in_house: "preserved obsolete data", in_house_labor: -1 } };
    expect(validateKnowledgeSectionPayload("advanced", payload)).toEqual([]);
    expect(readInHouseComponents(payload)).toEqual([first, second]);
    expect(estimateModeBaseRatesPaise(payload)).toEqual({ pmc: 999, sub_vendor: 888, in_house: null });
  });
  it.each([[], null, {}, "invalid"])("never falls back from an explicit array value %j", (value) => {
    expect(estimateModeBaseRatesPaise({ ...advanced, inHouseComponents: value }).in_house).toBeNull();
    expect(selectedInHouseBaseRate([], [])).toBeNull();
  });
  it.each([
    [{ ...first, subBasketId: null }],
    [{ ...first, id: "x".repeat(129) }],
    [{ ...first, id: " first " }],
    [first, first],
    [first, { ...first, id: "different" }],
    [{ ...first, labor: { ...first.labor, startingMarkupBps: 10000 } }],
    [{ ...first, exclusions: [{ id: "excluded", name: "Delivery", selected: true }] }],
    Array.from({ length: 51 }, (_, index) => component(`component-${index}`))
  ])("rejects invalid component storage", (inHouseComponents) => {
    expect(validateKnowledgeSectionPayload("advanced", { inHouseComponents }).length).toBeGreaterThan(0);
    expect(readInHouseComponents({ inHouseComponents })).toBeNull();
  });
  it("allows repairing converted checklists while preserving the obsolete root In-house checklist", () => {
    const modeConfigurations = [{ id: "legacy-scope", modeKind: "execution", executionSource: "in_house", fields: [],
      inclusions: [{ id: "inc", name: "Same value", selected: true }], exclusions: [{ id: "exc", name: "Same value", selected: true }] }];
    expect(validateKnowledgeSectionPayload("advanced", { modeConfigurations })).not.toEqual([]);
    expect(validateKnowledgeSectionPayload("advanced", { ...advanced, modeConfigurations })).toEqual([]);
    expect(validateKnowledgeSectionPayload("advanced", { ...advanced, modeConfigurations: [{ ...modeConfigurations[0], modeKind: "pmc", executionSource: undefined }] })).not.toEqual([]);
  });
  it("accepts a retained legacy component with blank material until explicitly configured", () => {
    expect(validateKnowledgeSectionPayload("advanced", { inHouseComponents: [{ ...component("legacy-in-house", "own", null), material: null }] })).toEqual([]);
    expect(validateKnowledgeSectionPayload("advanced", { inHouseComponents: [component("legacy-in-house", "own", "own-sub")] })).toEqual([]);
  });
  it("sums exactly selected base rates in configuration order and requires a valid selection for manual rates", () => {
    expect(selectedInHouseBaseRate(rates, ["second"])).toBe(2786);
    expect(selectedInHouseBaseRate(rates, ["second", "first"])).toBe(4586);
    for (const selectedInHouseComponentIds of [undefined, [], ["removed"], ["first", "first"]]) {
      expect(estimateConfigurationRateMatches({ ...price, ratePaise: 1800, selectedInHouseComponentIds }, estimateModeBaseRatesPaise(advanced), rates)).toBe(false);
      expect(estimateConfigurationRateMatches({ ...price, rateSource: "manual", ratePaise: 500, selectedInHouseComponentIds }, estimateModeBaseRatesPaise(advanced), rates)).toBe(false);
    }
    expect(estimateConfigurationRateMatches({ ...price, ratePaise: 1800, selectedInHouseComponentIds: ["first"] }, estimateModeBaseRatesPaise(advanced), rates)).toBe(true);
    expect(estimateConfigurationRateMatches({ ...price, rateSource: "manual", ratePaise: 500, selectedInHouseComponentIds: ["first"] }, estimateModeBaseRatesPaise(advanced), [{ id: "first", baseRatePaise: null }])).toBe(true);
    expect(estimateConfigurationRateMatches({ ...price, rateSource: "manual", ratePaise: 500, selectedInHouseComponentIds: ["first"] }, estimateModeBaseRatesPaise(advanced), [{ id: "first", baseRatePaise: null, unavailableReason: "Removed basket" }])).toBe(false);
  });
  it("uses selected scopes and never borrows a missing component cost or a legacy scope checklist", () => {
    const context = buildKnowledgeConfigurationContext({ advanced, uom, modeKind: "execution", executionSource: "in_house", selectedInHouseComponentIds: ["second"], quantity: "2.75" });
    expect(context.state).toBe("ready");
    expect(context.calculations.map((row) => [row.componentId, row.scope, row.settings?.baseRatePaise])).toEqual([["second", "in_house_labor", 997], ["second", "in_house_material", 1789]]);
    expect(context.inHouseComponents?.[0]?.inclusions).toEqual([{ id: "incl-one", name: "Delivery" }]);
    expect(context.shared.inclusions).toEqual([]);
    expect(buildKnowledgeConfigurationContext({ advanced, uom, modeKind: "execution", executionSource: "in_house" }).state).toBe("selection_required");
    expect(buildKnowledgeConfigurationContext({ advanced: { ...advanced, inHouseComponents: [{ ...first, material: null }] }, uom, modeKind: "execution", executionSource: "in_house", selectedInHouseComponentIds: ["first"] }).state).toBe("not_configured");
  });
  it.each(["2.49", "2.50", "2.75", "2.76"])("prices separate costs with independent thresholds and rounded amounts at quantity %s", (quantity) => {
    const result = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "in_house", quantity, selectedInHouseComponentIds: ["second", "first"], discountBps: 300 });
    const expected = [first, second].map((row) => calculateKnowledgeInHousePrice({ labor: row.labor, material: row.material, quantity, quantityScale: 2, discountBps: 300 }));
    expect(result.issues).toEqual([]);
    expect(result.preview?.sellingPaise).toBe(expected.reduce((sum, row) => sum + row.totalPaise, 0));
    expect(result.preview?.settings.scopes.map((row) => row.componentId)).toEqual(["first", "first", "second", "second"]);
    const frozen = structuredClone(result.preview!);
    const stages = buildPurchaseOrderModeCalculationStages(frozen);
    expect(stages).toHaveLength(4);
    expect(stages.reduce((sum, row) => sum + row.sellingPaise, 0)).toBe(frozen.sellingPaise);
    expect(stages.map((row) => row.componentId)).toEqual(["first", "first", "second", "second"]);
  });
  it("keeps newly added components excluded and blocks a removed approved component", () => {
    const before = analyzePurchaseOrderModeSettings({ advanced, uom, mode: "in_house", quantity: "1", selectedInHouseComponentIds: ["first"] }).preview;
    const after = analyzePurchaseOrderModeSettings({ advanced: { ...advanced, inHouseComponents: [...advanced.inHouseComponents, component("new")] }, uom, mode: "in_house", quantity: "1", selectedInHouseComponentIds: ["first"] }).preview;
    expect(after).toEqual(before);
    expect(analyzePurchaseOrderModeSettings({ advanced: { ...advanced, inHouseComponents: [second] }, uom, mode: "in_house", quantity: "1", selectedInHouseComponentIds: ["first"] }).preview).toBeNull();
  });
  it("assistant uses explicit selected components and no all-component fallback", () => {
    const source = { advanced, temporary: false, candidate: { available: true, uom,
      inHouseComponents: advanced.inHouseComponents.map(({ id, basketId, subBasketId }) => ({ id, basketId, subBasketId, basketName: "Basket", subBasketName: "Scope", available: true }))
    } } as Parameters<typeof assistantSellingAmount>[0];
    expect(() => assistantSellingAmount(source, "in_house", "2.75")).toThrow();
    expect(assistantSellingAmount(source, "in_house", "2.75", ["first"])).toBe(calculateKnowledgeInHousePrice({ labor: first.labor, material: first.material, quantity: "2.75", quantityScale: 2 }).totalPaise);
  });
});
