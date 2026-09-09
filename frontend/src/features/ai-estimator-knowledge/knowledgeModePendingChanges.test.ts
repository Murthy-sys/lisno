import { describe, expect, it } from "vitest";
import { projectKnowledgeModePendingChanges } from "./knowledgeModePendingChanges";
import { defaultPmcScopeItems } from "./knowledgePmcScope";
import { modeCalculationDraft, modeCalculationsForStorage } from "./knowledgeModeCalculation";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const calculation = { baseRatePaise: 12_000, lowQuantityLimit: "15", minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
const field = { id: "field-1", label: "Finish", type: "dropdown", options: ["Matt", "Gloss"], value: "Matt" };
const config = { id: "config-1", modeKind: "execution", executionSource: "sub_vendor", fields: [field] };
function project(before: KnowledgeJsonObject, after: KnowledgeJsonObject, extra: Partial<Parameters<typeof projectKnowledgeModePendingChanges>[0]> = {}) {
  return projectKnowledgeModePendingChanges({ advancedBaseline: before, advancedDraft: after, pricingBaseline: {}, pricingDraft: {}, mainLineName: "Gypsum ceiling", ...extra });
}

describe("Mode pending change projection", () => {
  it("omits clean payloads, hidden compatibility data, and unloaded blocks", () => {
    const saved = { modeConfigurations: [config], modeCalculation: calculation, modeDescription: "Saved paragraph." };
    expect(project(saved, saved)).toEqual([]);
    expect(project({}, { hiddenServerField: "changed" })).toEqual([]);
    expect(project({}, saved, { advancedBaseline: null })).toEqual([]);
  });

  it("normalizes default PMC lists and calculation compatibility expansion", () => {
    expect(project({ modeCalculation: calculation }, { modeCalculations: modeCalculationsForStorage({ modeCalculation: calculation }), modeConfigurations: [{ id: "new-container", modeKind: "pmc", fields: [], inclusions: defaultPmcScopeItems("inclusions").map((row) => ({ ...row })), exclusions: defaultPmcScopeItems("exclusions").map((row) => ({ ...row })) }] })).toEqual([]);
  });

  it("shows only the selected PMC default and keeps derived paragraph content out", () => {
    const after = { modeConfigurations: [{ id: "pmc-1", modeKind: "pmc", fields: [], inclusions: defaultPmcScopeItems("inclusions").map((row, index) => ({ ...row, selected: index === 0 })), exclusions: defaultPmcScopeItems("exclusions").map((row) => ({ ...row })) }] };
    expect(project({}, after)).toEqual([{ key: "pmc:inclusions", label: "PMC · Inclusions", entries: [{ key: "pmc:inclusions:id:pmc-inclusions-transport", title: "Transport", kind: "updated", fields: [{ key: "selected", label: "State", value: "Selected" }] }] }]);
    expect(project(after, after)).toEqual([]);
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
    expect(project({}, { pmcMarginBps: 0 })[0]?.entries[0]).toMatchObject({ incomplete: true, fields: [{ value: "0.00%" }] });
  });

  it("separates same-label source components and source moves by IDs", () => {
    const house = { ...config, id: "config-2", executionSource: "in_house", fields: [{ ...field, id: "field-2" }] };
    const groups = project({ modeConfigurations: [config, house] }, { modeConfigurations: [config, { ...house, fields: [{ ...house.fields[0]!, value: "Gloss" }] }] });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Execution · In-house");
    expect(groups[0]?.entries[0]?.fields).toEqual([{ key: "value", label: "Value", value: "Gloss" }]);
    expect(project({ modeConfigurations: [{ ...config, executionSource: undefined } as unknown as KnowledgeJsonObject] }, { modeConfigurations: [config] })[0]?.entries[0]?.fields[0]?.value).toBe("Execution · Sub-Vendor");
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

  it("leaves untouched numeric defaults out when the first valid rate is entered", () => {
    const groups = project({}, { modeCalculations: { pmc: calculation, sub_vendor: null, in_house_labor: null, in_house_material: null } });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries[0]?.fields).toEqual([{ key: "baseRate", label: "Base Rate (₹)", value: "120.00" }]);
  });

  it("keeps Specifications shared, includes only changed description and ignores typed legacy metadata", () => {
    const before = { specifications: [{ id: "spec-1", name: "Saved plywood", description: "Saved detail", type: "text", value: "private old compatibility" }] };
    const after = { specifications: [{ id: "spec-1", name: "Saved plywood", description: "New local detail", type: "dropdown", value: "different hidden value" }] };
    expect(project({}, {}, { pricingBaseline: before, pricingDraft: after })).toEqual([{ key: "specifications", label: "Specifications · Shared", entries: [{ key: "specification:id:spec-1", title: "Saved plywood", kind: "updated", fields: [{ key: "description", label: "Description", value: "New local detail" }] }] }]);
  });
});
