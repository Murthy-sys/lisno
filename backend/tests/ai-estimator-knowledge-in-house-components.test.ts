import { describe, expect, it } from "vitest";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";
import { readInHouseComponents, inHouseComponentBaseRate, selectedInHouseBaseRate } from "../src/domain/ai-estimator-knowledge-in-house-components.js";
import { estimateModeBaseRatesPaise, estimateConfigurationRateMatches } from "../src/domain/estimate-mode-pricing.js";
import { buildKnowledgeConfigurationContext } from "../src/domain/ai-estimator-knowledge-configuration-context.js";
import { calculateKnowledgeInHousePrice } from "../src/domain/ai-estimator-knowledge-mode-calculation.js";
import { analyzePurchaseOrderModeSettings, buildPurchaseOrderModeCalculationStages } from "../src/domain/project-purchase-order-mode.js";
import { assistantSellingAmount } from "../src/services/project-assistant-pricing.js";
import { copyInHouseComponentConfiguration, legacyInHouseComponent, withInHouseComponents } from "../../shared/knowledge/knowledgeInHouseComponents.js";
import { modeCalculationDraft, withModeCalculation } from "../../shared/knowledge/knowledgeModeCalculation.js";
import type { KnowledgeJsonObject } from "../../shared/knowledge/knowledgeTypes.js";

const settings = (baseRatePaise: number, lowQuantityLimit = "2.75", impactBps = 1250) => ({ baseRatePaise, lowQuantityLimit, impactBps, minimumMarkupBps: 1000, startingMarkupBps: 2500 });
const component = (id: string, basketId = "basket-other", subBasketId: string | null = `sub-${id}`) => ({
  id, basketId, subBasketId, inclusions: [{ id: "incl-one", name: "Delivery", selected: true }], exclusions: [],
  labor: settings(743), material: settings(1057, "2.50", 700)
});

