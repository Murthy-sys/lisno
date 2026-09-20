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
  completionRequired: false,
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
  it("does not invent values for missing sources", () => {
    for (const group of Object.values(projectKnowledgeSavedSummary(input()))) {
      expect(group).toEqual({ details: [], preview: [] });
    }
  });

  it("shows the three persisted Mode statuses for a loaded empty Advanced section", () => {
    const result = projectKnowledgeSavedSummary(input({
      sections: { overview: {}, advanced: {}, recommendations: {} }, quality: quality([])
    }));
    expect(result.overview).toEqual({ details: [], preview: [] });
    expect(result.recommendations).toEqual({ details: [], preview: [] });
    expect(result.quality).toEqual({ details: [], preview: [] });
    expect(result.mode.details).toEqual([
      { key: "pmc-status", label: "PMC", value: "Not configured" },
      { key: "sub-vendor-status", label: "Sub-Vendor", value: "Not configured" },
      { key: "in-house-status", label: "In-house", value: "Not configured" }
    ]);
    expect(result.mode.preview).toEqual(result.mode.details);
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

  it("reports only configured status for each Mode from complete persisted settings", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: {
      modeDescription: "Do not disclose this description.",
      modeConfigurations: [{ id: "private", modeKind: "pmc", inclusions: [{ id: "scope", name: "Transport", selected: true }] }],
      modeCalculations: {
        pmc: settings(12_345, 250, 7777, 8888),
        sub_vendor: settings(987_654, 725, 2222, 3333),
        in_house_labor: settings(0, 0, 1250, 2250),
        in_house_material: settings(56_789, 1000, 2750, 4250)
      },
      pmcMinimumMarginBps: 1_250,
      pmcMarginBps: 1_750,
      subVendorMinimumMarginBps: 0,
      subVendorMarginBps: 3_500
    } } })).mode;
    expect(result.details).toEqual([
      { key: "pmc-status", label: "PMC", value: "Configured" },
      { key: "sub-vendor-status", label: "Sub-Vendor", value: "Configured" },
      { key: "in-house-status", label: "In-house", value: "Configured" }
    ]);
    expect(result.preview).toEqual(result.details);
    expect(values(result)).not.toMatch(/description|Transport|Base Rate|Margin|Impact|private/iu);
  });

  it("does not apply the In-house below-100% rule to hidden PMC or Sub-Vendor legacy fields", () => {
    const hiddenLegacyRates = settings(10_000, 0, 12_000, 15_000);
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: {
      modeCalculations: {
        pmc: hiddenLegacyRates,
        sub_vendor: hiddenLegacyRates,
        in_house_labor: hiddenLegacyRates,
        in_house_material: settings(20_000, 0, 1_000, 2_000)
      },
      pmcMinimumMarginBps: 1_000,
      pmcMarginBps: 2_000,
      subVendorMinimumMarginBps: 1_500,
      subVendorMarginBps: 2_000
    } } })).mode;
    expect(result.details.map(row => row.value)).toEqual(["Configured", "Configured", "Not configured"]);
  });

  it.each([
    [false, false, false], [false, false, true], [false, true, false], [false, true, true],
    [true, false, false], [true, false, true], [true, true, false], [true, true, true]
  ] as const)("derives asymmetric persisted status PMC=%s Sub-Vendor=%s In-house=%s", (pmc, subVendor, inHouse) => {
    const modeCalculations: KnowledgeJsonObject = {
      ...(pmc ? { pmc: settings(12_345, 750, 1_000, 2_000) } : {}),
      ...(subVendor ? { sub_vendor: settings(23_456, 500, 1_000, 2_000) } : {}),
      ...(inHouse ? {
        in_house_labor: settings(10_000, 0, 1_000, 2_000),
        in_house_material: settings(20_000, 0, 1_000, 2_000)
      } : {})
    };
    const advanced: KnowledgeJsonObject = {
      modeCalculations,
      ...(pmc ? { pmcMinimumMarginBps: 1_000, pmcMarginBps: 2_000 } : {}),
      ...(subVendor ? { subVendorMinimumMarginBps: 0, subVendorMarginBps: 2_500 } : {})
    };

    expect(projectKnowledgeSavedSummary(input({ sections: { advanced } })).mode.details.map(row => row.value)).toEqual([
      pmc ? "Configured" : "Not configured",
      subVendor ? "Configured" : "Not configured",
      inHouse ? "Configured" : "Not configured"
    ]);
  });

  it("recognizes legacy single-value PMC and Sub-Vendor margins as equal effective pairs without writing them", () => {
    const advanced: KnowledgeJsonObject = {
      pmcMarginBps: 1_500,
      subVendorMarginBps: 2_500,
      modeCalculations: {
        pmc: settings(12_345, 750, 1_000, 2_000),
        sub_vendor: settings(23_456, 500, 1_000, 2_000)
      }
    };
    const before = JSON.stringify(advanced);

    expect(projectKnowledgeSavedSummary(input({ sections: { advanced } })).mode.details.map(row => row.value))
      .toEqual(["Configured", "Configured", "Not configured"]);
    expect(JSON.stringify(advanced)).toBe(before);
    expect(Object.hasOwn(advanced, "pmcMinimumMarginBps")).toBe(false);
    expect(Object.hasOwn(advanced, "subVendorMinimumMarginBps")).toBe(false);
  });

  it("keeps incomplete, malformed and partial Mode settings not configured without exposing details", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: { advanced: {
      modeCalculations: {
        pmc: { baseRatePaise: -1, lowQuantityLimit: "0", impactBps: 0, minimumMarkupBps: 0, startingMarkupBps: 0 },
        sub_vendor: settings(12_345, 750, 1000, 2000),
        in_house_labor: settings(0, 0, 0, 0)
      },
      pmcMinimumMarginBps: 1_500,
      pmcMarginBps: 1_000,
      subVendorMarginBps: 2_500,
      secret: { doNotDisplay: true }
    } } })).mode;
    expect(result.details.map(row => row.value)).toEqual(["Not configured", "Configured", "Not configured"]);
    expect(values(result)).not.toMatch(/123\.45|7\.50|secret|review|Margin|Base Rate/iu);
  });

  it("does not load pricing or disclose Mode descriptions, scopes, fields, calculations or specifications", () => {
    const result = projectKnowledgeSavedSummary(input({ sections: {
      advanced: { modeDescription: "Confirmed paragraph", modeCalculations: {}, modeConfigurations: [{ fields: [{ label: "Crew", value: "4" }] }] },
      pricing: { specifications: [{ id: "spec", name: "Confirmed specification" }], priceEntries: [{ inputAmountPaise: 999_999 }] }
    } })).mode;
    expect(result.details).toHaveLength(3);
    expect(values(result)).not.toMatch(/Confirmed paragraph|Crew|Confirmed specification|999999/iu);
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
    expect(values(result)).toContain("Name unavailable · Must be completed · Must be removed");
    expect(values(result)).toContain("Completion: Temporary item · Must be completed");
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

  it("summarizes a whole Sub-Basket target without requiring or exposing a Main Line ID", () => {
    const temporaryChild: KnowledgeItemListItem = {
      ...item,
      id: "temporary-child-private",
      mainLineId: "temporary-line-private",
      mainLineName: "Lights",
      itemType: "temporary"
    };
    const result = projectKnowledgeSavedSummary(input({ items: [temporaryChild], sections: { recommendations: { budgetAlterations: [{
      id: "whole-private", trigger: "added", action: "add", requirement: "must", targetKind: "sub_basket", targetType: null,
      targetBasketId: basket.id, targetSubBasketId: subBasket.id, targetMainLineId: null, reason: "Add the complete lighting scope", active: true
    }] } } })).recommendations;
    const detail = values(result);
    expect(detail).toContain("Addition type: Whole Sub-Basket");
    expect(detail).toContain("Whole Sub-Basket: Wall work");
    expect(detail).toContain("Completion: Temporary item · Must be completed");
    expect(result.preview[0]?.value).toBe("Wall work · Must be completed · Must be added");
    expect(detail).not.toMatch(/Related Main Line|whole-private|targetMainLineId/iu);
  });

  it.each([
    ["active catalog children", [item], false, null],
    ["draft-only catalog children", [{ ...item, id: "draft-child", mainLineId: "draft-child", status: "draft" as const, activeRevisionId: null, draftRevisionId: "draft-revision" }], true, "Incomplete item · Must be completed"],
    ["inactive-only catalog children", [{ ...item, id: "inactive-child", mainLineId: "inactive-child", status: "inactive" as const }], true, "Sub-Basket · Must be completed"],
    ["active children without an active revision", [{ ...item, id: "unactivated-child", mainLineId: "unactivated-child", activeRevisionId: null }], true, "Incomplete item · Must be completed"],
    ["temporary children", [{ ...item, id: "temporary-child", mainLineId: "temporary-child", itemType: "temporary" as const, completionRequired: true }], true, "Temporary item · Must be completed"],
    ["mixed active and draft children", [item, { ...item, id: "mixed-draft", mainLineId: "mixed-draft", status: "draft" as const, activeRevisionId: null, draftRevisionId: "mixed-draft-revision" }], true, "Incomplete item · Must be completed"],
    ["no applicable children", [], true, "Sub-Basket · Must be completed"]
  ])("derives whole Sub-Basket completion from %s", (_label, children, completionRequired, completionLabel) => {
    const result = projectKnowledgeSavedSummary(input({ items: children, sections: { recommendations: { budgetAlterations: [{
      id: "whole-completion", trigger: "added", action: "add", requirement: "must", targetKind: "sub_basket", targetType: null,
      targetBasketId: basket.id, targetSubBasketId: subBasket.id, targetMainLineId: null, reason: "Add the complete scope", active: true
    }] } } })).recommendations;
    const detail = values(result);
    if (completionLabel) expect(detail).toContain(`Completion: ${completionLabel}`);
    else expect(detail).not.toMatch(/Completion: .*Must be completed/u);
    expect(result.preview[0]?.value.includes("Must be completed")).toBe(completionRequired);
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
      "Question 1 · Inactive: Panel gap", "Panel gap · Answer type: Number", "Panel gap · Pass range: 0–6.5 mm", "Panel gap · Default answer: 0", "Panel gap · Required: No", "Panel gap · Enabled: No",
      "Panel gap · Category: Finish", "Panel gap · Instructions: Measure each edge", "Panel gap · Acceptance criteria: Gap must be even", "Panel gap · Stage: Handover", "Panel gap · Check method: Measurement", "Panel gap · Severity: Major · Rectify before the next stage.", "Panel gap · Performed by: Legacy responsible role: Site engineer", "Panel gap · Failure action: Refit panel",
      "Panel gap · Frequency: Legacy custom frequency: percentage 15 · panels",
      "Panel gap · Photo evidence: Yes", "Panel gap · Document evidence: No", "Panel gap · Video evidence: No", "Panel gap · Required photos per checked unit: 2", "Panel gap · Evidence instructions: Include scale",
      "Finish approval · Answer type: Multiple choice", "Finish approval · Options: Texture, Colour", "Finish approval · Default answer: Colour", "Protected · Default answer: No", "Protected · Photo evidence: No"
    ]) expect(detail).toContain(expected);
    expect(result.preview[0]?.value).toBe("Panel gap (Inactive), Finish approval, Protected");
    expect(result.preview[1]?.value).toBe("Panel gap: Gap must be even");
    expect(detail).not.toContain("private");
    expect(detail).not.toContain("Protected · Required:");
  });

  it("resolves reusable Quality controls and hides unavailable reference identifiers", () => {
    const frequencyId = "qco_111111111111111111111111";
    const performerId = "qco_222222222222222222222222";
    const qualityOptions = {
      frequency: [{ id: frequencyId, kind: "frequency", name: "Per elevation", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }],
      performer: [{ id: performerId, kind: "performer", name: "Quality lead", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }]
    } as const;
    const resolved = projectKnowledgeSavedSummary(input({
      qualityOptions,
      quality: quality([{ id: "q", label: "Check finish", type: "boolean", severity: "minor", responsibleRole: performerId, sampling: { method: "all", unit: frequencyId } }])
    })).quality;
    expect(values(resolved)).toContain("Check finish · Frequency: Per elevation");
    expect(values(resolved)).toContain("Check finish · Performed by: Quality lead");
    expect(values(resolved)).not.toContain("qco_");

    const unavailable = projectKnowledgeSavedSummary(input({
      qualityOptions,
      quality: quality([{ id: "q", label: "Check finish", type: "boolean", severity: "minor", responsibleRole: "qco_333333333333333333333333", sampling: { method: "all", unit: "qco_444444444444444444444444" } }])
    })).quality;
    expect(values(unavailable)).toContain("Unavailable frequency value");
    expect(values(unavailable)).toContain("Unavailable performed-by value");
    expect(values(unavailable)).toContain("needs review");
    expect(values(unavailable)).not.toContain("qco_");
  });

  it.each([
    [{ method: "all", unit: "rooms" }, "Frequency: Legacy custom frequency: all · rooms"],
    [{ method: "fixed_count", value: 3, unit: "panels" }, "Frequency: Legacy custom frequency: fixed count 3 · panels"]
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
    expect(values(result.overview)).toContain("needs review");
    expect(result.mode.details.map(row => row.value)).toEqual(["Not configured", "Not configured", "Not configured"]);
    expect(values(result.recommendations)).toContain("needs review");
    expect(values(result.quality)).toContain("needs review");
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

  it("bounds previews, omits Mode internals and leaves the source input unchanged", () => {
    const description = "Saved prose ".repeat(100);
    const source = input({ sections: { advanced: { modeDescription: description }, pricing: { specifications: [{ id: "s", name: "Specification", description }] } } });
    const before = JSON.stringify(source);
    const result = projectKnowledgeSavedSummary(source);
    expect(values(result.mode)).not.toContain(description.trim());
    expect(values(result.mode)).not.toContain("Specification");
    for (const group of Object.values(result)) {
      expect(group.preview.length).toBeLessThanOrEqual(3);
      group.preview.forEach(row => expect(row.value.length).toBeLessThanOrEqual(160));
      group.details.forEach(row => expect(typeof row.value).toBe("string"));
    }
    expect(JSON.stringify(source)).toBe(before);
  });
});
