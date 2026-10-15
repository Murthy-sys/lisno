import { describe, expect, it } from "vitest";

import {
  assignEstimateItem,
  autoMapDrawingTitle,
  mappingContextForEstimate
} from "../src/domain/estimate-design-mapping.js";

const estimate = {
  rooms: [
    { id: "room-bedroom-1", label: "Bedroom 1" },
    { id: "room-bedroom-2", label: "Bedroom 2" }
  ],
  scopes: ["CA"],
  lineItems: [
    { catalogueId: "CA01", roomName: "Bedroom 1", specification: "BWR ply + veneer + polish", included: true },
    { catalogueId: "CA01", roomName: "Bedroom 2", specification: "MDF + PU paint", included: true },
    { catalogueId: "CA02", roomName: "Bedroom 1", specification: "Swing door - veneer", included: false }
  ]
};

describe("estimate design mapping", () => {
  it("maps configured Main Lines by saved room and basket IDs without a legacy catalogue prefix", () => {
    const configured = mappingContextForEstimate({
      rooms: [{ id: "room-a", label: "Shared room" }, { id: "room-b", label: "Shared room" }],
      scopes: [], selectedMainBasketIds: ["basket-lower"],
      lineItems: [{ source: "configuration", roomId: "room-b", roomName: "Shared room",
        catalogueId: "main-line-lower", mainLineId: "main-line-lower", mainLineName: "Custom console",
        mainBasketId: "basket-lower", subBasketId: "sub-lower", subBasketName: "Custom units", included: true }]
    });
    expect(configured.invalidIncludedItems).toEqual([]);
    expect(assignEstimateItem({ roomId: "room-b", catalogueId: "main-line-lower" }, configured))
      .toMatchObject({ scopeSectionId: "basket-lower", mappingStatus: "estimator_assigned" });
    expect(autoMapDrawingTitle("Custom console", configured).mapping)
      .toMatchObject({ roomId: "room-b", scopeSectionId: "basket-lower" });
  });
  it("maps direct temporary items by their real basket and rejects a false ordinary direct parent", () => {
    const line = {
      source: "configuration", itemType: "temporary", roomId: "room-a", roomName: "Living room",
      catalogueId: "temporary-a", mainLineId: "temporary-a", mainLineName: "Custom finish",
      mainBasketId: "basket-a", subBasketId: null, subBasketName: null, included: true
    };
    const input = { rooms: [{ id: "room-a", label: "Living room" }], lineItems: [line] };
    const direct = mappingContextForEstimate(input);
    expect(direct.invalidIncludedItems).toEqual([]);
    expect(autoMapDrawingTitle("Custom finish", direct).mapping)
      .toMatchObject({ catalogueId: "temporary-a", scopeSectionId: "basket-a" });
    expect(mappingContextForEstimate({ ...input, lineItems: [{ ...line, itemType: "main_line" }] })
      .invalidIncludedItems).toMatchObject([{ catalogueId: "temporary-a", reason: "unknown_catalogue" }]);
  });
  it("maps TV UNIT - BEDROOM 1 to the one included exact item", () => {
    expect(autoMapDrawingTitle("TV UNIT - BEDROOM 1", mappingContextForEstimate(estimate))).toEqual({
      mapping: { roomId: "room-bedroom-1", catalogueId: "CA01", scopeSectionId: "CA", mappingStatus: "auto_mapped" },
      reason: "unique",
      candidateKeys: ["room-bedroom-1\u0000CA01"]
    });
  });

  it("uses derived room and item aliases without case or punctuation sensitivity", () => {
    expect(autoMapDrawingTitle("Tv Console / Bed 1 - Elevation", mappingContextForEstimate(estimate)).mapping).toEqual({
      roomId: "room-bedroom-1", catalogueId: "CA01", scopeSectionId: "CA", mappingStatus: "auto_mapped"
    });
  });

  it("does not map an item to the wrong room when the mentioned room lacks it", () => {
    const onlyBedroomOne = { ...estimate, lineItems: estimate.lineItems.filter((line) => line.roomName !== "Bedroom 2") };
    expect(autoMapDrawingTitle("TV UNIT - BEDROOM 2", mappingContextForEstimate(onlyBedroomOne))).toMatchObject({
      mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" }, reason: "absent"
    });
  });

  describe.each(["configuration", "legacy"] as const)("numbered bedroom accessories with %s items", (source) => {
    const accessoryContext = (accessory: "Balcony" | "Bathroom", accessoryIncluded = true) => {
      const rooms = [
        { id: "room-bedroom-1", label: "Bedroom 1" },
        { id: "room-accessory-1", label: `Bedroom 1 ${accessory}` }
      ];
      return mappingContextForEstimate({
        rooms, scopes: ["FC"], lineItems: rooms.map((room, index) => source === "configuration" ? {
          source, roomId: room.id, roomName: room.label,
          catalogueId: "ceiling-main-line", mainLineId: "ceiling-main-line", mainLineName: "Ceiling",
          mainBasketId: "ceiling-basket", subBasketId: "ceiling-sub-basket", subBasketName: "Ceilings",
          included: index === 0 || accessoryIncluded
        } : {
          catalogueId: "FC01", roomName: room.label, specification: "Gypsum",
          included: index === 0 || accessoryIncluded
        })
      });
    };

    it.each(["Balcony", "Bathroom"] as const)("keeps a %s title absent when only its parent bedroom has the item", (accessory) => {
      const context = accessoryContext(accessory, false);
      expect(context.invalidIncludedItems).toEqual([]);
      expect(autoMapDrawingTitle(`Bedroom 1 ${accessory} False Ceiling`, context)).toEqual({
        mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" },
        reason: "absent", candidateKeys: []
      });
    });

    it.each(["Balcony", "Bathroom"] as const)("maps an explicit %s title to its own item when both rooms have it", (accessory) => {
      const context = accessoryContext(accessory);
      const catalogueId = source === "configuration" ? "ceiling-main-line" : "FC01";
      const scopeSectionId = source === "configuration" ? "ceiling-basket" : "FC";
      expect(context.invalidIncludedItems).toEqual([]);
      expect(autoMapDrawingTitle(`Bedroom 1 ${accessory} False Ceiling`, context)).toEqual({
        mapping: { roomId: "room-accessory-1", scopeSectionId, catalogueId, mappingStatus: "auto_mapped" },
        reason: "unique", candidateKeys: [`room-accessory-1\u0000${catalogueId}`]
      });
      expect(autoMapDrawingTitle("Bedroom 1 False Ceiling", context).mapping)
        .toMatchObject({ roomId: "room-bedroom-1", scopeSectionId, catalogueId, mappingStatus: "auto_mapped" });
    });

    it.each([
      "Bedroom 1 Balcony and Bedroom 1 False Ceiling",
      "Bedroom 1 and Bedroom 1 Balcony False Ceiling",
      "BR 1 and Bedroom 1 Balcony False Ceiling"
    ])("preserves separate bedroom mentions in %s", (title) => {
      const catalogueId = source === "configuration" ? "ceiling-main-line" : "FC01";
      expect(autoMapDrawingTitle(title, accessoryContext("Balcony"))).toEqual({
        mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" },
        reason: "ambiguous", candidateKeys: [
          `room-accessory-1\u0000${catalogueId}`, `room-bedroom-1\u0000${catalogueId}`
        ]
      });
    });
  });

  it("keeps identical room labels ambiguous when both configured room identities contain the item", () => {
    const rooms = [
      { id: "room-balcony-a", label: "Bedroom 1 Balcony" },
      { id: "room-balcony-b", label: "Bedroom 1 Balcony" }
    ];
    const context = mappingContextForEstimate({
      rooms, lineItems: rooms.map((room) => ({
        source: "configuration", roomId: room.id, roomName: room.label,
        catalogueId: "ceiling-main-line", mainLineId: "ceiling-main-line", mainLineName: "Ceiling",
        mainBasketId: "ceiling-basket", subBasketId: "ceiling-sub-basket", subBasketName: "Ceilings", included: true
      }))
    });
    expect(context.invalidIncludedItems).toEqual([]);
    expect(autoMapDrawingTitle("Bedroom 1 Balcony Ceiling", context)).toEqual({
      mapping: { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" },
      reason: "ambiguous", candidateKeys: ["room-balcony-a\u0000ceiling-main-line", "room-balcony-b\u0000ceiling-main-line"]
    });
  });

  it.each([
    ["MBR - WARDROBE", "Master Bedroom", "CA02"],
    ["PBR STUDY", "Parents Bedroom", "CA06"],
    ["KBR WARDROBE", "Kids Bedroom", "CA02"],
    ["MBR DRESSER UNIT", "Master Bedroom", "CA07"],
    ["COMMON VANITY", "Common", "CA07"]
  ])("maps production room/item shorthand in %s", (title, roomName, catalogueId) => {
    const context = mappingContextForEstimate({ rooms: [{ id: `room-${roomName}`, label: roomName }], scopes: ["CA"], lineItems: [{ catalogueId, roomName, specification: "fixture", included: true }] });
    expect(autoMapDrawingTitle(title, context).mapping).toMatchObject({ roomId: `room-${roomName}`, catalogueId, scopeSectionId: "CA", mappingStatus: "auto_mapped" });
  });

  it("keeps TV UNIT in Misc when that included item exists in two rooms", () => {
    expect(autoMapDrawingTitle("TV UNIT", mappingContextForEstimate(estimate))).toEqual({
      mapping: { roomId: null, catalogueId: null, scopeSectionId: null, mappingStatus: "misc" },
      reason: "ambiguous",
      candidateKeys: ["room-bedroom-1\u0000CA01", "room-bedroom-2\u0000CA01"]
    });
  });

  it("keeps an absent catalogue title in Misc", () => {
    expect(autoMapDrawingTitle("BAR COUNTER - BEDROOM 1", mappingContextForEstimate(estimate))).toMatchObject({
      mapping: { roomId: null, catalogueId: null, scopeSectionId: null, mappingStatus: "misc" }, reason: "absent", candidateKeys: []
    });
  });

  it("assigns only an included room/item pair and derives its scope", () => {
    const context = mappingContextForEstimate(estimate);
    expect(assignEstimateItem({ roomId: "room-bedroom-2", catalogueId: "CA01" }, context)).toEqual({ roomId: "room-bedroom-2", catalogueId: "CA01", scopeSectionId: "CA", mappingStatus: "estimator_assigned" });
    expect(() => assignEstimateItem({ roomId: "room-bedroom-1", catalogueId: "CA02" }, context)).toThrow("The selected estimate item is not included for this room.");
  });

  it.each([
    ["TV UNIT", "CA01", "CA"], ["DINING - SEATER UNIT", "LF02", "LF"], ["PUJA - UNIT", "CA12", "CA"], ["PUJA BACK PANEL", "CA12", "CA"], ["CROCKERY - UNIT", "CA11", "CA"], ["KITCHEN", "CA09", "CA"]
  ])("maps supplied title %s to one included item", (title, catalogueId, scopeSectionId) => {
    const context = mappingContextForEstimate({ rooms: [{ id: "room-bedroom-1", label: "Bedroom 1", aliases: [] }], scopes: ["CA", "LF"], lineItems: ["CA01", "LF02", "CA12", "CA04", "CA11", "CA09"].map((id) => ({ catalogueId: id, roomName: "Bedroom 1", specification: "fixture", included: true })) });
    expect(autoMapDrawingTitle(title, context).mapping).toEqual({ roomId: "room-bedroom-1", catalogueId, scopeSectionId, mappingStatus: "auto_mapped" });
  });
});