describe("first Add preserves the visible legacy In-house source", () => {
  const owner = { basketId: "original-basket", subBasketId: "original-sub" };
  const starterNames = ["Supplier", "Execution", "Labour"];

  it.each<KnowledgeJsonObject>([
    {},
    { modeCalculation: null },
    { modeCalculations: { pmc: null, sub_vendor: null, in_house: null } },
    { modeCalculations: { pmc: null, sub_vendor: null, in_house_labor: null, in_house_material: null } }
  ])("retains the empty editor's source and starter lists without manufacturing stored cost settings (%j)", (legacy) => {
    const original = structuredClone(legacy);
    const preserved = legacyInHouseComponent(legacy, owner);
    expect(preserved).toMatchObject({ id: "legacy-in-house", ...owner, labor: null, material: null });
    for (const list of ["inclusions", "exclusions"] as const) {
      expect(preserved![list].map(({ name }) => name)).toEqual(starterNames);
      expect(preserved![list].every(({ selected }) => selected === false)).toBe(true);
    }
    // These visible editor values are defaults, not a saved zero-price calculator.
    expect(modeCalculationDraft(null)).toEqual({ baseRate: "", lowQuantityLimit: "15", impactRate: "10", minimumRate: "25", startingRate: "35" });
    const converted = withInHouseComponents(legacy, [preserved!]);
    expect(validateKnowledgeSectionPayload("advanced", converted)).toEqual([]);
    const reloaded = readInHouseComponents(JSON.parse(JSON.stringify(converted)))!;
    expect(reloaded).toEqual([preserved]);
    expect(inHouseComponentBaseRate(reloaded[0]!)).toBeNull();
    expect(estimateModeBaseRatesPaise(converted).in_house).toBeNull();
    expect(legacy).toEqual(original);
  });

  it.each([
    { lists: {}, included: starterNames, excluded: starterNames },
    { lists: { inclusions: [], exclusions: [] }, included: [], excluded: [] },
    { lists: { inclusions: [] }, included: [], excluded: starterNames }
  ])("distinguishes omitted starter lists from explicitly empty saved lists ($lists)", ({ lists, included, excluded }) => {
    const legacy: KnowledgeJsonObject = { modeConfigurations: [{ id: "saved-scope", modeKind: "execution", executionSource: "in_house", fields: [], ...lists }] };
    const preserved = legacyInHouseComponent(legacy, owner)!;
    expect(preserved.inclusions.map(({ name }) => name)).toEqual(included);
    expect(preserved.exclusions.map(({ name }) => name)).toEqual(excluded);
    expect(preserved.labor).toBeNull();
    expect(preserved.material).toBeNull();
    expect(validateKnowledgeSectionPayload("advanced", withInHouseComponents(legacy, [preserved]))).toEqual([]);
  });

  it("preserves unequal saved costs and explicit scope choices exactly during first Add", () => {
    const labor = settings(3210, "15", 1000);
    const material = { ...settings(7890, "6", 0), minimumMarkupBps: 1700, startingMarkupBps: 3400 };
    const inclusions = [{ id: "selected-scope", name: "Own saved scope", selected: true }];
    const legacy = { pmcMarginBps: 1500, modeDescription: "Retained description",
      modeCalculations: { pmc: settings(111), sub_vendor: settings(222), in_house_labor: labor, in_house_material: material },
      modeConfigurations: [{ id: "saved-scope", modeKind: "execution", executionSource: "in_house", fields: [], inclusions, exclusions: [] }] };
    const original = structuredClone(legacy);
    const preserved = legacyInHouseComponent(legacy, owner)!;
    expect(preserved).toEqual({ id: "legacy-in-house", ...owner, inclusions, exclusions: [], labor, material });
    const converted = withInHouseComponents(legacy, [preserved, { ...component("new-target"), labor: null, material: null }]);
    expect(converted).toMatchObject(original);
    expect(validateKnowledgeSectionPayload("advanced", converted)).toEqual([]);
    expect(readInHouseComponents(converted)![0]).toEqual(preserved);
    expect(inHouseComponentBaseRate(readInHouseComponents(converted)![0]!)).toBe(11100);
    expect(legacy).toEqual(original);
  });

  it("copies a null-cost preserved source over target content without changing identity, siblings or price availability", () => {
    const preserved = legacyInHouseComponent({}, owner)!;
    const target = component("target", "target-basket", "target-sub");
    const sibling = component("sibling", "sibling-basket", "sibling-sub");
    const legacyRoots = { modeCalculation: settings(98765), modeDescription: "Retained root values" };
    const payload = withInHouseComponents(legacyRoots, [preserved, target, sibling]);
    const original = structuredClone(payload);
    const copied = copyInHouseComponentConfiguration(payload, preserved.id, target.id)!;
    expect(copied).toEqual({ ...payload, inHouseComponents: [preserved,
      { ...target, inclusions: preserved.inclusions, exclusions: preserved.exclusions, labor: null, material: null }, sibling] });
    expect(validateKnowledgeSectionPayload("advanced", copied)).toEqual([]);
    const rows = readInHouseComponents(copied)!;
    expect(inHouseComponentBaseRate(rows[1]!)).toBeNull();
    expect(selectedInHouseBaseRate(rows.map((row) => ({ id: row.id, baseRatePaise: inHouseComponentBaseRate(row) })), [target.id])).toBeNull();
    const context = buildKnowledgeConfigurationContext({ advanced: copied, uom: { id: "uom", name: "Square foot", decimalScale: 2 },
      modeKind: "execution", executionSource: "in_house", selectedInHouseComponentIds: [target.id], quantity: "1" });
    expect(context.state).toBe("not_configured");
    expect(context.calculations.every(({ settings: value }) => value === null)).toBe(true);
    expect(payload).toEqual(original);
  });
});

