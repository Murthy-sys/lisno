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
