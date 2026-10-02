import { describe, expect, it } from "vitest";

import { buildConfiguredLines, configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredQuantityUnits, parseSellingRate, restoreConfiguredLine } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const catalogue: EstimationCatalogue = {
  ineligibleLineCount: 0,
  items: [{ id: "basket-a", name: "Joinery", displayOrder: 1, subBaskets: [{
    id: "sub-a", basketId: "basket-a", name: "Wardrobes", displayOrder: 1,
    mainLines: [{ id: "line-a", mainLineId: "line-a", basketId: "basket-a", subBasketId: "sub-a", name: "Wardrobe carcass", displayOrder: 1, revisionId: "rev-new", itemStatus: "draft", revisionStatus: "draft", itemVersion: 7, revisionVersion: 3, uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 } }]
  }] }]
};

describe("configured estimate line state", () => {
  it("prefills the combined In-house base rate and updates untouched drafts on refresh", () => {
    const priced = { ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{
      ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{
        ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, inHouseBaseRatePaise: 105_000
      }]
    }] }] };
    const rooms = [{ id: "room-a", label: "Bedroom" }];
    const selected = new Set(["basket-a"]);
    const first = buildConfiguredLines(priced, rooms, selected, [])[0]!;
    expect(first).toMatchObject({ inHouseBaseRatePaise: 105_000, rateInput: "1050" });
    expect(configuredLineAmountPaise({ ...first, included: true, quantity: 1.25 })).toBe(131_250);

    const changed = { ...priced, items: [{ ...priced.items[0]!, subBaskets: [{
      ...priced.items[0]!.subBaskets[0]!, mainLines: [{
        ...priced.items[0]!.subBaskets[0]!.mainLines[0]!, inHouseBaseRatePaise: 120_000
      }]
    }] }] };
    const refreshed = buildConfiguredLines(changed, rooms, selected, [{ ...first, included: true }])[0]!;
    expect(refreshed).toMatchObject({ rateInput: "1200", sourceReview: { changedFields: ["In-house base rate"] } });
    const edited = buildConfiguredLines(changed, rooms, selected, [{ ...first, rateInput: "1100" }])[0]!;
    expect(edited.rateInput).toBe("1100");
    expect(edited.sourceReview?.changedFields).toContain("In-house base rate");

    const zero = buildConfiguredLines({ ...priced, items: [{ ...priced.items[0]!, subBaskets: [{
      ...priced.items[0]!.subBaskets[0]!, mainLines: [{
        ...priced.items[0]!.subBaskets[0]!.mainLines[0]!, inHouseBaseRatePaise: 0
      }]
    }] }] }, rooms, selected, [])[0]!;
    expect(zero.rateInput).toBe("0");
    expect(buildConfiguredLines(catalogue, rooms, selected, [])[0]?.rateInput).toBe("");
  });

  it("distinguishes blank from zero and calculates rounded paise at the UOM precision", () => {
    const line = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    expect(parseSellingRate("")).toEqual({ kind: "blank", paise: null });
    expect(parseSellingRate("0")).toEqual({ kind: "value", paise: 0 });
    expect(parseSellingRate("80.05")).toEqual({ kind: "value", paise: 8005 });
    expect(parseSellingRate("80.005").kind).toBe("invalid");
    expect(configuredLineAmountPaise({ ...line, included: true, rateInput: "", quantity: 1.25 })).toBeNull();
    expect(configuredLineAmountPaise({ ...line, included: true, rateInput: "0", quantity: 1.25 })).toBe(0);
    expect(configuredLineAmountPaise({ ...line, included: true, rateInput: "80.05", quantity: 1.25 })).toBe(10006);
    expect(configuredQuantityUnits(1.234, 2, true)).toBeNull();
    expect(configuredQuantityUnits(0, 2, true)).toBeNull();
  });

  it("previews quantity times price without including an unchecked line in totals", () => {
    const line = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    const entered = { ...line, quantity: 100, rateInput: "60" };
    expect(entered.included).toBe(false);
    expect(configuredLinePreviewAmountPaise(entered)).toBe(600_000);
    expect(configuredLineAmountPaise(entered)).toBe(0);
    expect(configuredLineAmountPaise({ ...entered, included: true })).toBe(600_000);
    expect(configuredLinePreviewAmountPaise({ ...entered, included: true })).toBe(600_000);
  });

  it("uses each UOM's precision and rounds fractional paise half up", () => {
    const line = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 1.25, rateInput: "80.05" })).toBe(10_006);
    expect(configuredLinePreviewAmountPaise({ ...line, uomName: "Rft", uomDecimalScale: 0, quantity: 1, rateInput: "60" })).toBe(6_000);
    expect(configuredLinePreviewAmountPaise({ ...line, uomName: "each", uomDecimalScale: 0, quantity: 1.5, rateInput: "60" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, uomDecimalScale: 1, quantity: 0.5, rateInput: "0.01" })).toBe(1);
  });

  it("distinguishes zero rate from incomplete, invalid, and unsafe previews", () => {
    const line = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 2, rateInput: "0" })).toBe(0);
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 2, rateInput: "" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 2, rateInput: "bad" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 2, rateInput: "60.001" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 0, rateInput: "60" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: -1, rateInput: "60" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 1.234, rateInput: "60" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: Number.POSITIVE_INFINITY, rateInput: "60" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 1_000, rateInput: "1000000000000" })).toBeNull();
    expect(configuredLinePreviewAmountPaise({ ...line, quantity: 100_000_000_000_000, rateInput: "60" })).toBeNull();
    expect(configuredLineAmountPaise({ ...line, included: true, quantity: 2, rateInput: "" })).toBeNull();
    expect(configuredLineAmountPaise({ ...line, included: false, quantity: 0, rateInput: "" })).toBe(0);
  });

  it("keeps a saved snapshot after a configuration revision or removal", () => {
    const saved = restoreConfiguredLine({
      id: "saved-line", source: "configuration", catalogueId: "line-a", roomId: "room-a", roomName: "Bedroom",
      mainBasketId: "basket-a", mainBasketName: "Original Joinery", subBasketId: "sub-a", subBasketName: "Original Wardrobes",
      mainLineId: "line-a", mainLineName: "Original carcass", revisionId: "rev-old", sourceItemStatus: "inactive", sourceRevisionStatus: "active", sourceItemVersion: 5, sourceRevisionVersion: 2, uomId: "uom-a", uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2,
      unit: "sq ft", specification: null, rate: 80.05, ratePaise: 8005, quantity: 1.25, amount: 100.06, amountPaise: 10006, included: true
    });
    const current = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [saved])[0]!;
    expect(current).toMatchObject({ persistedId: "saved-line", mainBasketName: "Original Joinery", mainLineName: "Original carcass", revisionId: "rev-old", sourceItemStatus: "inactive", sourceRevisionStatus: "active", sourceItemVersion: 5, sourceRevisionVersion: 2, rateInput: "80.05", sourceMissing: false });
    const removed = buildConfiguredLines({ items: [], ineligibleLineCount: 1 }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [current])[0]!;
    expect(removed).toMatchObject({ persistedId: "saved-line", included: true, sourceItemStatus: "inactive", sourceItemVersion: 5, sourceMissing: true });
  });

  it("takes each new line's exact source versions from its catalogue row", () => {
    const [line] = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), []);
    expect(line).toMatchObject({ itemStatus: "draft", revisionStatus: "draft", itemVersion: 7, revisionVersion: 3 });
    expect(line?.persistedId).toBeUndefined();
    const refreshed = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4 }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [{ ...line!, included: true, rateInput: "42", quantity: 1.5 }])[0]!;
    expect(refreshed).toMatchObject({ revisionVersion: 4, rateInput: "42", quantity: 1.5, included: true, sourceReview: { changedFields: ["source version"], previousUomName: "sq ft", previousUomDecimalScale: 2, currentUomName: "sq ft", currentUomDecimalScale: 2 } });
    const stillNeedsReview = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4 }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [refreshed])[0]!;
    expect(stillNeedsReview.sourceReview?.changedFields).toEqual(["source version"]);
    const precisionChanged = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4, uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 0 } }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [stillNeedsReview])[0]!;
    expect(precisionChanged.sourceReview).toMatchObject({ changedFields: ["source version", "UOM"], previousUomDecimalScale: 2, currentUomDecimalScale: 0 });
    const unavailable = buildConfiguredLines({ items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [] }] }], ineligibleLineCount: 1 }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [{ ...line!, rateInput: "42", quantity: 1.5 }])[0]!;
    expect(unavailable).toMatchObject({ sourceMissing: true, included: false, rateInput: "42", quantity: 1.5 });
    expect(unavailable.persistedId).toBeUndefined();
  });

  it("builds direct and grouped temporary items for every room without inventing a Sub Basket", () => {
    const temporaryCatalogue: EstimationCatalogue = {
      ineligibleLineCount: 0,
      items: [{
        ...catalogue.items[0]!,
        directTemporaryItems: [{ id: "direct-a", mainLineId: "direct-a", basketId: "basket-a", subBasketId: null, itemType: "temporary", name: "Site protection", displayOrder: 1, revisionId: "rev-direct", uom: { id: "uom-each", code: "NOS", name: "each", decimalScale: 0 } }],
        subBaskets: [{
          ...catalogue.items[0]!.subBaskets[0]!,
          temporaryItems: [{ id: "temporary-a", mainLineId: "temporary-a", basketId: "basket-a", subBasketId: "sub-a", itemType: "temporary", name: "Extra shelf", displayOrder: 2, revisionId: "rev-temporary", uom: { id: "uom-each", code: "NOS", name: "each", decimalScale: 0 } }]
        }]
      }]
    };
    const rooms = [{ id: "room-a", label: "Bedroom" }, { id: "room-b", label: "Living room" }];
    const lines = buildConfiguredLines(temporaryCatalogue, rooms, new Set(["basket-a"]), []);
    expect(lines).toHaveLength(6);
    expect(lines.filter((line) => line.roomId === "room-a")).toEqual(expect.arrayContaining([
      expect.objectContaining({ mainLineId: "direct-a", itemType: "temporary", subBasketId: null, subBasketName: null, mainBasketName: "Joinery" }),
      expect.objectContaining({ mainLineId: "temporary-a", itemType: "temporary", subBasketId: "sub-a", subBasketName: "Wardrobes" }),
      expect.objectContaining({ mainLineId: "line-a", itemType: "main_line", subBasketId: "sub-a" })
    ]));
    expect(new Set(lines.map((line) => line.key)).size).toBe(6);

    const savedDirect = restoreConfiguredLine({
      id: "saved-direct", source: "configuration", itemType: "temporary", catalogueId: "direct-a", roomId: "room-a", roomName: "Bedroom",
      mainBasketId: "basket-a", mainBasketName: "Original Joinery", subBasketId: null, subBasketName: null,
      mainLineId: "direct-a", mainLineName: "Original protection", revisionId: "rev-saved", uomId: "uom-each", uomCode: "NOS", uomName: "each", uomDecimalScale: 0,
      unit: "each", specification: null, rate: 12.34, ratePaise: 1234, quantity: 2, amount: 24.68, amountPaise: 2468, included: true
    });
    const rebuilt = buildConfiguredLines(temporaryCatalogue, rooms, new Set(["basket-a"]), [savedDirect]);
    expect(rebuilt.find((line) => line.key === savedDirect.key)).toMatchObject({ persistedId: "saved-direct", itemType: "temporary", subBasketId: null, mainLineName: "Original protection", revisionId: "rev-saved", rateInput: "12.34", sourceMissing: false });

    const moved = buildConfiguredLines({ ...temporaryCatalogue, items: [{ ...temporaryCatalogue.items[0]!, directTemporaryItems: [], subBaskets: [{
      ...temporaryCatalogue.items[0]!.subBaskets[0]!, temporaryItems: [{ ...temporaryCatalogue.items[0]!.directTemporaryItems![0]!, subBasketId: "sub-a" }]
    }] }] }, rooms, new Set(["basket-a"]), [savedDirect]);
    expect(moved.find((line) => line.key === savedDirect.key)).toMatchObject({ persistedId: "saved-direct", itemType: "temporary", subBasketId: null, subBasketName: null, sourceMissing: true });
  });
});
