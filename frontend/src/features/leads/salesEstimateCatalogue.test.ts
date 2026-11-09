import { describe, expect, it } from "vitest";
import { createConfiguredLine, configuredLineAmountPaise, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue, EstimationCatalogueMainLine, EstimationCatalogueTemporaryItem } from "./estimationCatalogueApi";
import { buildSalesEstimateCatalogue } from "./salesEstimateCatalogue";

const living = { id: "room-living", label: "Living & Dining", sqft: 20000 };
const kitchen = { id: "room-kitchen", label: "Kitchen", sqft: 680 };
const line = (id: string, basketId = "pop", subBasketId = "ceiling"): EstimationCatalogueMainLine => ({
  id, mainLineId: id, basketId, subBasketId, name: `Item ${id}`, displayOrder: 0, revisionId: `revision-${id}`,
  uom: { id: "area", code: "SQFT", name: "sq ft", decimalScale: 2 },
  modeBaseRatesPaise: { pmc: 1000, sub_vendor: 1250, in_house: 1500 }
});
const temporary = (id: string, subBasketId: string | null): EstimationCatalogueTemporaryItem => ({
  ...line(id), itemType: "temporary", subBasketId
});
const catalogue = (): EstimationCatalogue => ({
  ineligibleLineCount: 0, readyNonActiveSupported: true,
  items: [
    { id: "pop", name: "POP / Gypsum", displayOrder: 0, directTemporaryItems: [temporary("direct", null)], subBaskets: [
      { id: "ceiling", basketId: "pop", name: "Ceiling", displayOrder: 0,
        mainLines: [line("gypsum")], temporaryItems: [temporary("temporary-ceiling", "ceiling")] },
      { id: "empty", basketId: "pop", name: "Empty", displayOrder: 1, mainLines: [] }
    ] },
    { id: "painting", name: "Painting", displayOrder: 1, subBaskets: [
      { id: "wall", basketId: "painting", name: "Walls", displayOrder: 0, mainLines: [line("paint", "painting", "wall")] }
    ] }
  ]
});
const selected = new Set(["pop", "painting"]);
const project = (current: EstimationCatalogue, lines: readonly ConfiguredLineDraft[] = [], room = living,
  selectedMainBasketIds: ReadonlySet<string> = selected, browseMainBasketIds?: ReadonlySet<string>) =>
  buildSalesEstimateCatalogue({ catalogue: current, room, selectedMainBasketIds, browseMainBasketIds, lines });
const draft = (current: EstimationCatalogue, room = living) => createConfiguredLine(current, room,
  { mainLineId: "gypsum", basketId: "pop", subBasketId: "ceiling" })!;

