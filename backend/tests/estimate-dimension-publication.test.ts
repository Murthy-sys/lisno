import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalogue from "../src/services/estimator-catalogue.service.js";
import { assertCurrentConfiguredPublication } from "../src/services/estimate-publication.service.js";
import { designRulesDigest } from "../src/domain/main-line-design-rules.js";

afterEach(() => vi.restoreAllMocks());

describe("publication measurement source authority", () => {
  it("rejects false flags and changed rules despite matching version pins, while preserving inactive historical units", async () => {
    const rule = { formula: "length_width" as const, inputUnit: "ft" as const, quantityUnit: "sq_ft" as const, uomId: "sqft", decimalScale: 2 };
    const source = { mainBasketName: "Ceilings", subBasketName: "Ceiling work", line: {
      id: "line", mainLineId: "line", basketId: "basket", subBasketId: "sub", itemType: "main_line", clientVisible: true,
      name: "Ceiling", revisionId: "revision", itemStatus: "active", revisionStatus: "active", itemVersion: 1, revisionVersion: 1,
      uom: { id: "sqft", code: "SQFT", name: "Square feet", decimalScale: 2 }, estimateNotes: [],
      modeBaseRatesPaise: { pmc: 100, sub_vendor: 100, in_house: 100 }, designRulesDigest: designRulesDigest(undefined),
      dimensionsMandatory: true, dimensionRule: rule
    } };
    vi.spyOn(catalogue, "resolveEstimatorCatalogueLines").mockResolvedValue(new Map([["line", source]]) as never);
    const line = { source: "configuration", itemType: "main_line", clientVisible: true, catalogueId: "line", mainLineId: "line", mainBasketId: "basket", subBasketId: "sub",
      revisionId: "revision", sourceItemStatus: "active", sourceRevisionStatus: "active", sourceItemVersion: 1, sourceRevisionVersion: 1,
      uomId: "sqft", uomCode: "SQFT", uomName: "Square feet", unit: "Square feet", uomDecimalScale: 2,
      mainBasketName: "Ceilings", subBasketName: "Ceiling work", mainLineName: "Ceiling", roomId: "room", roomName: "Hall", specification: null,
      quantity: 2, included: true, rate: 1, ratePaise: 100, amount: 2, amountPaise: 200, classification: "standard", pricingMode: "sub_vendor", rateSource: "manual",
      dimensionsMandatory: true, dimensions: { length: "2", width: "1", height: "9" }, dimensionRule: rule };
    const estimate = { lineItems: [line] } as unknown as Parameters<typeof assertCurrentConfiguredPublication>[0];
    await expect(assertCurrentConfiguredPublication(estimate)).resolves.toBeUndefined();
    line.dimensionsMandatory = false;
    await expect(assertCurrentConfiguredPublication(estimate)).rejects.toMatchObject({ code: "ESTIMATE_CONFIGURATION_CHANGED" });
    line.dimensionsMandatory = true;
    line.dimensionRule = { ...rule, decimalScale: 3 };
    await expect(assertCurrentConfiguredPublication(estimate)).rejects.toMatchObject({ code: "ESTIMATE_CONFIGURATION_CHANGED" });
    source.line.dimensionsMandatory = false;
    line.dimensionsMandatory = false;
    await expect(assertCurrentConfiguredPublication(estimate)).resolves.toBeUndefined();
  });
});
