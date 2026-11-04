import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";
import { responsibilityCategories } from "../src/domain/user-responsibilities.js";

describe("user responsibility read contract", () => {
  it("documents bounded queries and a minimal full-count projection", () => {
    const operation = openApiDocument.paths["/admin/users/{userId}/responsibilities"]!.get!;
    expect(operation).toHaveProperty("responses.2XX.content.application/json.schema.properties.data.$ref", "#/components/schemas/UserResponsibilitiesPage");
    expect(operation.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "destinationRole", in: "query" }),
      expect.objectContaining({ name: "limit", schema: expect.objectContaining({ minimum: 1, maximum: 100, default: 20 }) }),
      expect.objectContaining({ name: "offset", schema: expect.objectContaining({ minimum: 0, default: 0 }) })
    ]));
    const schemas = openApiDocument.components.schemas;
    expect(schemas.UserResponsibilitiesPage).toHaveProperty("properties.counts.required", responsibilityCategories);
    expect(schemas.UserResponsibilitiesPage).toHaveProperty("properties.items.maxItems", 100);
    expect(schemas.UserResponsibilityRow).toHaveProperty("properties.project.properties.projectNumber.readOnly", true);
    expect(schemas.UserResponsibilityRow).toHaveProperty("additionalProperties", false);
    expect(schemas.UserResponsibilityRow).not.toHaveProperty("properties.email");
    expect(schemas.UserResponsibilityRow).not.toHaveProperty("properties.financials");
  });
});
