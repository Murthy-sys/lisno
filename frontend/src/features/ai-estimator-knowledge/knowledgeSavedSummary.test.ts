import { describe, expect, it } from "vitest";

import { projectKnowledgeSavedSummary } from "./knowledgeSavedSummary";
import type { SavedSummaryContent, SavedSummaryProjectionInput } from "./knowledgeSavedSummaryTypes";
import type { KnowledgeBasket, KnowledgeBasketQuality, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeMaster, KnowledgeMasterType, KnowledgeSubBasket } from "./knowledgeTypes";

const metadata = { version: 1, createdById: "actor-private", updatedById: "actor-private", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
function master(id: string, masterType: KnowledgeMasterType, name: string, description: string | null = null): KnowledgeMaster {
  return { ...metadata, id, masterType, name, description, code: id, displayOrder: 0, status: "active" };
}
const basket: KnowledgeBasket = { ...metadata, id: "basket-private", name: "Finishes", description: null, displayOrder: 0, status: "active" };
const subBasket: KnowledgeSubBasket = { ...metadata, id: "sub-private", basketId: basket.id, name: "Wall work", displayOrder: 0 };
const item: KnowledgeItemListItem = {
  ...metadata, id: "item-private", mainLineId: "line-private", mainLineName: "Acoustic panels", basketId: basket.id, basketName: basket.name,
  subBasketId: subBasket.id, subBasketName: subBasket.name, description: null, status: "active", activeRevisionId: "revision-private", draftRevisionId: null,
  revisionNumber: 1, uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [],
  completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, allowedActions: []
};
function quality(parameters: readonly KnowledgeJsonObject[]): KnowledgeBasketQuality {
  return { basketId: basket.id, basketName: basket.name, basketStatus: "active", version: 8, revisionId: "quality-private", revisionNumber: 3, contentDigest: null, updatedAt: null, parameters };
}
function input(overrides: Partial<SavedSummaryProjectionInput> = {}): SavedSummaryProjectionInput {
  return {
    sections: {},
    masters: {
      uoms: [master("uom-private", "uoms", "Square metre")],
      surfaces: [master("surface-private", "surfaces", "Ceiling", "Paint and gypsum"), master("surface-other", "surfaces", "Floor", "Tiles")],
      priorities: [master("priority-private", "priorities", "Essential")],
      modes: [master("mode-private", "modes", "Old PMC")]
    },
    baskets: [basket], subBaskets: [subBasket], items: [item], ...overrides
  };
}
function values(group: SavedSummaryContent): string {
  return group.details.map(row => `${row.label}: ${row.value}`).join("\n");
}
function settings(baseRatePaise: number, impactBps: number, minimumMarkupBps: number, startingMarkupBps: number): KnowledgeJsonObject {
  return { baseRatePaise, lowQuantityLimit: "0", impactBps, minimumMarkupBps, startingMarkupBps };
}

describe("projectKnowledgeSavedSummary", () => {
  it("does not invent values for missing sources or successful empty sources", () => {
    for (const result of [projectKnowledgeSavedSummary(input()), projectKnowledgeSavedSummary(input({
      sections: { overview: {}, advanced: {}, pricing: {}, recommendations: {} }, quality: quality([])
    }))]) {
      for (const group of Object.values(result)) expect(group).toEqual({ details: [], preview: [] });
    }
  });

  it("resolves Overview by stable ID with complete selected names and examples", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { overview: { uomId: "uom-private", surfaceIds: ["surface-private", "surface-missing"] } } })).overview;
    expect(result.preview).toEqual([
      { key: "uom", label: "UOM", value: "Square metre" },
      { key: "surfaces", label: "Surfaces", value: "Ceiling, Name unavailable" }
    ]);
    expect(values(result)).toContain("Ceiling · Examples: Paint and gypsum");
    expect(values(result)).not.toContain("Floor");
    expect(values(result)).not.toContain("private");
    expect(values(result)).not.toContain("surface-missing");
  });

  it("keeps every Surface detail behind a concise preview", () => {
    const surfaces = Array.from({ length: 8 }, (_, index) => master(`s-${index}`, "surfaces", `Surface ${index}`, `Example ${index}`));
    const result = projectKnowledgeSavedSummary(input({ sections: { overview: { surfaceIds: surfaces.map(surface => surface.id) } }, masters: { surfaces } })).overview;
    expect(result.preview[0]?.value).toBe("Surface 0, Surface 1, Surface 2 +5 more");
    surfaces.forEach(surface => expect(values(result)).toContain(`${surface.name} · Examples: ${surface.description}`));
  });

  it("projects every current Mode setting with exact persisted money/BPS, zero and checkbox false", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: {
      advanced: {
        modeDescription: "Saved shared description.",
        modeConfigurations: [
          { id: "pmc-private", modeKind: "pmc", fields: [
            { id: "field-private", type: "checkbox", label: "Insurance", options: [], value: false },
            { id: "number-private", type: "number", label: "Crew", options: [], value: "0" },
            { id: "choice-private", type: "dropdown", label: "Finish", options: ["Matt", "Gloss"], value: "Matt" }
          ], inclusions: [{ id: "selected-private", name: "Transport", selected: true }, { id: "unchecked-private", name: "Unchecked catalog entry", selected: false }], exclusions: [{ id: "excluded-private", name: "Unloading", selected: true }] },
          { id: "sub-vendor-private", modeKind: "execution", executionSource: "sub_vendor", fields: [] },
          { id: "in-house-private", modeKind: "execution", executionSource: "in_house", fields: [] }
        ],
        modeCalculations: {
          pmc: settings(12_345, 250, 7777, 8888), sub_vendor: settings(987_654, 725, 2222, 3333),
          in_house_labor: settings(0, 0, 1250, 2250), in_house_material: settings(56_789, 1000, 2750, 4250)
        },
        pmcMarginBps: 1500, subVendorMinimumMarginBps: 0, subVendorMarginBps: 3500
      },
      pricing: { specifications: [{ id: "spec-private", name: "Fire rated", description: "Two board layers" }] }
    } })).mode;
    const detail = values(result);
    // Coverage checklist: configured modes, rates, limits, impact, dedicated
    // margins, split In-house markup, paragraph, selected scope, fields and specs.
    for (const expected of [
      "Configured mode: PMC", "Configured mode: Execution · Sub-Vendor", "Configured mode: Execution · In-house",
      "PMC · Base Rate: ₹123.45", "Sub-Vendor · Base Rate: ₹9,876.54", "Labor cost · Base Rate: ₹0.00", "Material cost · Base Rate: ₹567.89",
      "PMC · Low Quantity Limit: 0", "Sub-Vendor · Impact: 7.25%", "Labor cost · Impact: 0.00%",
      "PMC Margin: 15.00%", "Sub-Vendor · Min. Lisno Margin: 0.00%", "Sub-Vendor · Max. Lisno Margin: 35.00%",
      "Labor cost · Min. Gross Margin Markup: 12.50%", "Labor cost · Starting Gross Margin Markup: 22.50%",
      "Material cost · Min. Gross Margin Markup: 27.50%", "Material cost · Starting Gross Margin Markup: 42.50%",
      "Shared description: Saved shared description.", "Sub-Vendor inclusions: Transport", "Sub-Vendor exclusions: Unloading",
      "PMC · Insurance: No", "PMC · Crew: 0", "PMC · Finish: Matt", "PMC · Finish · Type: Dropdown", "PMC · Finish · Options: Matt, Gloss",
      "Specification: Fire rated", "Fire rated · Description: Two board layers"
    ]) expect(detail).toContain(expected);
    expect(result.preview).toHaveLength(3);
    expect(result.preview.find(row => row.key === "rates")?.value).toContain("15.00%");
    expect(detail).not.toMatch(/private|Unchecked catalog entry|77\.77|88\.88|22\.22|33\.33|Final total|Discount/iu);
  });

  it("keeps pricing and advanced independent and does not show hidden historical budgets", () => {
    const onlyPricing = projectKnowledgeSavedSummary(input({ sections: { pricing: { specifications: [{ id: "spec", name: "Confirmed specification" }], priceEntries: [{ inputAmountPaise: 999_999 }] } } })).mode;
    expect(values(onlyPricing)).toBe("Specification: Confirmed specification");
    expect(projectKnowledgeSavedSummary(input({ sections: { pricing: { priceEntries: [{ inputAmountPaise: 999_999 }] } } })).mode.details).toEqual([]);
    const onlyAdvanced = projectKnowledgeSavedSummary(input({ sections: { advanced: { modeDescription: "Confirmed paragraph" } } })).mode;
    expect(values(onlyAdvanced)).toBe("Shared description: Confirmed paragraph");
  });

  it("does not fabricate min margins, impact, configuration selections or generated descriptions", () => {
    const detail = values(projectKnowledgeSavedSummary(input({ sections: { advanced: {
      subVendorMarginBps: 2500,
      modeCalculations: { in_house_labor: { baseRatePaise: 0, lowQuantityLimit: "0", minimumMarkupBps: 0, startingMarkupBps: 0 } }
    } } })).mode);
    expect(detail).toContain("Sub-Vendor · Max. Lisno Margin: 25.00%");
    expect(detail).toContain("Legacy saved configuration needs review");
    expect(detail).not.toMatch(/Min\. Lisno Margin|Impact|Configured mode|Shared description/iu);
    expect(detail).toContain("Labor cost · Starting Gross Margin Markup: 0.00%");
  });

  it("marks an explicitly saved empty calculation map as needing review, not unconfigured", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: { modeCalculations: {} } } })).mode;
    expect(result.details).toEqual([{ key: "calculations-review", label: "Calculation settings", value: "Saved configuration needs review" }]);
    expect(result.preview).toEqual(result.details);
    expect(values(result)).not.toMatch(/Base Rate|Margin|Impact|Low Quantity Limit/iu);
  });

  it.each(["pmc", "in_house_labor"])("marks a partial %s calculation map while retaining only its stored values", scope => {
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: {
      modeCalculations: { [scope]: settings(12_345, 750, 1000, 2000) }
    } } })).mode;
    const detail = values(result);
    expect(detail).toContain("Calculation settings: Saved configuration needs review");
    expect(detail).toContain("Base Rate: ₹123.45");
    expect(detail).toContain("Impact: 7.50%");
    expect(result.preview.some(row => row.key === "calculations-review")).toBe(true);
    expect(result.details.filter(row => row.label.endsWith("Base Rate"))).toHaveLength(1);
    expect(detail).not.toMatch(/Sub-Vendor|Material cost/iu);
  });

  it("reports legacy and malformed Mode data without raw JSON or spreading one legacy setting into scopes", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: {
      modeCalculation: settings(34567, 0, 500, 1500),
      modeConfigurations: [{ id: "legacy-private", modeId: "mode-private", fields: [{ id: "unsupported-private", type: "future-widget", label: "Unsupported field", value: { token: "do-not-display" } }] }]
    }, pricing: { specifications: [{ id: "typed-private", name: "Old specification", type: "text", value: "hidden old value" }] } } })).mode;
    expect(values(result)).toContain("Shared calculation (legacy) · Base Rate: ₹345.67");
    expect(values(result)).toContain("Configured mode: Old PMC");
    expect(values(result)).toContain("Legacy saved configuration needs review");
    expect(values(result)).not.toMatch(/Labor cost|Material cost|private|do-not-display|hidden old value/iu);
    const badMoney = values(projectKnowledgeSavedSummary(input({ sections: { advanced: { modeCalculations: { pmc: { baseRatePaise: -1, impactBps: { secret: "hidden" } } } } } })).mode);
    expect(badMoney).toContain("PMC · Base Rate: Saved configuration needs review");
    expect(badMoney).not.toContain("hidden");
  });

  it("renders complete rule targets, trigger, action, reason, inactive state and legacy recommendation dependency", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { recommendations: {
      budgetAlterations: [{ id: "rule-private", trigger: "removed", action: "add", requirement: "can", targetType: "catalog", targetBasketId: basket.id, targetSubBasketId: subBasket.id, targetMainLineId: item.mainLineId, reason: "Provide acoustic replacement", active: false }],
      recommendations: [{ id: "rec-private", name: "Moisture barrier", priorityId: "priority-private", reason: "Keep dry", dependency: false, active: true }],
      exclusions: [{ id: "exc-private", name: "Existing cladding", reason: "Already on site", active: false }]
    } } })).recommendations;
    const detail = values(result);
    for (const expected of [
      "Rule 1 · Inactive: Acoustic panels · Can be added", "Trigger: When this Main Line is removed",
      "Related Main Basket: Finishes", "Related Sub-Basket: Wall work", "Related Main Line: Acoustic panels",
      "Reason: Provide acoustic replacement", "Enabled: No", "Target type: Catalog Main Line",
      "Recommendation 1: Moisture barrier", "Moisture barrier · Priority: Essential", "Moisture barrier · Reason: Keep dry", "Moisture barrier · Dependency: No", "Moisture barrier · Enabled: Yes",
      "Exclusion 1 · Inactive: Existing cladding", "Existing cladding · Reason: Already on site"
    ]) expect(detail).toContain(expected);
    expect(result.preview).toHaveLength(3);
    expect(detail).not.toContain("private");
  });

  it("does not join relation names across mismatched stable IDs or parent baskets", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { recommendations: { budgetAlterations: [{
      id: "rule", trigger: "added", action: "remove", requirement: "must", targetType: "temporary",
      targetBasketId: "missing-basket-private", targetSubBasketId: subBasket.id, targetMainLineId: item.mainLineId,
      reason: "Related scope", active: true
    }], recommendations: [{ id: "rec", name: "Essential", priorityId: "missing-priority-private", active: true }] } } })).recommendations;
    expect(values(result)).toContain("Name unavailable · Must be removed");
    expect(values(result)).toContain("Related Main Basket: Name unavailable");
    expect(values(result)).toContain("Related Sub-Basket: Name unavailable");
    expect(values(result)).toContain("Essential · Priority: Name unavailable");
    expect(values(result)).not.toMatch(/Acoustic panels|Wall work|private/iu);
  });

  it("resolves a related Sub-Basket from an authorized item with matching stable hierarchy IDs", () => {
    const result = projectKnowledgeSavedSummary(input({ subBaskets: [], sections: { recommendations: { budgetAlterations: [{
      id: "r", trigger: "added", action: "add", requirement: "must", targetType: "catalog", targetBasketId: basket.id,
      targetSubBasketId: subBasket.id, targetMainLineId: item.mainLineId, reason: "Related scope", active: true
    }] } } })).recommendations;
    expect(values(result)).toContain("Related Sub-Basket: Wall work");
    expect(values(result)).not.toContain("private");
  });

  it("covers every saved Quality question, answer and inspection/sampling/evidence field without defaults", () => {
    const result = projectKnowledgeSavedSummary(input({ quality: quality([
      { id: "quality-private", type: "number", label: "Panel gap", unit: "mm", minimum: "0", maximum: "6.5", defaultValue: "0", required: false, active: false,
        category: "Finish", instructions: "Measure each edge", acceptanceCriteria: "Gap must be even", stage: "Handover", checkMethod: "measurement", severity: "major", responsibleRole: "Site engineer", failureAction: "Refit panel",
        sampling: { method: "percentage", value: 15, unit: "panels" }, evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 2, instructions: "Include scale" } },
      { id: "choice-private", type: "multi_select", label: "Finish approval", allowedValues: ["Texture", "Colour"], defaultValue: ["Colour"], required: true, active: true },
      { id: "boolean-private", type: "boolean", label: "Protected", defaultValue: false, evidence: { photos: false, documents: false, video: false } }
    ]) })).quality;
    const detail = values(result);
    // Checklist covers knowledgeQuality ROW_KEYS plus nested sampling/evidence.
    for (const expected of [
      "Question 1 · Inactive: Panel gap", "Panel gap · Answer type: Number", "Panel gap · Unit: mm", "Panel gap · Minimum: 0", "Panel gap · Maximum: 6.5", "Panel gap · Default answer: 0", "Panel gap · Required: No", "Panel gap · Enabled: No",
      "Panel gap · Category: Finish", "Panel gap · Instructions: Measure each edge", "Panel gap · Acceptance criteria: Gap must be even", "Panel gap · Stage: Handover", "Panel gap · Check method: Measurement", "Panel gap · Severity: Major", "Panel gap · Responsible role: Site engineer", "Panel gap · Failure action: Refit panel",
      "Panel gap · Sampling: Percentage", "Panel gap · Sample percentage (%): 15", "Panel gap · Sample unit: panels",
      "Panel gap · Photo evidence: Yes", "Panel gap · Document evidence: No", "Panel gap · Video evidence: No", "Panel gap · Required photos per checked unit: 2", "Panel gap · Evidence instructions: Include scale",
      "Finish approval · Answer type: Multiple choice", "Finish approval · Options: Texture, Colour", "Finish approval · Default answer: Colour", "Protected · Default answer: No", "Protected · Photo evidence: No"
    ]) expect(detail).toContain(expected);
    expect(result.preview[0]?.value).toBe("Panel gap (Inactive), Finish approval, Protected");
    expect(result.preview[1]?.value).toBe("Panel gap: Gap must be even");
    expect(detail).not.toContain("private");
    expect(detail).not.toContain("Protected · Required:");
  });

  it.each([
    [{ method: "all", unit: "rooms" }, "Sampling: All units"],
    [{ method: "fixed_count", value: 3, unit: "panels" }, "Sample count: 3"]
  ] as const)("preserves alternate sampling settings", (sampling, expected) => {
    const result = projectKnowledgeSavedSummary(input({ quality: quality([{ id: "q", label: "Check", type: "text", sampling }]) })).quality;
    expect(values(result)).toContain(expected);
  });

  it("marks unsupported records as needing review without hiding valid companions", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: {
      overview: { surfaceIds: "invalid" },
      advanced: { modeConfigurations: [false] },
      recommendations: { budgetAlterations: [null], exclusions: [{ id: "e", name: "Valid exclusion" }] }
    }, quality: quality([{ id: "q", label: "Future check", type: "unsupported", sampling: { method: "unknown" }, futurePrivateField: "do-not-display" }]) }));
    for (const group of Object.values(result)) expect(values(group)).toContain("needs review");
    expect(values(result.recommendations)).toContain("Valid exclusion");
    expect(values(result.quality)).toContain("Future check");
    expect(values(result.quality)).not.toContain("do-not-display");
  });

  it("retains a needs-review indication beside supported Overview data and malformed references", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { overview: {
      uomId: "uom-private", surfaceIds: [null, "surface-private"], futureField: { privateId: "hidden" }
    } } })).overview;
    expect(values(result)).toContain("UOM: Square metre");
    expect(values(result)).toContain("Surface 1: Name unavailable");
    expect(values(result)).toContain("Overview: Legacy saved configuration needs review");
    expect(values(result)).not.toContain("hidden");
    expect(result.preview.length).toBeLessThanOrEqual(3);
  });

  it("bounds previews only and leaves all saved long text intact without mutating input", () => {
    const description = "Saved prose ".repeat(100);
    const source = input({ sections: { advanced: { modeDescription: description }, pricing: { specifications: [{ id: "s", name: "Specification", description }] } } });
    const before = JSON.stringify(source);
    const result = projectKnowledgeSavedSummary(source);
    expect(values(result.mode)).toContain(description.trim());
    for (const group of Object.values(result)) {
      expect(group.preview.length).toBeLessThanOrEqual(3);
      group.preview.forEach(row => expect(row.value.length).toBeLessThanOrEqual(160));
      group.details.forEach(row => expect(typeof row.value).toBe("string"));
    }
    expect(JSON.stringify(source)).toBe(before);
  });
});
