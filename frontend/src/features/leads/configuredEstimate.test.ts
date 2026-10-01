import { describe, expect, it } from "vitest";

import { buildConfiguredLines, configuredLineAmountPaise, configuredQuantityUnits, parseSellingRate, restoreConfiguredLine } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const catalogue: EstimationCatalogue = {
  ineligibleLineCount: 0,
  items: [{ id: "basket-a", name: "Joinery", displayOrder: 1, subBaskets: [{
    id: "sub-a", basketId: "basket-a", name: "Wardrobes", displayOrder: 1,
    mainLines: [{ id: "line-a", mainLineId: "line-a", basketId: "basket-a", subBasketId: "sub-a", name: "Wardrobe carcass", displayOrder: 1, revisionId: "rev-new", uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 } }]
  }] }]
};

describe("configured estimate line state", () => {
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

  it("keeps a saved snapshot after a configuration revision or removal", () => {
    const saved = restoreConfiguredLine({
      id: "saved-line", source: "configuration", catalogueId: "line-a", roomId: "room-a", roomName: "Bedroom",
      mainBasketId: "basket-a", mainBasketName: "Original Joinery", subBasketId: "sub-a", subBasketName: "Original Wardrobes",
      mainLineId: "line-a", mainLineName: "Original carcass", revisionId: "rev-old", uomId: "uom-a", uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2,
      unit: "sq ft", specification: null, rate: 80.05, ratePaise: 8005, quantity: 1.25, amount: 100.06, amountPaise: 10006, included: true
    });
    const current = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [saved])[0]!;
    expect(current).toMatchObject({ persistedId: "saved-line", mainBasketName: "Original Joinery", mainLineName: "Original carcass", revisionId: "rev-old", rateInput: "80.05", sourceMissing: false });
    const removed = buildConfiguredLines({ items: [], ineligibleLineCount: 1 }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [current])[0]!;
    expect(removed).toMatchObject({ persistedId: "saved-line", included: true, sourceMissing: true });
  });
});