describe("preserved In-house configuration replacement", () => {
  const sourceId = "legacy-in-house";
  const source = { ...component(sourceId, "original-basket", "original-sub"),
    exclusions: [{ id: "old-excluded", name: "Painting", selected: false }] };
  const target = { ...component("destination", "destination-basket", "destination-sub"),
    inclusions: [{ id: "target-only", name: "Discard this old target scope", selected: true }],
    labor: settings(9000), material: settings(8000) };

  it("replaces only destination content while retaining source, identities, siblings and all root fields", () => {
    const payload = { ...advanced, modeDescription: "Retain the existing description", inHouseComponents: [source, target, second] };
    const original = structuredClone(payload);
    const result = copyInHouseComponentConfiguration(payload, sourceId, target.id)!;
    expect(result).toEqual({ ...payload, inHouseComponents: [source, { ...source,
      id: target.id, basketId: target.basketId, subBasketId: target.subBasketId }, second] });
    expect(payload).toEqual(original);
    const copied = readInHouseComponents(result)![1]!;
    expect(copied.inclusions).not.toBe(source.inclusions);
    expect(copied.inclusions[0]).not.toBe(source.inclusions[0]);
    expect(copied.exclusions).not.toBe(source.exclusions);
    expect(copied.exclusions[0]).not.toBe(source.exclusions[0]);
    expect(copied.labor).not.toBe(source.labor);
    expect(copied.material).not.toBe(source.material);
    copied.inclusions[0]!.name = "Changed in destination only";
    copied.labor!.baseRatePaise = 1;
    expect(source.inclusions[0]!.name).toBe("Delivery");
    expect(readInHouseComponents(result)![0]!.inclusions[0]!.name).toBe("Delivery");
    expect(readInHouseComponents(result)![0]!.labor!.baseRatePaise).toBe(743);
    expect(payload).toEqual(original);
  });

  it("preserves explicit zero values, missing impact and absent Material without manufacturing defaults", () => {
    const zero = { baseRatePaise: 0, lowQuantityLimit: "0", minimumMarkupBps: 0, startingMarkupBps: 0 };
    const retained = { ...source, labor: zero, material: null };
    const payload = { ...advanced, inHouseComponents: [retained, target] };
    const result = copyInHouseComponentConfiguration(payload, sourceId, target.id)!;
    const copied = readInHouseComponents(result)![1]!;
    expect(copied.labor).toEqual(zero);
    expect(Object.hasOwn(copied.labor!, "impactBps")).toBe(false);
    expect(copied.material).toBeNull();
    expect(inHouseComponentBaseRate(copied)).toBeNull();
    expect(validateKnowledgeSectionPayload("advanced", result)).toEqual([]);
  });

  it.each(["global", "scoped"] as const)("keeps a single %s legacy cost single after PMC edits, replacement and reload", (kind) => {
    const originalCost = settings(4321);
    const legacy: KnowledgeJsonObject = kind === "global" ? { modeCalculation: originalCost }
      : { modeCalculations: { pmc: settings(123), sub_vendor: settings(456), in_house: originalCost } };
    const preserved = legacyInHouseComponent(legacy, { basketId: source.basketId, subBasketId: source.subBasketId })!;
    expect(preserved.material).toBeNull();
    const converted = withInHouseComponents(legacy, [preserved, target]);
    const edited = withModeCalculation(converted, "pmc", settings(777));
    const reloaded = JSON.parse(JSON.stringify(edited)) as KnowledgeJsonObject;
    const result = copyInHouseComponentConfiguration(reloaded, sourceId, target.id)!;
    const rows = readInHouseComponents(JSON.parse(JSON.stringify(result)))!;
    expect(rows[0]!.labor).toEqual(originalCost);
    expect(rows[0]!.material).toBeNull();
    expect(rows[1]!.labor).toEqual(originalCost);
    expect(rows[1]!.material).toBeNull();
    expect(rows[1]!.id).toBe(target.id);
    expect(inHouseComponentBaseRate(rows[1]!)).toBeNull();
    expect(estimateModeBaseRatesPaise(result).pmc).toBe(777);
  });

  it.each([undefined, [], null, "invalid"])("never reconstructs a source from retained legacy fields when explicit storage is %j", (stored) => {
    const payload: KnowledgeJsonObject = { modeCalculations: { in_house: settings(5000) },
      ...(stored === undefined ? {} : { inHouseComponents: stored }) };
    expect(copyInHouseComponentConfiguration(payload, sourceId, target.id)).toBeNull();
    expect(payload.inHouseComponents).toEqual(stored);
  });

  it.each([
    ["missing", "destination"], ["legacy-in-house", "missing"], ["legacy-in-house", "legacy-in-house"],
    ["", "destination"], ["legacy-in-house", " destination "]
  ])("rejects missing, invalid or self identities (%s to %s)", (from, to) => {
    const payload = { inHouseComponents: [source, target] };
    expect(copyInHouseComponentConfiguration(payload, from, to)).toBeNull();
    expect(payload.inHouseComponents).toEqual([source, target]);
  });

  it.each([
    [source, source, target],
    [{ ...source, labor: { ...source.labor, startingMarkupBps: 10000 } }, target],
    [source, { ...target, unrecognizedContent: "must not be discarded" }],
    [source, { ...target, basketId: "" }]
  ])("rejects malformed storage instead of silently normalizing or dropping it", (inHouseComponents) => {
    const payload = { inHouseComponents } as KnowledgeJsonObject;
    const original = structuredClone(payload);
    expect(copyInHouseComponentConfiguration(payload, sourceId, target.id)).toBeNull();
    expect(payload).toEqual(original);
  });
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
