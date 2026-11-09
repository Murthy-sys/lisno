import { describe, expect, it } from "vitest";
import { unchangedSavedEstimatePrice } from "../src/domain/estimate-price-ownership.js";

const saved = { id: "saved-id", source: "configuration", catalogueId: "source-a", mainLineId: "source-a",
  roomId: "room-a", roomName: "Study", mainBasketId: "basket-a", subBasketId: "sub-a", uomId: "uom-a",
  itemType: "main_line", classification: "special", pricingMode: "in_house", modeTier: "premium",
  rateSource: "manual", ratePaise: 1234, quantity: 2, included: true, revisionId: "saved-revision",
  sourceItemVersion: 2, sourceRevisionVersion: 3, selectedInHouseComponentIds: ["part-a", "part-b"] };
const input = { ...saved, itemVersion: 2, revisionVersion: 3 };
const current = { revisionId: "current-revision", itemVersion: 5, revisionVersion: 6 };

describe("unchanged saved estimation prices", () => {
  it("requires a real explicit ID and preserves exact saved rates while quantity or inclusion changes", () => {
    expect(unchangedSavedEstimatePrice(input, undefined, current)).toBe(false);
    expect(unchangedSavedEstimatePrice({ ...input, id: undefined }, saved, current)).toBe(false);
    expect(unchangedSavedEstimatePrice({ ...input, quantity: 9, included: false }, saved, current)).toBe(true);
    expect(unchangedSavedEstimatePrice({ ...input, rateSource: undefined }, saved, current)).toBe(true);
    expect(unchangedSavedEstimatePrice({ ...input, selectedInHouseComponentIds: ["part-b", "part-a"] }, saved, current)).toBe(true);
  });
  it.each(["id", "catalogueId", "mainLineId", "roomId", "roomName", "mainBasketId", "subBasketId", "uomId", "itemType", "classification", "pricingMode", "modeTier", "rateSource", "ratePaise", "pricingBasis"])(
    "does not preserve a changed %s", field => {
      expect(unchangedSavedEstimatePrice({ ...input, [field]: field === "ratePaise" ? 1235 : "other" }, saved, current)).toBe(false);
    });
  it("rejects copied components, source switching, re-inclusion and fabricated revisions", () => {
    for (const changed of [{ source: "legacy" }, { selectedInHouseComponentIds: ["part-a"] }, { revisionId: "fabricated" },
      { revisionVersion: 10 }, { itemVersion: 5 }, { revisionId: current.revisionId, itemVersion: 5, revisionVersion: 3 }]) {
      expect(unchangedSavedEstimatePrice({ ...input, ...changed }, saved, current)).toBe(false);
    }
    expect(unchangedSavedEstimatePrice(input, { ...saved, included: false }, current)).toBe(false);
    expect(unchangedSavedEstimatePrice({ ...input, ...current }, saved, current)).toBe(true);
  });
  it("preserves component amounts only with the saved fingerprint and quantity", () => {
    const prior = { ...saved, pricingBasis: "in_house_components_v1", ratePaise: null, componentPricing: { inputFingerprint: "stored" } };
    const line = { ...input, pricingBasis: "in_house_components_v1", ratePaise: null, componentPricingFingerprint: "stored" };
    expect(unchangedSavedEstimatePrice(line, prior, current)).toBe(true);
    expect(unchangedSavedEstimatePrice({ ...line, quantity: 3 }, prior, current)).toBe(false);
    expect(unchangedSavedEstimatePrice({ ...line, componentPricingFingerprint: "forged" }, prior, current)).toBe(false);
  });
  it("requires exact legacy identity and rate, allowing only saved rows to remain historical", () => {
    const old = { id: "legacy-id", source: "legacy", catalogueId: "old", roomName: "Study", unit: "Each", specification: "Old", rate: 12.34, included: true };
    expect(unchangedSavedEstimatePrice({ ...old, quantity: 4 }, old)).toBe(true);
    for (const changed of [{ id: undefined }, { id: "copied" }, { unit: "Other" }, { specification: "New" }, { rate: 13 }]) {
      expect(unchangedSavedEstimatePrice({ ...old, ...changed }, old)).toBe(false);
    }
    expect(unchangedSavedEstimatePrice({ ...old, source: "legacy" }, saved)).toBe(false);
  });
});
