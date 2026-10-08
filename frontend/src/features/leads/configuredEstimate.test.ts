import { describe, expect, it } from "vitest";

import { buildConfiguredLines, configuredLineAmountPaise, configuredLineKey, configuredLinePreviewAmountPaise, configuredQuantityUnits, deselectConfiguredRecommendationSources, parseSellingRate, restoreConfiguredLine, updateConfiguredLinePricing } from "./configuredEstimate";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const catalogue: EstimationCatalogue = {
  ineligibleLineCount: 0,
  items: [{ id: "basket-a", name: "Joinery", displayOrder: 1, subBaskets: [{
    id: "sub-a", basketId: "basket-a", name: "Wardrobes", displayOrder: 1,
    mainLines: [{ id: "line-a", mainLineId: "line-a", basketId: "basket-a", subBasketId: "sub-a", name: "Wardrobe carcass", displayOrder: 1, revisionId: "rev-new", itemStatus: "draft", revisionStatus: "draft", itemVersion: 7, revisionVersion: 3, uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 2 } }]
  }] }]
};

describe("configured estimate line state", () => {
  it("removes recommendation-only descendants but retains shared, manual, and other-room lines", () => {
    const source = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    const line = (roomId: string, mainLineId: string, sources?: string[]) => ({
      ...source, key: configuredLineKey(roomId, mainLineId), roomId, mainLineId,
      included: true, quantity: 2, rateInput: "42",
      recommendationSourceMainLineIds: sources
    });
    const lines = [
      line("room-a", "pop"), line("room-a", "functional"),
      line("room-a", "paint", ["pop", "functional"]),
      line("room-a", "cove", ["paint"]),
      line("room-a", "manual"), line("room-b", "paint", ["pop"]), line("room-b", "pop")
    ];
    const oneSourceRemoved = deselectConfiguredRecommendationSources(lines, new Set([configuredLineKey("room-a", "pop")]));
    expect(oneSourceRemoved.find((item) => item.mainLineId === "paint" && item.roomId === "room-a"))
      .toMatchObject({ included: true, recommendationSourceMainLineIds: ["functional"] });
    expect(oneSourceRemoved.find((item) => item.mainLineId === "cove")?.included).toBe(true);
    expect(oneSourceRemoved.find((item) => item.mainLineId === "paint" && item.roomId === "room-b")?.included).toBe(true);

    const bothRemoved = deselectConfiguredRecommendationSources(oneSourceRemoved,
      new Set([configuredLineKey("room-a", "functional")]));
    expect(bothRemoved.find((item) => item.mainLineId === "paint" && item.roomId === "room-a"))
      .toMatchObject({ included: false, recommendationSourceMainLineIds: [], quantity: 2, rateInput: "42" });
    expect(bothRemoved.find((item) => item.mainLineId === "cove"))
      .toMatchObject({ included: false, recommendationSourceMainLineIds: [] });
    expect(bothRemoved.find((item) => item.mainLineId === "manual")?.included).toBe(true);
    expect(bothRemoved.find((item) => item.mainLineId === "paint" && item.roomId === "room-b")?.included).toBe(true);
  });

  it("keeps saved recommendation origin through restore and catalogue refresh", () => {
    const source = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    const saved = restoreConfiguredLine({
      id: "saved-line", source: "configuration", catalogueId: source.mainLineId, roomId: source.roomId,
      roomName: source.roomName, mainBasketId: source.mainBasketId, mainBasketName: source.mainBasketName,
      subBasketId: source.subBasketId, subBasketName: source.subBasketName, mainLineId: source.mainLineId,
      mainLineName: source.mainLineName, revisionId: source.revisionId, uomId: source.uomId,
      uomName: source.uomName, uomCode: "SQFT", uomDecimalScale: source.uomDecimalScale, unit: source.uomName,
      specification: null, rate: 42, ratePaise: 4200, amount: 42, amountPaise: 4200,
      quantity: 1, included: true, recommendationSourceMainLineIds: ["source-line"]
    });
    expect(buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }],
      new Set(["basket-a"]), [saved])[0]?.recommendationSourceMainLineIds).toEqual(["source-line"]);
  });
  it("restores historical Standard and retains an explicit line type through refresh and basket reselection", () => {
    const rooms = [{ id: "room-a", label: "Bedroom" }];
    const selected = new Set(["basket-a"]);
    const fresh = buildConfiguredLines(catalogue, rooms, selected, [])[0]!;
    expect(fresh.classification).toBeUndefined();
    const chosen = { ...fresh, classification: "special" as const, included: true };
    const refreshed = buildConfiguredLines(catalogue, rooms, selected, [chosen])[0]!;
    expect(refreshed.classification).toBe("special");
    const removed = buildConfiguredLines(catalogue, rooms, new Set<string>(), [{ ...refreshed, included: false }]);
    expect(removed[0]?.classification).toBe("special");
    expect(buildConfiguredLines(catalogue, rooms, selected, removed)[0]?.classification).toBe("special");

    const historicalRecord = {
      id: "saved-line", source: "configuration", catalogueId: "line-a", roomId: "room-a", roomName: "Bedroom",
      mainBasketId: "basket-a", mainBasketName: "Joinery", subBasketId: "sub-a", subBasketName: "Wardrobes",
      mainLineId: "line-a", mainLineName: "Wardrobe carcass", revisionId: "rev-new", uomId: "uom-a", uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2,
      unit: "sq ft", specification: null, rate: 80, ratePaise: 8000, quantity: 1, amount: 80, amountPaise: 8000, included: true
    } as const;
    const historical = restoreConfiguredLine(historicalRecord);
    expect(historical.classification).toBe("standard");
    expect(restoreConfiguredLine({ ...historicalRecord, classification: "special" }).classification).toBe("special");
  });

  it("prefills Sub-Vendor and refreshes only configuration-derived selling rates", () => {
    const priced = { ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{
      ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{
        ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, inHouseBaseRatePaise: 125_000, modeBaseRatesPaise: { pmc: 90_000, sub_vendor: 105_000, in_house: 125_000 }
      }]
    }] }] };
    const rooms = [{ id: "room-a", label: "Bedroom" }];
    const selected = new Set(["basket-a"]);
    const first = buildConfiguredLines(priced, rooms, selected, [])[0]!;
    expect(first).toMatchObject({ pricingMode: "sub_vendor", rateSource: "configuration", inHouseBaseRatePaise: 125_000, rateInput: "1050" });
    expect(configuredLineAmountPaise({ ...first, included: true, quantity: 1.25 })).toBe(131_250);

    const changed = { ...priced, items: [{ ...priced.items[0]!, subBaskets: [{
      ...priced.items[0]!.subBaskets[0]!, mainLines: [{
        ...priced.items[0]!.subBaskets[0]!.mainLines[0]!, inHouseBaseRatePaise: 135_000, modeBaseRatesPaise: { pmc: 95_000, sub_vendor: 120_000, in_house: 135_000 }
      }]
    }] }] };
    const refreshed = buildConfiguredLines(changed, rooms, selected, [{ ...first, included: true }])[0]!;
    expect(refreshed).toMatchObject({ rateInput: "1200", inHouseBaseRatePaise: 135_000 });
    const edited = buildConfiguredLines(changed, rooms, selected, [updateConfiguredLinePricing(first, { rateInput: "1100" })])[0]!;
    expect(edited.rateInput).toBe("1100");
    expect(edited.inHouseBaseRatePaise).toBe(135_000);

    const zero = buildConfiguredLines({ ...priced, items: [{ ...priced.items[0]!, subBaskets: [{
      ...priced.items[0]!.subBaskets[0]!, mainLines: [{
        ...priced.items[0]!.subBaskets[0]!.mainLines[0]!, modeBaseRatesPaise: { pmc: 900, sub_vendor: 0, in_house: 800 }
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

  it("keeps explicit modes and manual prices across room rebuilds, deselection and reselection", () => {
    const rooms = [{ id: "room-a", label: "Bedroom" }, { id: "room-b", label: "Living" }];
    const selected = new Set(["basket-a"]);
    const priced: EstimationCatalogue = { ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{
      ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!,
        modeBaseRatesPaise: { pmc: 8005, sub_vendor: 10500, in_house: 12000 } }]
    }] }] };
    const first = buildConfiguredLines(priced, rooms, selected, []);
    const special = updateConfiguredLinePricing(first[0]!, { included: true, classification: "special" });
    expect(special).toMatchObject({ pricingMode: "sub_vendor", rateInput: "105", rateSource: "configuration" });
    const pmc = updateConfiguredLinePricing(special, { pricingMode: "pmc", quantity: 1.25 });
    expect(configuredLineAmountPaise(pmc)).toBe(10006);
    const manual = updateConfiguredLinePricing(pmc, { rateInput: "91.17" });
    expect(updateConfiguredLinePricing(manual, { pricingMode: "pmc" })).toMatchObject({ rateInput: "91.17", rateSource: "manual" });
    const rebuilt = buildConfiguredLines(priced, rooms, selected, [manual, { ...first[1]!, included: true, quantity: 3 }]);
    expect(rebuilt[0]).toMatchObject({ pricingMode: "pmc", rateSource: "manual", rateInput: "91.17" });
    expect(rebuilt[1]).toMatchObject({ pricingMode: "sub_vendor", rateInput: "105" });
    expect(configuredLineAmountPaise(rebuilt[0]!)).toBe(11396);
    expect(configuredLineAmountPaise(rebuilt[1]!)).toBe(31500);
    const deselected = buildConfiguredLines(priced, rooms, new Set(), [{ ...rebuilt[0]!, included: false }]);
    expect(buildConfiguredLines(priced, rooms, selected, deselected)[0]).toMatchObject({ pricingMode: "pmc", rateSource: "manual", rateInput: "91.17" });
    expect(updateConfiguredLinePricing(manual, { pricingMode: "in_house" })).toMatchObject({ rateInput: "120", rateSource: "configuration" });
    expect(updateConfiguredLinePricing(manual, { classification: "standard" })).toMatchObject({ pricingMode: "sub_vendor", rateInput: "105", rateSource: "configuration" });
  });

  it("preserves historical prices until an explicit mode or Special-to-Standard choice", () => {
    const fresh = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    const historical = { ...fresh, persistedId: "saved", classification: "standard" as const,
      pricingMode: undefined, rateSource: "manual" as const, rateInput: "99.15",
      modeBaseRatesPaise: { pmc: 8000, sub_vendor: 12000, in_house: 15000 } };
    const special = updateConfiguredLinePricing(historical, { classification: "special" });
    expect(special).toMatchObject({ pricingMode: undefined, rateSource: "manual", rateInput: "99.15" });
    expect(updateConfiguredLinePricing(special, { pricingMode: "sub_vendor" })).toMatchObject({ rateInput: "120", rateSource: "configuration" });
    expect(updateConfiguredLinePricing(special, { classification: "standard" })).toMatchObject({ pricingMode: "sub_vendor", rateInput: "120" });
  });

  it("keeps untouched rows inheritable but locks explicit pre-inclusion modes and inherited Special-to-Standard choices", () => {
    const fresh = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]!;
    const line = { ...fresh, modeBaseRatesPaise: { pmc: 8005, sub_vendor: 12000, in_house: 15000 } };
    const quantityOnly = updateConfiguredLinePricing(line, { quantity: 2 }, "special");
    expect(quantityOnly.classification).toBeUndefined();
    const pmc = updateConfiguredLinePricing(quantityOnly, { pricingMode: "pmc" }, "special");
    expect(pmc).toMatchObject({ included: false, classification: "special", pricingMode: "pmc", rateInput: "80.05", rateSource: "configuration" });
    const manual = updateConfiguredLinePricing(pmc, { rateInput: "91.17" }, "standard");
    expect(updateConfiguredLinePricing(manual, { included: true }, "standard"))
      .toMatchObject({ classification: "special", pricingMode: "pmc", rateSource: "manual", rateInput: "91.17", included: true });
    const inheritedManual = updateConfiguredLinePricing(line, { rateInput: "177.35" }, "special");
    expect(inheritedManual.classification).toBeUndefined();
    expect(updateConfiguredLinePricing(inheritedManual, { classification: "standard" }, "special"))
      .toMatchObject({ classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration", rateInput: "120", included: false });
  });

  it("refreshes saved configuration prices but freezes manual and read-only selling values", () => {
    const rooms = [{ id: "room-a", label: "Bedroom" }];
    const selected = new Set(["basket-a"]);
    const fresh = buildConfiguredLines(catalogue, rooms, selected, [])[0]!;
    const saved = { ...fresh, persistedId: "saved", classification: "special" as const, pricingMode: "pmc" as const, rateInput: "90" };
    const next: EstimationCatalogue = { ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{
      ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!,
        modeBaseRatesPaise: { pmc: 10101, sub_vendor: null, in_house: 0 } }]
    }] }] };
    expect(buildConfiguredLines(next, rooms, selected, [saved])[0]).toMatchObject({ rateInput: "101.01", pricingMode: "pmc", rateSource: "configuration" });
    const manual = updateConfiguredLinePricing(saved, { rateInput: "107" });
    expect(buildConfiguredLines(next, rooms, selected, [manual])[0]).toMatchObject({ rateInput: "107", modeBaseRatesPaise: { pmc: 10101 } });
    expect(buildConfiguredLines(next, rooms, selected, [saved], true)[0]).toMatchObject({ rateInput: "90", modeBaseRatesPaise: { pmc: 10101 } });
    expect(buildConfiguredLines(catalogue, rooms, selected, [saved])[0]?.rateInput).toBe("");
    const refreshed = buildConfiguredLines(next, rooms, selected, [saved])[0]!;
    expect(updateConfiguredLinePricing(refreshed, { pricingMode: "sub_vendor" })).toMatchObject({ rateInput: "", pricingMode: "sub_vendor" });
    expect(updateConfiguredLinePricing(refreshed, { pricingMode: "in_house" })).toMatchObject({ rateInput: "0", pricingMode: "in_house" });
  });

  it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])("never uses a missing or invalid Sub-Vendor base (%s) or falls back to legacy In-house", (rate) => {
    const next: EstimationCatalogue = { ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{
      ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!,
        inHouseBaseRatePaise: 9000, modeBaseRatesPaise: { pmc: 7000, sub_vendor: rate, in_house: 9000 } }]
    }] }] };
    expect(buildConfiguredLines(next, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]?.rateInput).toBe("");
    delete next.items[0]!.subBaskets[0]!.mainLines[0]!.modeBaseRatesPaise;
    expect(buildConfiguredLines(next, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [])[0]?.rateInput).toBe("");
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

  it("updates a saved line from current Configuration and preserves its selling rate", () => {
    const saved = restoreConfiguredLine({
      id: "saved-line", source: "configuration", catalogueId: "line-a", roomId: "room-a", roomName: "Bedroom",
      mainBasketId: "basket-a", mainBasketName: "Original Joinery", subBasketId: "sub-a", subBasketName: "Original Wardrobes",
      mainLineId: "line-a", mainLineName: "Original carcass", revisionId: "rev-old", sourceItemStatus: "inactive", sourceRevisionStatus: "active", sourceItemVersion: 5, sourceRevisionVersion: 2, uomId: "uom-a", uomCode: "SQFT", uomName: "sq ft", uomDecimalScale: 2,
      unit: "sq ft", specification: null, rate: 80.05, ratePaise: 8005, quantity: 1.25, amount: 100.06, amountPaise: 10006, included: true
    });
    const current = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [saved])[0]!;
    expect(current).toMatchObject({ persistedId: "saved-line", mainBasketName: "Joinery", mainLineName: "Wardrobe carcass", revisionId: "rev-new", sourceItemStatus: "draft", sourceRevisionStatus: "draft", sourceItemVersion: 7, sourceRevisionVersion: 3, rateInput: "80.05", quantity: 1.25, sourceMissing: false });
    const approved = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [saved], true)[0]!;
    expect(approved).toMatchObject({ mainLineName: "Original carcass", revisionId: "rev-old", rateInput: "80.05", sourceMissing: false });
    const removed = buildConfiguredLines({ items: [], ineligibleLineCount: 1 }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [current])[0]!;
    expect(removed).toMatchObject({ persistedId: "saved-line", included: true, sourceItemStatus: "draft", sourceItemVersion: 7, sourceMissing: true });
  });

  it("takes each new line's exact source versions from its catalogue row", () => {
    const [line] = buildConfiguredLines(catalogue, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), []);
    expect(line).toMatchObject({ itemStatus: "draft", revisionStatus: "draft", itemVersion: 7, revisionVersion: 3 });
    expect(line?.persistedId).toBeUndefined();
    const refreshed = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4 }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [{ ...line!, included: true, rateInput: "42", rateSource: "manual", quantity: 1.5 }])[0]!;
    expect(refreshed).toMatchObject({ revisionVersion: 4, rateInput: "42", quantity: 1.5, included: true, uomNeedsQuantityReview: false });
    const stillNeedsReview = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4 }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [refreshed])[0]!;
    expect(stillNeedsReview.uomNeedsQuantityReview).toBe(false);
    const precisionChanged = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, revisionVersion: 4, uom: { id: "uom-a", code: "SQFT", name: "sq ft", decimalScale: 0 } }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [stillNeedsReview])[0]!;
    expect(precisionChanged).toMatchObject({ uomDecimalScale: 0, uomNeedsQuantityReview: false });
    expect(configuredLineAmountPaise(precisionChanged)).toBeNull();
    const changedUom = buildConfiguredLines({ ...catalogue, items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [{ ...catalogue.items[0]!.subBaskets[0]!.mainLines[0]!, uom: { id: "uom-rft", code: "RFT", name: "Running foot", decimalScale: 2 } }] }] }] }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [refreshed])[0]!;
    expect(changedUom).toMatchObject({ uomId: "uom-rft", uomNeedsQuantityReview: true, previousUomName: "sq ft" });
    expect(configuredLineAmountPaise(changedUom)).toBeNull();
    const unavailable = buildConfiguredLines({ items: [{ ...catalogue.items[0]!, subBaskets: [{ ...catalogue.items[0]!.subBaskets[0]!, mainLines: [] }] }], ineligibleLineCount: 1 }, [{ id: "room-a", label: "Bedroom" }], new Set(["basket-a"]), [{ ...line!, rateInput: "42", rateSource: "manual", quantity: 1.5 }])[0]!;
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
    expect(rebuilt.find((line) => line.key === savedDirect.key)).toMatchObject({ persistedId: "saved-direct", itemType: "temporary", subBasketId: null, mainLineName: "Site protection", revisionId: "rev-direct", rateInput: "12.34", sourceMissing: false });

    const moved = buildConfiguredLines({ ...temporaryCatalogue, items: [{ ...temporaryCatalogue.items[0]!, directTemporaryItems: [], subBaskets: [{
      ...temporaryCatalogue.items[0]!.subBaskets[0]!, temporaryItems: [{ ...temporaryCatalogue.items[0]!.directTemporaryItems![0]!, subBasketId: "sub-a" }]
    }] }] }, rooms, new Set(["basket-a"]), [savedDirect]);
    expect(moved.find((line) => line.key === savedDirect.key)).toMatchObject({ persistedId: "saved-direct", itemType: "temporary", subBasketId: "sub-a", subBasketName: "Wardrobes", sourceMissing: true });
  });
});
