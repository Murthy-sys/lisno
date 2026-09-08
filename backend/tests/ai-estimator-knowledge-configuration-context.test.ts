import { describe, expect, it } from "vitest";

import { buildKnowledgeConfigurationContext as build } from "../src/domain/ai-estimator-knowledge-configuration-context.js";

const uom = { id: "unit-nos", name: "Number", decimalScale: 0 };
const settings = { baseRatePaise: 150_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const map = {
  pmc: settings,
  sub_vendor: { ...settings, baseRatePaise: 85_000, impactBps: 750 },
  in_house_labor: { ...settings, baseRatePaise: 42_000, impactBps: 0 },
  in_house_material: { ...settings, baseRatePaise: 63_000, minimumMarkupBps: 1_000, startingMarkupBps: 2_200 }
};

describe("selected configuration context", () => {
  it.each([
    ["pmc", undefined, ["pmc"], [150_000]],
    ["execution", "sub_vendor", ["sub_vendor"], [85_000]],
    ["execution", "in_house", ["in_house_labor", "in_house_material"], [42_000, 63_000]]
  ] as const)("keeps %s/%s costs isolated", (modeKind, executionSource, scopes, rates) => {
    const context = build({ advanced: { modeCalculations: map, modeCalculation: { ...settings, baseRatePaise: 999 } }, uom, modeKind, executionSource });
    expect(context.state).toBe("ready");
    expect(context.issues).toEqual([]);
    expect(context.calculations.map((row) => row.scope)).toEqual(scopes);
    expect(context.calculations.map((row) => row.settings?.baseRatePaise)).toEqual(rates);
    expect(context.calculations.every((row) => row.source === "scoped")).toBe(true);
    expect(context).toMatchObject({ formulaVersion: "mode-markup-v1", moneyUnit: "paise", percentageUnit: "basis_points", uom });
  });

  it("requires an explicit Mode and Execution source without exposing every cost", () => {
    for (const modeKind of [undefined, "execution"] as const) {
      const context = build({ advanced: { modeCalculations: map }, uom, modeKind });
      expect(context.state).toBe("selection_required");
      expect(context.calculations).toEqual([]);
      expect(context.issues).toEqual([{ code: modeKind ? "EXECUTION_SOURCE_REQUIRED" : "CANONICAL_MODE_REQUIRED", scope: null }]);
    }
  });

  it("never inherits legacy or another cost when a split value is null or absent", () => {
    for (const split of [{ in_house_labor: null, in_house_material: null }, { in_house_labor: map.in_house_labor }]) {
      const context = build({ advanced: { modeCalculation: settings, modeCalculations: { pmc: settings, sub_vendor: settings, in_house: settings, ...split } },
        uom, modeKind: "execution", executionSource: "in_house" });
      expect(context.state).toBe("not_configured");
      expect(context.calculations[1]).toMatchObject({ scope: "in_house_material", source: "scoped", settings: null, maximumDiscountBps: null });
      expect(context.issues).toContainEqual({ scope: "in_house_material", code: "CALCULATION_NOT_CONFIGURED" });
    }
    const vendor = build({ advanced: { modeCalculation: settings, modeCalculations: { ...map, sub_vendor: null } }, uom, modeKind: "execution", executionSource: "sub_vendor" });
    expect(vendor.calculations[0]?.settings).toBeNull();
  });

  it("labels legacy compatibility and supplies the same default Impact as the UI", () => {
    const { impactBps: _impact, ...legacy } = settings;
    const shared = build({ advanced: { modeCalculation: legacy }, uom, modeKind: "pmc" });
    expect(shared.calculations).toEqual([{ scope: "pmc", source: "legacy_shared", settings, maximumDiscountBps: 1_000 }]);
    const inHouse = build({ advanced: { modeCalculations: { pmc: settings, sub_vendor: null, in_house: legacy } }, uom, modeKind: "execution", executionSource: "in_house" });
    expect(inHouse.calculations.map((row) => row.source)).toEqual(["legacy_in_house", "legacy_in_house"]);
    expect(inHouse.calculations.map((row) => row.settings)).toEqual([settings, settings]);
  });

  it("retains explicit zeroes and derives each cost's own markup difference", () => {
    const context = build({ advanced: { modeCalculations: { ...map, in_house_labor: { ...map.in_house_labor, baseRatePaise: 0, minimumMarkupBps: 0, startingMarkupBps: 0 } } }, uom, modeKind: "execution", executionSource: "in_house" });
    expect(context.calculations[0]).toMatchObject({ settings: { baseRatePaise: 0, impactBps: 0 }, maximumDiscountBps: 0 });
    expect(context.calculations[1]?.maximumDiscountBps).toBe(1_200);
  });

  it("does not mutate saved settings or leak response mutations into other scopes", () => {
    const payload = structuredClone({ modeCalculations: map });
    const before = structuredClone(payload);
    const context = build({ advanced: payload, uom, modeKind: "pmc" });
    context.calculations[0]!.settings!.baseRatePaise = 1;
    expect(payload).toEqual(before);
    expect(build({ advanced: payload, uom, modeKind: "pmc" }).calculations[0]?.settings?.baseRatePaise).toBe(150_000);
  });

  it("projects only checked entries by stable ID, independently of paragraph text and list labels", () => {
    const advanced = {
      modeDescription: "Custom wording with no list labels.", modeCalculations: map,
      modeConfigurations: [{ id: "shared-scope", modeKind: "pmc", fields: [{ value: "private-answer" }],
        inclusions: [{ id: "in-transport", name: "Transport", selected: true }, { id: "in-hidden", name: "Unchecked private label", selected: false }],
        exclusions: [{ id: "out-transport", name: "Transport", selected: true }] }],
      internalVendorNotes: "private-notes"
    };
    const context = build({ advanced, uom, modeKind: "execution", executionSource: "sub_vendor" });
    expect(context.shared).toEqual({ paragraph: advanced.modeDescription, scopeConfigurationId: "shared-scope", inclusions: [{ id: "in-transport", name: "Transport" }], exclusions: [{ id: "out-transport", name: "Transport" }] });
    expect(JSON.stringify(context)).not.toMatch(/private-answer|private-notes|Unchecked private label/);
    const inHouse = build({ advanced, uom, modeKind: "execution", executionSource: "in_house" });
    expect(inHouse.shared).toEqual(context.shared);
  });

  it("does not choose one of multiple shared scopes", () => {
    const context = build({ advanced: { modeCalculations: map, modeConfigurations: [{ id: "a", modeKind: "pmc" }, { id: "b", modeKind: "pmc" }] }, uom, modeKind: "pmc" });
    expect(context.state).toBe("invalid");
    expect(context.shared.scopeConfigurationId).toBeNull();
    expect(context.issues).toContainEqual({ code: "AMBIGUOUS_SHARED_SCOPE", scope: null });
  });

  it("blocks invalid selected settings without allowing an unrelated invalid scope to affect PMC", () => {
    const advanced = { modeCalculations: { ...map, sub_vendor: { ...settings, minimumMarkupBps: 9_000 } } };
    expect(build({ advanced, uom, modeKind: "pmc" }).state).toBe("ready");
    const vendor = build({ advanced, uom, modeKind: "execution", executionSource: "sub_vendor" });
    expect(vendor.state).toBe("invalid");
    expect(vendor.calculations[0]?.settings).toBeNull();
    expect(vendor.issues).toContainEqual({ code: "INVALID_CALCULATION_SETTINGS", scope: "sub_vendor" });
    expect(build({ advanced: { modeCalculations: null }, uom, modeKind: "pmc" }).state).toBe("invalid");
  });

  it("reports missing UOM and incompatible low-quantity or requested quantity precision", () => {
    expect(build({ advanced: { modeCalculations: map }, uom: null, modeKind: "pmc" })).toMatchObject({ state: "not_configured", issues: [{ code: "UOM_REQUIRED", scope: null }] });
    const advanced = { modeCalculations: { ...map, pmc: { ...settings, lowQuantityLimit: "1.5" } } };
    expect(build({ advanced, uom, modeKind: "pmc" })).toMatchObject({ state: "invalid", issues: [{ code: "INVALID_LOW_QUANTITY_PRECISION", scope: "pmc" }] });
    expect(build({ advanced, uom: { ...uom, decimalScale: 2 }, modeKind: "pmc", quantity: "0.25" }).state).toBe("ready");
    expect(build({ advanced: { modeCalculations: map }, uom, modeKind: "pmc", quantity: "0.25" })).toMatchObject({ state: "invalid", issues: [{ code: "INVALID_QUANTITY_PRECISION", scope: null }] });
  });
});
