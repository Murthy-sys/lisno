import { describe, expect, it } from "vitest";
import { Bath, Bed, Leaf, Pencil, ShowerHead } from "lucide-react";
import { getBedroomCount, getEstimateRoomDefinitions, getRoomIcon, isValidBedroomCount, mergeSelectedRoomDefinitions, parseBedroomCount, requiresBedroomCount } from "./estimateRoomOptions";

const commonTypes = ["living", "kitchen", "balcony", "foyer", "study", "bath_c", "custom"];

describe("estimate room profiles", () => {
  it.each([["1BHK", 1], ["2BHK", 2], ["2.5BHK", 2], ["3BHK", 3], ["3.5BHK", 3], ["4BHK", 4]] as const)("derives %s rooms and independent accessories", (propertyType, count) => {
    const rooms = getEstimateRoomDefinitions(propertyType, 50);
    expect(getBedroomCount(propertyType, 50)).toBe(count);
    expect(rooms).toHaveLength(7 + count * 3);
    expect(rooms.map((room) => room.typeId)).toEqual(expect.arrayContaining(commonTypes));
    for (let index = 1; index <= count; index += 1) {
      expect(rooms.find((room) => room.label === `Bedroom ${index}`)?.typeId).toBe(index === 1 ? "master" : `bedroom${index}`);
      expect(rooms.find((room) => room.label === `Bedroom ${index} Balcony`)).toMatchObject({ typeId: `balcony_bedroom${index}`, group: "Bedrooms" });
      expect(rooms.find((room) => room.label === `Bedroom ${index} Bathroom`)).toMatchObject({ typeId: index === 1 ? "bath_m" : `bath_bedroom${index}`, group: "Bathrooms" });
    }
    expect(rooms.some((room) => room.label === `Bedroom ${count + 1}`)).toBe(false);
    expect(new Set(rooms.map((room) => room.typeId)).size).toBe(rooms.length);
  });

  it.each(["Villa", "Duplex", "Penthouse", " PENT HOUSE "])("requires an explicit valid count for %s", (propertyType) => {
    expect(requiresBedroomCount(propertyType)).toBe(true);
    expect(getEstimateRoomDefinitions(propertyType, null).map((room) => room.typeId)).toEqual(commonTypes);
    for (const count of [1, 5, 50]) expect(getEstimateRoomDefinitions(propertyType, count)).toHaveLength(7 + count * 3);
    for (const count of [0, -1, 1.5, 51, Infinity]) expect(getEstimateRoomDefinitions(propertyType, count)).toHaveLength(7);
  });

  it("offers a combined Studio living area and common choices without bedroom slots", () => {
    const rooms = getEstimateRoomDefinitions("Studio", 5);
    expect(rooms.map((room) => room.typeId)).toEqual(commonTypes);
    expect(rooms[0]).toMatchObject({ typeId: "living", label: "Living / Sleeping Area" });
    expect(getBedroomCount(" studio ", null)).toBe(0);
  });

  it("keeps unknown historical properties readable without guessing bedroom counts", () => {
    expect(getEstimateRoomDefinitions("Heritage residence", 10).map((room) => room.typeId)).toEqual(commonTypes);
    expect(getBedroomCount("Heritage residence", 10)).toBeNull();
  });

  it.each(["", " ", "0", "-1", "1.5", "51", "Infinity", "abc", "1e1"])("rejects invalid input %j", (input) => {
    expect(parseBedroomCount(input)).toBeNull();
  });

  it("validates bounds without coercing contract values", () => {
    expect(parseBedroomCount("1")).toBe(1);
    expect(parseBedroomCount("50")).toBe(50);
    expect(isValidBedroomCount("5")).toBe(false);
    expect(isValidBedroomCount(null)).toBe(false);
    expect(getBedroomCount(" 2.5 BHK ", null)).toBe(2);
  });

  it("preserves saved labels and out-of-profile or unknown selections without duplicate aliases", () => {
    const selected = [
      { id: "old-1", typeId: "master", label: "Master Bedroom", length: 12, width: 10 },
      { id: "old-bath", typeId: "bath_m", label: "Master Bathroom" },
      { id: "old-3", typeId: "bedroom3", label: "Guest suite" },
      { id: "custom-1", typeId: "music_room", label: "Music room" }
    ];
    const initial = structuredClone(selected);
    const merged = mergeSelectedRoomDefinitions(getEstimateRoomDefinitions("1BHK", null), selected);
    expect(merged.filter((room) => room.typeId === "master")).toEqual([{ typeId: "master", label: "Master Bedroom", group: "Bedrooms", sqft: 200 }]);
    expect(merged.find((room) => room.typeId === "bath_m")?.label).toBe("Master Bathroom");
    expect(merged.filter((room) => room.group === "Previously selected").map((room) => room.label)).toEqual(["Guest suite", "Music room"]);
    expect(selected).toEqual(initial);
    expect(mergeSelectedRoomDefinitions(getEstimateRoomDefinitions("3BHK", null), selected).find((room) => room.typeId === "bedroom3")).toMatchObject({ label: "Guest suite", group: "Bedrooms" });
  });

  it("uses established room-kind icons for generated and historical rooms", () => {
    expect(getRoomIcon("bedroom50")).toBe(Bed);
    expect(getRoomIcon("bath_m")).toBe(Bath);
    expect(getRoomIcon("bath_bedroom50")).toBe(ShowerHead);
    expect(getRoomIcon("balcony_bedroom50")).toBe(Leaf);
    expect(getRoomIcon("music_room")).toBe(Pencil);
  });
});
