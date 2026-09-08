import { describe, expect, it } from "vitest";
import { modeCalculationsForPayload, modeCalculationsIssues, withModeCalculation } from "./knowledgeModeCalculation";

const legacy = { baseRatePaise: 150_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };

describe("independent Mode calculation settings", () => {
  it("starts all four calculation sets from legacy values and changes only the chosen scope", () => {
    const original = { modeCalculation: legacy, dependencies: [] };
    const vendor = { ...legacy, baseRatePaise: 70_000, impactBps: 1_250 };
    const next = withModeCalculation(original, "sub_vendor", vendor);
    expect(modeCalculationsForPayload(next)).toEqual({ pmc: legacy, sub_vendor: vendor, in_house_labor: legacy, in_house_material: legacy });
    const later = withModeCalculation(next, "pmc", { ...legacy, startingMarkupBps: 4_250 });
    expect(modeCalculationsForPayload(later)).toEqual({ pmc: { ...legacy, startingMarkupBps: 4_250 }, sub_vendor: vendor, in_house_labor: legacy, in_house_material: legacy });
    expect(original).toEqual({ modeCalculation: legacy, dependencies: [] });
    expect(later.modeCalculation).toEqual(legacy);
    expect(modeCalculationsIssues(later)).toEqual([]);
  });

  it("keeps unconfigured scopes empty and never inherits newer legacy values once scoped settings exist", () => {
    const next = withModeCalculation({}, "in_house_labor", legacy);
    expect(modeCalculationsForPayload({ ...next, modeCalculation: { ...legacy, baseRatePaise: 500_000 } }))
      .toEqual({ pmc: null, sub_vendor: null, in_house_labor: legacy, in_house_material: null });
  });

  it("seeds Labor and Material once from saved In-house values while retaining the old snapshot", () => {
    const inHouse = { ...legacy, baseRatePaise: 90_000, impactBps: 525 };
    const original = { modeCalculation: legacy, modeCalculations: { pmc: legacy, sub_vendor: null, in_house: inHouse } };
    const labor = { ...inHouse, baseRatePaise: 25_000 };
    const next = withModeCalculation(original, "in_house_labor", labor);
    expect(next.modeCalculations).toEqual({ pmc: legacy, sub_vendor: null, in_house: inHouse, in_house_labor: labor, in_house_material: inHouse });
    const material = { ...inHouse, impactBps: 1_275 };
    const later = withModeCalculation(next, "in_house_material", material);
    expect(modeCalculationsForPayload(later)).toEqual({ pmc: legacy, sub_vendor: null, in_house_labor: labor, in_house_material: material });
    expect(original.modeCalculations).toEqual({ pmc: legacy, sub_vendor: null, in_house: inHouse });
    expect(modeCalculationsIssues(later)).toEqual([]);
    expect(modeCalculationsForPayload({ modeCalculations: { ...later.modeCalculations as object, in_house: legacy, in_house_material: null } }))
      .toEqual({ pmc: legacy, sub_vendor: null, in_house_labor: labor, in_house_material: null });
  });

  it("requires both split cost keys and validates their own fields even if legacy In-house is retained", () => {
    const scoped = { pmc: legacy, sub_vendor: null, in_house: legacy, in_house_labor: null, in_house_material: null };
    expect(modeCalculationsIssues({ modeCalculations: scoped })).toEqual([]);
    const { in_house_material: _material, ...partial } = scoped;
    expect(modeCalculationsIssues({ modeCalculations: partial }))
      .toContainEqual(expect.objectContaining({ path: "modeCalculations.in_house_material" }));
    expect(modeCalculationsForPayload({ modeCalculations: partial }).in_house_material).toBeNull();
    expect(modeCalculationsIssues({ modeCalculations: { ...scoped, in_house_labor: { ...legacy, impactBps: -1 }, in_house_material: { ...legacy, startingMarkupBps: 0 } } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "modeCalculations.in_house_labor.impactBps" }),
        expect.objectContaining({ path: "modeCalculations.in_house_material.startingMarkupBps" })
      ]));
  });

  it("validates each scope with its own error path and rejects ambiguous or incomplete maps", () => {
    expect(modeCalculationsIssues({ modeCalculations: { pmc: null, sub_vendor: legacy, in_house: null } })).toEqual([]);
    expect(modeCalculationsIssues({ modeCalculations: { pmc: legacy, sub_vendor: { ...legacy, impactBps: -1 }, in_house: { ...legacy, startingMarkupBps: 1_000 } } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "modeCalculations.sub_vendor.impactBps" }),
        expect.objectContaining({ path: "modeCalculations.in_house.startingMarkupBps" })
      ]));
    expect(modeCalculationsIssues({ modeCalculations: { pmc: legacy, execution: legacy } }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "modeCalculations.execution" }),
        expect.objectContaining({ path: "modeCalculations.sub_vendor" }),
        expect.objectContaining({ path: "modeCalculations.in_house" })
      ]));
    expect(modeCalculationsIssues({ modeCalculations: null })).toHaveLength(1);
  });
});
