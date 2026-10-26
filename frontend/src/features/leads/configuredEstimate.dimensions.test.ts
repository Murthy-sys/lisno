import { describe, expect, it } from "vitest";
import type { EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import { buildConfiguredLines, configuredDimensionsIssue, configuredLineAmountPaise, updateConfiguredLinePricing } from "./configuredEstimate";

const rule: EstimateDimensionRule = { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "unit", decimalScale: 2 };
const catalogue = (): EstimationCatalogue => ({ ineligibleLineCount: 0, items: [{ id: "basket", name: "Painting", displayOrder: 1, subBaskets: [{
  id: "sub", basketId: "basket", name: "Walls", displayOrder: 1, mainLines: [{ id: "line", mainLineId: "line", basketId: "basket", subBasketId: "sub", name: "Paint", displayOrder: 1,
    revisionId: "revision", itemVersion: 4, revisionVersion: 2, dimensionsMandatory: true, dimensionRule: rule,
    modeBaseRatesPaise: { pmc: 1000, sub_vendor: 1000, in_house: null }, uom: { id: "unit", name: "sq ft", code: "SQFT", decimalScale: 2 } }] }] }] });
const rooms = [{ id: "living", label: "Living" }];
const selected = new Set(["basket"]);
const initial = () => ({ ...buildConfiguredLines(catalogue(), rooms, selected, [])[0]!, included: true, rateSource: "manual" as const, rateInput: "99" });

describe("configured estimate measurements", () => {
  it("requires all three inputs and derives quantity from length × width without changing a manual price", () => {
    const line = initial();
    expect(configuredDimensionsIssue(line)).toMatch(/length, width and height/);
    expect(configuredLineAmountPaise(line)).toBeNull();
    const measured = updateConfiguredLinePricing(line, { dimensions: { length: "1.005", width: "1", height: "99" } });
    expect(measured).toMatchObject({ quantity: 1.01, rateInput: "99", rateSource: "manual", dimensions: { height: "99" } });
    expect(configuredLineAmountPaise(measured)).toBe(9999);
    expect(updateConfiguredLinePricing(measured, { quantity: 500 }).quantity).toBe(1.01);
    expect(updateConfiguredLinePricing(measured, { dimensions: { ...measured.dimensions!, height: "1" } }).quantity).toBe(1.01);
  });
  it.each(["", "0", "-1", "1e2", "1.1234567"])("keeps invalid raw height %s and prevents a calculated amount", height => {
    const changed = updateConfiguredLinePricing(initial(), { dimensions: { length: "2", width: "3", height } });
    expect(changed.dimensions?.height).toBe(height);
    expect(configuredLineAmountPaise(changed)).toBeNull();
  });
  it("preserves drafts through refresh and requires explicit confirmation after the unit rule changes", () => {
    const measured = { ...updateConfiguredLinePricing(initial(), { dimensions: { length: "2", width: "3", height: "4" } }), persistedId: "saved" };
    expect(buildConfiguredLines(catalogue(), rooms, selected, [measured])[0]).toMatchObject({ dimensions: measured.dimensions, quantity: 6, dimensionsNeedReview: false });
    const changed = catalogue(); changed.items[0]!.subBaskets[0]!.mainLines[0]!.dimensionRule = { ...rule, inputUnit: "m", quantityUnit: "sq_m" };
    const refreshed = buildConfiguredLines(changed, rooms, selected, [measured])[0]!;
    expect(refreshed).toMatchObject({ dimensions: measured.dimensions, quantity: 6, dimensionsNeedReview: true });
    expect(configuredLineAmountPaise(refreshed)).toBeNull();
    expect(updateConfiguredLinePricing(refreshed, { dimensions: { ...measured.dimensions!, length: "5" } }).dimensionsNeedReview).toBe(true);
    expect(updateConfiguredLinePricing(refreshed, { dimensionsNeedReview: false })).toMatchObject({ dimensionsNeedReview: false, quantity: 6 });
    expect(buildConfiguredLines(changed, rooms, selected, [measured], true)[0]).toMatchObject({ dimensionRule: rule, quantity: 6 });
  });
  it("retains recorded measurements when disabled, while manual quantities become editable", () => {
    const measured = updateConfiguredLinePricing(initial(), { dimensions: { length: "2", width: "3", height: "4" } });
    const changed = catalogue(); Object.assign(changed.items[0]!.subBaskets[0]!.mainLines[0]!, { dimensionsMandatory: false, dimensionRule: null });
    const refreshed = buildConfiguredLines(changed, rooms, selected, [measured])[0]!;
    expect(updateConfiguredLinePricing(refreshed, { quantity: 9 })).toMatchObject({ quantity: 9, dimensions: measured.dimensions, rateInput: "99" });
  });
});