describe("Sales active-room catalogue presentation", () => {
  it("hides authoritative zero-only choices across direct, normal and temporary paths", () => {
    const current = catalogue();
    for (const source of [current.items[0]!.directTemporaryItems![0]!, current.items[0]!.subBaskets[0]!.mainLines[0]!,
      current.items[0]!.subBaskets[0]!.temporaryItems![0]!]) {
      source.hasConfiguredBasePrice = false;
      source.modeBaseRatesPaise = { pmc: 0, sub_vendor: 0, in_house: 0 };
    }
    const selectedLine = { ...draft(current), included: true, persistedId: "saved-line", quantity: 3, rateInput: "79" };
    const before = structuredClone(selectedLine);
    expect(project(current, [selectedLine]).map(row => row.target.mainLineId)).toEqual(["paint"]);
    expect(project(current, [selectedLine], kitchen).map(row => row.target.mainLineId)).toEqual(["paint"]);
    expect(selectedLine).toEqual(before);
    expect(selectedLine.sourceMissing).not.toBe(true);
    expect(configuredLineAmountPaise(selectedLine)).toBe(23700);
    current.items[0]!.subBaskets[0]!.mainLines[0]!.hasConfiguredBasePrice = true;
    current.items[0]!.subBaskets[0]!.mainLines[0]!.modeBaseRatesPaise!.sub_vendor = 1200;
    expect(project(current, [selectedLine]).find(row => row.target.mainLineId === "gypsum")?.line).toBe(selectedLine);
  });

  it("keeps positive default or other-mode bases visible with missing or zero selling rates, and retains legacy visibility", () => {
    const current = catalogue();
    const defaultOnly = current.items[0]!.subBaskets[0]!.mainLines[0]!;
    defaultOnly.hasConfiguredBasePrice = true;
    defaultOnly.basePriceAvailability = { default: { pmc: false, sub_vendor: true, in_house: false }, signature: { pmc: false, sub_vendor: false, in_house: false }, premium: { pmc: false, sub_vendor: false, in_house: false }, functional: { pmc: false, sub_vendor: false, in_house: false } };
    defaultOnly.modeBaseRatesPaise = { pmc: null, sub_vendor: null, in_house: null };
    const positiveInAnotherMode = current.items[0]!.directTemporaryItems![0]!;
    positiveInAnotherMode.hasConfiguredBasePrice = true;
    positiveInAnotherMode.basePriceAvailability = structuredClone(defaultOnly.basePriceAvailability);
    positiveInAnotherMode.modeBaseRatesPaise = { pmc: 0, sub_vendor: 0, in_house: 0 };
    const rows = project(current);
    expect(rows).toHaveLength(4);
    expect(rows.find(row => row.target.mainLineId === "gypsum")?.line.rateInput).toBe("");
    expect(rows.find(row => row.target.mainLineId === "direct")?.line.rateInput).toBe("0");
    expect(rows.find(row => row.target.mainLineId === "paint")?.line.hasConfiguredBasePrice).toBeUndefined();
  });

  it("shows unchecked current choices and supported temporary items without creating selected amounts or mutating inputs", () => {
    const current = catalogue();
    const previous = structuredClone(current);
    const drafts: ConfiguredLineDraft[] = [];
    const rows = project(current, drafts);
    expect(rows.map(row => row.target)).toEqual([
      { mainLineId: "direct", basketId: "pop", subBasketId: null },
      { mainLineId: "gypsum", basketId: "pop", subBasketId: "ceiling" },
      { mainLineId: "temporary-ceiling", basketId: "pop", subBasketId: "ceiling" },
      { mainLineId: "paint", basketId: "painting", subBasketId: "wall" }
    ]);
    expect(rows.every(row => row.isPreview && !row.line.included && row.line.roomId === living.id)).toBe(true);
    expect(rows.reduce((total, row) => total + configuredLineAmountPaise(row.line)!, 0)).toBe(0);
    expect(rows[0]!.line).toMatchObject({ itemType: "temporary", subBasketId: null, rateInput: "12.5", rateSource: "configuration" });
    expect(current).toEqual(previous);
    expect(drafts).toEqual([]);
  });

  it("preserves exact saved values and excluded local edits while isolating unequal rooms", () => {
    const current = catalogue();
    const saved: ConfiguredLineDraft = { ...draft(current), persistedId: "saved-living", included: false,
      classification: "special", quantity: 7.25, rateInput: "123.45", rateSource: "manual", pricingMode: "in_house",
      modeTier: "signature", dimensions: { length: "1", width: "2", height: "3" }, selectedInHouseComponentIds: ["frame"],
      recommendationSourceMainLineIds: ["origin"] };
    const otherRoom: ConfiguredLineDraft = { ...draft(current, kitchen), included: true, quantity: 11, rateInput: "44" };
    const rows = project(current, [saved, otherRoom]);
    expect(rows.find(row => row.target.mainLineId === "gypsum")).toEqual({
      target: { mainLineId: "gypsum", basketId: "pop", subBasketId: "ceiling" }, line: saved, isPreview: false
    });
    expect(rows.find(row => row.target.mainLineId === "gypsum")!.line).toBe(saved);
    expect(project(current, [saved, otherRoom], kitchen).find(row => row.target.mainLineId === "gypsum")!.line).toBe(otherRoom);
    expect(project(current, [saved], kitchen).find(row => row.target.mainLineId === "gypsum")!.line)
      .toMatchObject({ included: false, quantity: 1, rateInput: "12.5", roomName: "Kitchen" });
  });

  it("shows only included room items in a compact basket without sibling or other-group previews", () => {
    const current = catalogue();
    current.items[0]!.subBaskets[0]!.mainLines.push(line("sibling"));
    current.items[0]!.subBaskets[1]!.mainLines.push(line("other-group", "pop", "empty"));
    const chosen: ConfiguredLineDraft = { ...draft(current), included: true, quantity: 3, rateInput: "75",
      recommendationSourceMainLineIds: ["living-source"], itemVersion: 7, revisionVersion: 9 };
    const otherRoom: ConfiguredLineDraft = { ...createConfiguredLine(current, kitchen,
      { mainLineId: "sibling", basketId: "pop", subBasketId: "ceiling" })!, included: true,
      quantity: 2, rateInput: "44", recommendationSourceMainLineIds: ["kitchen-source"] };
    const browse = new Set(["painting"]);
    const drafts = [chosen, otherRoom];
    const before = structuredClone(drafts);
    const livingRows = project(current, drafts, living, selected, browse);
    expect(livingRows.map(row => row.target.mainLineId)).toEqual(["gypsum", "paint"]);
    expect(livingRows[0]!.line).toBe(chosen);
    expect(livingRows[0]!.isPreview).toBe(false);
    expect(livingRows[1]!.isPreview).toBe(true);
    expect(project(current, drafts, kitchen, selected, browse).map(row => row.target.mainLineId)).toEqual(["sibling", "paint"]);
    expect(project(current, [chosen], kitchen, selected, browse).map(row => row.target.mainLineId)).toEqual(["paint"]);
    expect(livingRows.reduce((amount, row) => amount + configuredLineAmountPaise(row.line)!, 0)).toBe(22_500);
    expect(project(current, drafts, kitchen, selected, browse)
      .reduce((amount, row) => amount + configuredLineAmountPaise(row.line)!, 0)).toBe(8_800);
    expect(drafts).toEqual(before);
    expect(browse).toEqual(new Set(["painting"]));
    expect(selected).toEqual(new Set(["pop", "painting"]));
  });

  it("reveals unchecked choices and preserved exclusions on explicit browse without altering selected amounts", () => {
    const current = catalogue();
    current.items[0]!.subBaskets[0]!.mainLines.push(line("sibling"), line("never-selected"));
    current.items[0]!.subBaskets[1]!.mainLines.push(line("other-group", "pop", "empty"));
    const chosen: ConfiguredLineDraft = { ...draft(current), included: true, quantity: 3, rateInput: "75",
      recommendationSourceMainLineIds: ["source"] };
    const excluded: ConfiguredLineDraft = { ...createConfiguredLine(current, living,
      { mainLineId: "sibling", basketId: "pop", subBasketId: "ceiling" })!, persistedId: "saved-excluded",
      included: false, quantity: 7.25, rateInput: "123.45", rateSource: "manual", pricingMode: "in_house",
      classification: "special", sourceItemVersion: 4, sourceRevisionVersion: 5,
      dimensions: { length: "1", width: "2", height: "3" }, selectedInHouseComponentIds: ["frame"] };
    const drafts = [chosen, excluded];
    const before = structuredClone(drafts);
    const compactRows = project(current, drafts, living, selected, new Set(["painting"]));
    const browsedRows = project(current, drafts, living, selected, selected);
    expect(compactRows.map(row => row.target.mainLineId)).toEqual(["gypsum", "paint"]);
    expect(browsedRows.map(row => row.target.mainLineId)).toEqual([
      "direct", "gypsum", "sibling", "never-selected", "temporary-ceiling", "other-group", "paint"
    ]);
    expect(browsedRows.find(row => row.target.mainLineId === "sibling")!.line).toBe(excluded);
    expect(browsedRows.filter(row => row.line.included).map(row => row.target.mainLineId)).toEqual(["gypsum"]);
    expect(browsedRows.filter(row => row.isPreview).every(row => !row.line.included)).toBe(true);
    for (const rows of [compactRows, browsedRows]) {
      expect(rows.reduce((amount, row) => amount + configuredLineAmountPaise(row.line)!, 0)).toBe(22_500);
    }
    expect(drafts).toEqual(before);
  });

  it("keeps identity and saved-source guards for included compact rows and ignores unselected browse IDs", () => {
    const current = catalogue();
    const chosen: ConfiguredLineDraft = { ...draft(current), included: true };
    expect(project(current, [chosen], living, new Set(["pop"]), new Set(["painting"]))
      .map(row => row.target.mainLineId)).toEqual(["gypsum"]);
    expect(project(current, [{ ...chosen, sourceMissing: true }], living, new Set(["pop"]), new Set())).toEqual([]);
    expect(project(current, [chosen, { ...chosen, persistedId: "duplicate" }], living, new Set(["pop"]), new Set())).toEqual([]);
    current.items[1]!.subBaskets[0]!.mainLines.push(line("gypsum", "painting", "wall"));
    expect(project(current, [chosen], living, new Set(["pop"]), new Set())).toEqual([]);
  });

  it("restricts choices to selected baskets and reflects current Configuration defaults without fabricating a price", () => {
    const current = catalogue();
    const source = current.items[0]!.subBaskets[0]!.mainLines[0]!;
    source.name = "Current gypsum name";
    source.revisionId = "latest-draft";
    source.uom = { id: "current-area", code: "M2", name: "sq m", decimalScale: 3 };
    source.modeBaseRatesPaise = { pmc: null, sub_vendor: null, in_house: null };
    source.basePriceAvailability = { default: { pmc: false, sub_vendor: true, in_house: false }, signature: { pmc: false, sub_vendor: false, in_house: false }, premium: { pmc: false, sub_vendor: false, in_house: false }, functional: { pmc: false, sub_vendor: false, in_house: false } };
    const rows = project(current, [], living, new Set(["pop"]));
    expect(rows.every(row => row.target.basketId === "pop")).toBe(true);
    expect(rows.find(row => row.target.mainLineId === "gypsum")!.line).toMatchObject({
      mainLineName: "Current gypsum name", revisionId: "latest-draft", uomId: "current-area", uomName: "sq m", rateInput: ""
    });
    expect(project(current, [], living, new Set())).toEqual([]);
    expect(project({ ...current, items: [] })).toEqual([]);
  });

  it.each([
    { sourceMissing: true },
    { mainBasketId: "previous-basket" },
    { subBasketId: "previous-sub-basket" },
    { itemType: "temporary" as const }
  ])("does not replace a conflicting saved source with a fresh actionable preview: %j", change => {
    const current = catalogue();
    const saved = { ...draft(current), ...change, persistedId: "saved-line" };
    expect(project(current, [saved]).some(row => row.target.mainLineId === "gypsum")).toBe(false);
    expect(saved).toMatchObject(change);
  });

  it("does not manufacture catalogue rows for unavailable saved lines or duplicate drafts", () => {
    const current = catalogue();
    const saved = draft(current);
    expect(project(current, [saved, { ...saved, persistedId: "duplicate" }]).some(row => row.target.mainLineId === "gypsum")).toBe(false);
    current.items[0]!.subBaskets[0]!.mainLines = [];
    expect(project(current, [{ ...saved, persistedId: "removed" }]).some(row => row.target.mainLineId === "gypsum")).toBe(false);
  });

  it("fails closed for duplicate catalogue identities even across groups or unselected baskets", () => {
    const current = catalogue();
    current.items[1]!.subBaskets[0]!.mainLines.push(line("gypsum", "painting", "wall"));
    expect(project(current).some(row => row.target.mainLineId === "gypsum")).toBe(false);
    expect(project(current, [], living, new Set(["pop"])).some(row => row.target.mainLineId === "gypsum")).toBe(false);
    const repeated = catalogue();
    repeated.items[0]!.subBaskets[0]!.mainLines.push(line("gypsum"));
    expect(project(repeated).some(row => row.target.mainLineId === "gypsum")).toBe(false);
  });

  it("rejects ambiguous hierarchy and mismatched source metadata", () => {
    const duplicateBasket = catalogue();
    duplicateBasket.items.push({ ...duplicateBasket.items[0]!, subBaskets: [], directTemporaryItems: [] });
    expect(project(duplicateBasket).every(row => row.target.basketId !== "pop")).toBe(true);
    const duplicateSubBasket = catalogue();
    duplicateSubBasket.items[0]!.subBaskets.push({ ...duplicateSubBasket.items[0]!.subBaskets[0]!, mainLines: [], temporaryItems: [] });
    expect(project(duplicateSubBasket).every(row => row.target.subBasketId !== "ceiling")).toBe(true);
    const mismatch = catalogue();
    mismatch.items[0]!.subBaskets[0]!.mainLines[0]!.basketId = "different-source";
    expect(project(mismatch).some(row => row.target.mainLineId === "gypsum")).toBe(false);
  });

  it("projects a 1,000-item catalogue only for the active room with no draft materialization", () => {
    const current = catalogue();
    current.items = [{ ...current.items[0]!, directTemporaryItems: [], subBaskets: [{
      ...current.items[0]!.subBaskets[0]!, temporaryItems: [],
      mainLines: Array.from({ length: 1000 }, (_, index) => line(`large-${index}`))
    }] }];
    const drafts: ConfiguredLineDraft[] = [];
    const rows = project(current, drafts, kitchen);
    expect(rows).toHaveLength(1000);
    expect(new Set(rows.map(row => row.line.key)).size).toBe(1000);
    expect(rows.every(row => row.isPreview && row.line.roomId === kitchen.id && !row.line.included)).toBe(true);
    expect(drafts).toEqual([]);
  });
});
