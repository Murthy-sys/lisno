import { describe, expect, it } from "vitest";
import { userAuthorizationVersion } from "../src/domain/user-authorization-version.js";
import { normalizeUserLocation, userLocationSchema } from "../src/domain/user-location.js";
import { UserModel } from "../src/models/User.js";
import { openApiDocument } from "../src/openapi.js";

const user = (location: unknown) => new UserModel({
  _id: "location-user", name: "Location User", email: "location@example.test", emailNormalized: "location@example.test",
  passwordHash: "test-only", role: "designer", location
});

describe("user location contract", () => {
  it("normalizes optional Unicode city/area metadata and its length boundary", () => {
    expect(normalizeUserLocation(undefined)).toBeNull();
    expect(normalizeUserLocation(null)).toBeNull();
    expect(normalizeUserLocation("   ")).toBeNull();
    expect(normalizeUserLocation("  ಬೆಂಗಳೂರು / Whitefield  ")).toBe("ಬೆಂಗಳೂರು / Whitefield");
    expect(normalizeUserLocation("x".repeat(120))).toHaveLength(120);
  });

  it.each(["x".repeat(121), "Bengaluru\n", "\tPune", "Pune\u0000", 123, {}, [], true])("rejects invalid raw location %j", async (location) => {
    expect(userLocationSchema.safeParse(location).success).toBe(false);
    await expect(user(location).validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("normalizes persisted user values and accepts older unset records", async () => {
    for (const [input, expected] of [["  Mysuru  ", "Mysuru"], [" ", null], [undefined, null]] as const) {
      const record = user(input);
      await expect(record.validate()).resolves.toBeUndefined();
      expect(record.location).toBe(expected);
    }
  });

  it("documents location in administrative inputs and responses without exposing it through public inspection", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.UserLocation).toMatchObject({ type: "string", nullable: true, maxLength: 120 });
    expect(schemas.ManagedUserUpdateRequest.oneOf).toHaveLength(4);
    expect(schemas.ManagedUserUpdateRequest.oneOf[2]).toMatchObject({ additionalProperties: false, required: ["version", "location"] });
    expect(schemas.CreateUserInvitationRequest.properties.location).toEqual({ $ref: "#/components/schemas/UserLocation" });
    expect(schemas.UserDirectoryItem.properties.location).toEqual({ $ref: "#/components/schemas/UserLocation" });
    expect(schemas.UserInvitationItem.properties.location).toEqual({ $ref: "#/components/schemas/UserLocation" });
    expect(schemas.InvitationInspectRequest.properties).not.toHaveProperty("location");
    expect(openApiDocument.paths["/admin/users/{userId}"].patch.requestBody).toMatchObject({ content: { "application/json": { schema: { $ref: "#/components/schemas/ManagedUserUpdateRequest" } } } });
  });
});


describe("user authorization version", () => {
  it("preserves historical version fences and excludes only counted profile writes", () => {
    expect(userAuthorizationVersion({ version: 7 })).toBe(7);
    expect(userAuthorizationVersion({ version: 10, profileVersionOffset: 3 })).toBe(7);
    expect(userAuthorizationVersion({ version: 11, profileVersionOffset: 3 })).toBe(8);
  });
  it.each([{ version: 0 }, { version: 3, profileVersionOffset: -1 }, { version: 3, profileVersionOffset: 3 }, { version: 3, profileVersionOffset: 0.5 }])("fails closed on corrupt version metadata %j", value => {
    expect(() => userAuthorizationVersion(value)).toThrow("User authorization version is invalid.");
  });
});
