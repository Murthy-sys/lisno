import { describe, expect, it } from "vitest";
import { projectKnowledgeModePendingChanges } from "./knowledgeModePendingChanges";
import { withSubVendorMargin } from "./knowledgePmcMargin";
import { modeCalculationDraft, modeCalculationsForStorage } from "./knowledgeModeCalculation";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const calculation = { baseRatePaise: 12_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const field = { id: "field-1", label: "Finish", type: "dropdown", options: ["Matt", "Gloss"], value: "Matt" };
const config = { id: "config-1", modeKind: "execution", executionSource: "sub_vendor", fields: [field] };
function project(before: KnowledgeJsonObject, after: KnowledgeJsonObject, extra: Partial<Parameters<typeof projectKnowledgeModePendingChanges>[0]> = {}) {
  return projectKnowledgeModePendingChanges({ advancedBaseline: before, advancedDraft: after, pricingBaseline: {}, pricingDraft: {}, mainLineName: "Gypsum ceiling", ...extra });
}

function visiblePendingContent(groups: ReturnType<typeof projectKnowledgeModePendingChanges>) {
  return groups.map(({ label, entries }) => ({
    label,
    entries: entries.map(({ title, kind, fields, incomplete }) => ({
      title,
      kind,
      fields,
      ...(incomplete ? { incomplete } : {})
    }))
  }));
}

describe("Mode pending change projection", () => {
  it("omits clean payloads, hidden compatibility data, and unloaded blocks", () => {
    const saved = { modeConfigurations: [config], modeCalculation: calculation, modeDescription: "Saved paragraph." };
    expect(project(saved, saved)).toEqual([]);
    expect(project({}, { hiddenServerField: "changed" })).toEqual([]);
    expect(project({}, saved, { advancedBaseline: null })).toEqual([]);
  });

  it("normalizes missing and empty PMC lists and calculation compatibility expansion", () => {
    expect(project({ modeCalculation: calculation }, { modeCalculations: modeCalculationsForStorage({ modeCalculation: calculation }), modeConfigurations: [{ id: "new-container", modeKind: "pmc", fields: [], inclusions: [], exclusions: [] }] })).toEqual([]);
  });

  it("shows only changes to saved PMC entries and keeps derived paragraph content out", () => {
    const after = { modeConfigurations: [{ id: "pmc-1", modeKind: "pmc", fields: [], inclusions: [{ id: "saved-transport", name: "Transport", selected: true }], exclusions: [] }] };
    expect(project({ modeConfigurations: [{ id: "pmc-1", modeKind: "pmc", fields: [], inclusions: [{ id: "saved-transport", name: "Transport", selected: false }] }] }, after)).toEqual([{ key: "pmc:inclusions", label: "PMC · Inclusions", entries: [{ key: "pmc:inclusions:id:saved-transport", title: "Transport", kind: "updated", fields: [{ key: "selected", label: "State", value: "Selected" }] }] }]);
    expect(project(after, after)).toEqual([]);
  });

  it("reports real backend item additions and final removals without phantom defaults", () => {
    const saved = { modeConfigurations: [{ id: "scope", modeKind: "pmc", fields: [], inclusions: [{ id: "permit", name: "Permit coordination", selected: false }], exclusions: [] }] };
    expect(project({}, saved)).toEqual([{ key: "pmc:inclusions", label: "PMC · Inclusions", entries: [expect.objectContaining({ title: "Permit coordination", kind: "added" })] }]);
    const empty = { modeConfigurations: [{ id: "scope", modeKind: "pmc", fields: [], inclusions: [], exclusions: [] }] };
    expect(project(saved, empty)).toEqual([{ key: "pmc:inclusions", label: "PMC · Inclusions", entries: [{ key: "pmc:inclusions:id:permit", title: "Permit coordination", kind: "removed", fields: [] }] }]);
    expect(project(empty, {})).toEqual([]);
  });

  it("shows current execution fields only, preserving zero and false", () => {
    const groups = project({ modeConfigurations: [config] }, { modeConfigurations: [{ ...config, fields: [{ ...field, type: "checkbox", options: [], value: false }] }] });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Execution · Sub-Vendor");
    expect(groups[0]?.entries[0]?.fields).toEqual([
      { key: "type", label: "Type", value: "Checkbox" },
      { key: "options", label: "Options", value: "", cleared: true },
      { key: "value", label: "Value", value: "No" }
    ]);
    expect(project({}, { pmcMarginBps: 0 })[0]?.entries[0]).toMatchObject({
      incomplete: true,
      fields: [
        { key: "minimum", label: "Min. PMC Margin", value: "0.00%" },
        { key: "maximum", label: "Max. PMC Margin", value: "0.00%" }
      ]
    });
  });

  it("separates same-label source components and source moves by IDs", () => {
    const house = { ...config, id: "config-2", executionSource: "in_house", fields: [{ ...field, id: "field-2" }] };
    const groups = project({ modeConfigurations: [config, house] }, { modeConfigurations: [config, { ...house, fields: [{ ...house.fields[0]!, value: "Gloss" }] }] });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Execution · In-house");
    expect(groups[0]?.entries[0]?.fields).toEqual([{ key: "value", label: "Value", value: "Gloss" }]);
    expect(project({ modeConfigurations: [{ ...config, executionSource: undefined } as unknown as KnowledgeJsonObject] }, { modeConfigurations: [config] })[0]?.entries[0]?.fields[0]?.value).toBe("Execution · Sub-Vendor");
  });

  it("compares effective Lisno ranges and lists only the changed margin", () => {
    const before = { pmcMarginBps: 1_250, subVendorMarginBps: 1_500 };
    const after = withSubVendorMargin(before, "maximum", 2_000);
    expect(project(before, { ...before, subVendorMinimumMarginBps: 1_500 })).toEqual([]);
    expect(project(before, after)).toEqual([{ key: "sub_vendor:margin", label: "Execution · Sub-Vendor", entries: [{
      key: "sub_vendor:margin", title: "Lisno Margin", kind: "updated",
      fields: [{ key: "maximum", label: "Max. Lisno Margin", value: "20.00%" }]
    }] }]);
    expect(project(after, after)).toEqual([]);
    expect(project(before, before)).toEqual([]);
    const changedBoth = withSubVendorMargin(after, "minimum", 2_000);
    expect(project(before, changedBoth)[0]?.entries[0]?.fields).toEqual([
      { key: "minimum", label: "Min. Lisno Margin", value: "20.00%" },
      { key: "maximum", label: "Max. Lisno Margin", value: "20.00%" }
    ]);
  });

  it("shows cleared and invalid Lisno values without concealing incomplete pairs", () => {
    const before = { subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000 };
    expect(project(before, { ...before, subVendorMinimumMarginBps: null })[0]?.entries[0]).toMatchObject({
      incomplete: true, fields: [{ key: "minimum", label: "Min. Lisno Margin", value: "", cleared: true }]
    });
    const cleared = project(before, { subVendorMinimumMarginBps: null, subVendorMarginBps: null })[0]?.entries[0];
    expect(cleared?.fields).toHaveLength(2);
    expect(cleared?.incomplete).toBeUndefined();
    expect(project(before, { ...before, subVendorMarginBps: 999 })[0]?.entries[0]).toMatchObject({ incomplete: true, fields: [{ value: "9.99%" }] });
    expect(project(before, { ...before, subVendorMarginBps: "12.345" })[0]?.entries[0]).toMatchObject({ incomplete: true, fields: [{ value: "12.345" }] });
    expect(project(before, { ...before, subVendorMinimumMarginBps: 1_900 })[0]?.entries[0]).toMatchObject({ incomplete: true, fields: [{ value: "19.00%" }] });
  });

  it.each([1_000, 1_750])("keeps legacy Lisno value %i visible in pending edits without normalizing its baseline", (legacyMargin) => {
    const legacy = { subVendorMarginBps: legacyMargin };
    expect(project(legacy, legacy)).toEqual([]);
    expect(project(legacy, { ...legacy, subVendorMinimumMarginBps: legacyMargin })).toEqual([]);
    const partiallyRepaired = withSubVendorMargin(legacy, "maximum", 2_000);
    const partialEntry = project(legacy, partiallyRepaired)[0]?.entries[0];
    expect(partialEntry?.fields).toEqual([
      { key: "maximum", label: "Max. Lisno Margin", value: "20.00%" }
    ]);
    expect(partialEntry?.incomplete).toBe(legacyMargin === 1_750 ? true : undefined);
    const repaired = withSubVendorMargin(partiallyRepaired, "minimum", 1_500);
    expect(project(legacy, repaired)[0]?.entries[0]?.incomplete).toBeUndefined();
    expect(project(legacy, repaired)[0]?.entries[0]?.fields).toEqual([
      { key: "minimum", label: "Min. Lisno Margin", value: "15.00%" },
      { key: "maximum", label: "Max. Lisno Margin", value: "20.00%" }
    ]);
    expect(project(repaired, { ...repaired, subVendorMarginBps: legacyMargin })[0]?.entries[0]).toMatchObject({
      incomplete: true, fields: [{ key: "maximum", value: `${(legacyMargin / 100).toFixed(2)}%` }]
    });
  });

  it("shows blank user-added components as incomplete and removes add-then-delete", () => {
    expect(project({}, { modeConfigurations: [{ ...config, fields: [{ id: "new", type: "text", label: "", options: [], value: null }] }] })[0]?.entries[0]).toMatchObject({ kind: "added", title: "Component", incomplete: true });
    expect(project({}, { modeConfigurations: [{ ...config, fields: [] }] })).toEqual([]);
  });

  it("shows removal identity without saved fields and reports retained row order", () => {
    const other = { ...field, id: "field-2", label: "Second saved finish" };
    expect(project({ modeConfigurations: [{ ...config, fields: [field, other] }] }, { modeConfigurations: [{ ...config, fields: [other] }] })[0]?.entries).toEqual([{ key: "configuration:id:config-1:id:field-1", title: "Finish", kind: "removed", fields: [] }]);
    expect(project({ modeConfigurations: [{ ...config, fields: [field, other] }] }, { modeConfigurations: [{ ...config, fields: [other, field] }] })[0]?.entries[0]?.kind).toBe("reordered");
  });

  it("projects the pending paragraph rather than saved text and cancels back to enclosing edits", () => {
    const before = { modeDescription: "Saved wording." };
    const after = { modeDescription: "Applied wording." };
    expect(project(before, after, { pendingDescription: "Live wording." })[0]?.entries[0]?.fields[0]?.value).toBe("Live wording.");
    expect(project(before, after, { pendingDescription: null })[0]?.entries[0]?.fields[0]?.value).toBe("Applied wording.");
    expect(project(before, before, { pendingDescription: null })).toEqual([]);
  });

  it("overrides the last parsed number with incomplete raw input only for its source", () => {
    const before = { modeCalculations: { pmc: calculation, sub_vendor: calculation, in_house_labor: calculation, in_house_material: calculation } };
    const groups = project(before, before, { pendingCalculations: { in_house_material: { draft: { ...modeCalculationDraft(calculation), baseRate: "12." }, invalidFields: ["baseRate"] } } });
    expect(groups).toEqual([{ key: "calculation:in_house_material", label: "Execution · In-house · Material cost", entries: [{ key: "calculation:in_house_material", title: "Calculation inputs", kind: "updated", incomplete: true, fields: [{ key: "baseRate", label: "Base Rate (₹)", value: "12." }] }] }]);
  });

  it("labels legacy In-house rate fields as Gross Margins in pending changes", () => {
    const before = { modeCalculations: { pmc: calculation, sub_vendor: calculation, in_house_labor: calculation, in_house_material: calculation } };
    const draft = { ...modeCalculationDraft(calculation), minimumRate: "25.31", startingRate: "35.25" };
    const group = project(before, before, { pendingCalculations: { in_house_labor: { draft, invalidFields: [] } } })[0];
    expect(group?.entries[0]?.fields).toEqual([
      { key: "minimumRate", label: "Min. Gross Margin (%)", value: "25.31" },
      { key: "startingRate", label: "Starting Gross Margin (%)", value: "35.25" }
    ]);
  });

  it("leaves untouched numeric defaults out when the first valid rate is entered", () => {
    const groups = project({}, { modeCalculations: { pmc: calculation, sub_vendor: null, in_house_labor: null, in_house_material: null } });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries[0]?.fields).toEqual([{ key: "baseRate", label: "Base Rate (₹)", value: "120.00" }]);
  });

  it("keeps Specifications shared, uses Item labels, and ignores typed legacy metadata", () => {
    const before = { specifications: [{ id: "spec-1", name: "Saved plywood", description: "Saved detail", type: "text", value: "private old compatibility" }] };
    const after = { specifications: [{ id: "spec-1", name: "Saved plywood", description: "New local detail", type: "dropdown", value: "different hidden value" }] };
    expect(project({}, {}, { pricingBaseline: before, pricingDraft: after })).toEqual([{ key: "specifications", label: "Specifications · Shared", entries: [{ key: "specification:id:spec-1", title: "Saved plywood", kind: "updated", fields: [{ key: "description", label: "Brief description", value: "New local detail" }] }] }]);
  });

  it("shows Brand-only additions, renames, and removals without exposing stable IDs", () => {
    const saved = { brands: [{ id: "private-brand-alpha", name: "Century Green", description: "Saved description" }] };
    const renamed = project({}, {}, {
      pricingBaseline: saved,
      pricingDraft: { brands: [{ id: "private-brand-alpha", name: "Century Prime", description: "Updated description" }] }
    });
    expect(renamed).toEqual([{
      key: "brands",
      label: "Brands · Shared",
      entries: [{
        key: "brand:id:private-brand-alpha",
        title: "Century Prime",
        kind: "updated",
        fields: [
          { key: "name", label: "Brand name", value: "Century Prime" },
          { key: "description", label: "Description", value: "Updated description" }
        ]
      }]
    }]);

    const added = project({}, {}, {
      pricingBaseline: { brands: [] },
      pricingDraft: { brands: [{ id: "private-brand-beta", name: "Hettich" }] }
    });
    expect(added[0]?.entries[0]).toMatchObject({
      title: "Hettich",
      kind: "added",
      fields: [{ key: "name", label: "Brand name", value: "Hettich" }]
    });

    const removed = project({}, {}, {
      pricingBaseline: saved,
      pricingDraft: { brands: [] }
    });
    expect(removed[0]?.entries[0]).toEqual({
      key: "brand:id:private-brand-alpha",
      title: "Century Green",
      kind: "removed",
      fields: []
    });
    expect(JSON.stringify({
      renamed: visiblePendingContent(renamed),
      added: visiblePendingContent(added),
      removed: visiblePendingContent(removed)
    })).not.toContain("private-brand");
  });

  it("resolves changed Brand associations by current stable-ID labels without disclosing IDs", () => {
    const groups = project({}, {}, {
      pricingBaseline: {
        brands: [{ id: "brand-old", name: "Old Brand" }],
        specifications: [{ id: "spec-1", name: "Plywood", brandId: "brand-old" }]
      },
      pricingDraft: {
        brands: [{ id: "brand-current", name: "Century Green" }],
        specifications: [{ id: "spec-1", name: "Plywood", brandId: "brand-current" }]
      }
    });

    expect(groups.find(({ key }) => key === "specifications")).toEqual({
      key: "specifications",
      label: "Specifications · Shared",
      entries: [{
        key: "specification:id:spec-1",
        title: "Plywood",
        kind: "updated",
        fields: [{ key: "brandId", label: "Brand name", value: "Century Green" }]
      }]
    });
    expect(JSON.stringify(visiblePendingContent(groups))).not.toContain("brand-current");
    expect(JSON.stringify(visiblePendingContent(groups))).not.toContain("brand-old");
  });

  it("shows cleared and unavailable Brand associations without raw IDs", () => {
    const cleared = project({}, {}, {
      pricingBaseline: {
        brands: [{ id: "brand-old", name: "Old Brand" }],
        specifications: [{ id: "spec-1", name: "Plywood", brandId: "brand-old" }]
      },
      pricingDraft: {
        brands: [],
        specifications: [{ id: "spec-1", name: "Plywood" }]
      }
    });
    expect(cleared.find(({ key }) => key === "specifications")?.entries[0]?.fields).toEqual([
      { key: "brandId", label: "Brand name", value: "Not configured" }
    ]);

    const unavailable = project({}, {}, {
      pricingBaseline: { specifications: [] },
      pricingDraft: {
        brands: [],
        specifications: [{ id: "spec-1", name: "Plywood", brandId: "private-missing-brand-id" }]
      }
    });
    expect(unavailable[0]?.entries[0]?.fields).toEqual([
      { key: "name", label: "Item name", value: "Plywood" },
      { key: "brandId", label: "Brand name", value: "Unavailable brand" }
    ]);
    expect(JSON.stringify(unavailable)).not.toContain("private-missing-brand-id");
  });
});
