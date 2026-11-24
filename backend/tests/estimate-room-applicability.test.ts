import { describe, expect, it } from "vitest";
import { getEstimateRoomDefinitions, isMainLineApplicableToRoom } from "../src/domain/estimate-room-options.js";

describe("Main Line room applicability", () => {
  it("distinguishes bedroom instances from their attached bathrooms and balconies", () => {
    const rooms = getEstimateRoomDefinitions("3BHK", null);
    expect(rooms.filter(room => isMainLineApplicableToRoom(["bedroom", "living"], room.typeId)).map(room => room.typeId))
      .toEqual(["living", "master", "bedroom2", "bedroom3"]);
    expect(rooms.filter(room => isMainLineApplicableToRoom(["bathroom"], room.typeId))).toHaveLength(4);
    expect(rooms.filter(room => isMainLineApplicableToRoom(["balcony"], room.typeId))).toHaveLength(4);
  });

  it("preserves unrestricted legacy lines and matches Studio and TV Unit by type", () => {
    const rooms = getEstimateRoomDefinitions("Studio", null);
    expect(rooms.filter(room => isMainLineApplicableToRoom(["living", "tv_unit"], room.typeId)).map(room => room.label))
      .toEqual(["Living / Sleeping Area", "TV Unit"]);
    expect(isMainLineApplicableToRoom(["custom"], "custom")).toBe(true);
    expect(isMainLineApplicableToRoom(["custom"], "legacy_name")).toBe(false);
    expect(isMainLineApplicableToRoom(["bedroom"], null)).toBe(false);
    expect(isMainLineApplicableToRoom(undefined, "legacy_name")).toBe(true);
    expect(isMainLineApplicableToRoom([], null)).toBe(true);
  });
});
