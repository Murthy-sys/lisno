import { describe, expect, it } from "vitest";
import { PROJECT_LANGUAGES } from "../src/contracts/project-initiation.js";
import { readUserLanguages, userKnownLanguagesSchema, userPreferredLanguageSchema } from "../src/domain/user-languages.js";
import { UserModel } from "../src/models/User.js";
import { openApiDocument } from "../src/openapi.js";

function user(metadata: Record<string, unknown>) {
  return new UserModel({ _id: "language-user", name: "Language User", email: "language@example.test", emailNormalized: "language@example.test", passwordHash: "test-only", role: "designer", ...metadata });
}

describe("user language contract", () => {
  it("defaults historical metadata and orders a known-language set without restricting preference", async () => {
    expect(readUserLanguages({})).toEqual({ languagesKnown: [], preferredLanguage: null });
    expect(readUserLanguages({ languagesKnown: ["kannada", "english"], preferredLanguage: "tamil" })).toEqual({ languagesKnown: ["english", "kannada"], preferredLanguage: "tamil" });
    const record = user({ languagesKnown: ["kannada", "english"], preferredLanguage: "tamil" });
    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.languagesKnown).toEqual(["english", "kannada"]);
    expect(record.preferredLanguage).toBe("tamil");
    await expect(user({}).validate()).resolves.toBeUndefined();
  });

  it.each([null, "english", 123, {}, ["english", "english"], ["unsupported"], [1], [null], ["English"]])("rejects invalid known languages before persistence: %j", async languagesKnown => {
    expect(userKnownLanguagesSchema.safeParse(languagesKnown).success).toBe(false);
    await expect(user({ languagesKnown }).validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it.each(["", "unsupported", 123, [], {}, true])("rejects invalid preferred language before persistence: %j", async preferredLanguage => {
    expect(userPreferredLanguageSchema.safeParse(preferredLanguage).success).toBe(false);
    await expect(user({ preferredLanguage }).validate()).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("documents the strict pair and private administrative response fields", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.UserKnownLanguages).toMatchObject({ uniqueItems: true, maxItems: PROJECT_LANGUAGES.length, items: { enum: [...PROJECT_LANGUAGES] } });
    expect(schemas.ManagedUserUpdateRequest.oneOf[3]).toMatchObject({ additionalProperties: false, required: ["version", "languagesKnown", "preferredLanguage"] });
    for (const name of ["CreateUserInvitationRequest", "UserInvitationItem", "UserDirectoryItem"]) {
      expect(schemas[name].properties.languagesKnown).toEqual({ $ref: "#/components/schemas/UserKnownLanguages" });
      expect(schemas[name].properties.preferredLanguage).toEqual({ $ref: "#/components/schemas/UserPreferredLanguage" });
    }
    expect(schemas.InvitationInspectRequest.properties).not.toHaveProperty("languagesKnown");
    expect(schemas.InvitationInspectRequest.properties).not.toHaveProperty("preferredLanguage");
  });
});
