import { describe, expect, it } from "vitest";
import { estimateDraftFingerprint } from "./estimateDraftFingerprint";
import type { ConfiguredEstimateLineInput, EstimateDraftInput } from "./leadsApi";

const line: ConfiguredEstimateLineInput = {
  source: "configuration", id: "saved", catalogueId: "finish", roomId: "living", roomName: "Living Room",
  mainBasketId: "basket", subBasketId: "sub", mainLineId: "finish", revisionId: "revision", uomId: "unit",
  included: true, quantity: 2, ratePaise: 2000, dimensions: { length: "2", width: "1", height: "3" }
};
const draft: EstimateDraftInput = {
  propertyType: "Villa", bedroomCount: 2, rooms: [{ id: "living", label: "Living Room", length: 10, width: 10 }, { id: "bed", label: "Bedroom" }],
  scopes: [], lineItems: [line, { ...line, id: "saved-bed", roomId: "bed", roomName: "Bedroom", quantity: 3 }]
};

describe("estimate draft semantic comparison", () => {
  it("ignores catalogue row order, room ordering, object key order and explicit hydration defaults", () => {
    const hydrated: EstimateDraftInput = {
      ...draft, selectedMainBasketIds: ["basket"], selectedMainBasketClassifications: [{ mainBasketId: "basket", classification: "standard" }],
      rooms: [{ label: "Bedroom", id: "bed" }, { width: 10, length: 10, label: "Living Room", id: "living" }],
      lineItems: [...draft.lineItems].reverse().map(value => ({ ...value, classification: "standard" as const, modeTier: "signature" as const, rateSource: "manual" as const,
        selectedInHouseComponentIds: [], recommendationSourceMainLineIds: [], dimensions: { height: "3.00", width: "1.0", length: "2.00" } }))
    };
    expect(estimateDraftFingerprint(hydrated)).toBe(estimateDraftFingerprint(draft));
  });

  it.each([
    { quantity: 9 }, { included: false }, { ratePaise: 2500 }, { modeTier: "premium" as const },
    { pricingMode: "pmc" as const }, { selectedInHouseComponentIds: ["component"] },
    { recommendationSourceMainLineIds: ["source"] }, { dimensions: { length: "2", width: "1", height: "" } }
  ])("keeps a real local change dirty: %j", change => {
    expect(estimateDraftFingerprint({ ...draft, lineItems: [{ ...line, ...change }, draft.lineItems[1]!] }))
      .not.toBe(estimateDraftFingerprint(draft));
  });

  it("detects room measurements and line-to-room identity changes", () => {
    expect(estimateDraftFingerprint({ ...draft, rooms: [{ ...draft.rooms[0], length: 12 }, draft.rooms[1]!] }))
      .not.toBe(estimateDraftFingerprint(draft));
    expect(estimateDraftFingerprint({ ...draft, lineItems: [{ ...line, roomId: "other" }, draft.lineItems[1]!] }))
      .not.toBe(estimateDraftFingerprint(draft));
  });
});
