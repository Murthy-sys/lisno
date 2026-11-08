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
  selectedMainBasketIds: ReadonlySet<string> = selected) => buildSalesEstimateCatalogue({ catalogue: current, room, selectedMainBasketIds, lines });
const draft = (current: EstimationCatalogue, room = living) => createConfiguredLine(current, room,
  { mainLineId: "gypsum", basketId: "pop", subBasketId: "ceiling" })!;

describe("Sales active-room catalogue presentation", () => {
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

  it("restricts choices to selected baskets and reflects current Configuration defaults without fabricating a price", () => {
    const current = catalogue();
    const source = current.items[0]!.subBaskets[0]!.mainLines[0]!;
    source.name = "Current gypsum name";
    source.revisionId = "latest-draft";
    source.uom = { id: "current-area", code: "M2", name: "sq m", decimalScale: 3 };
    source.modeBaseRatesPaise = { pmc: null, sub_vendor: null, in_house: null };
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
