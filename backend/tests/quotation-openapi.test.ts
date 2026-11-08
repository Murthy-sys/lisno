import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi.js";
import { HUMAN_JWT_OPERATIONS } from "../src/domain/route-operations.js";

describe("quotation recommendation public contract", () => {
  it("documents optional mode requests and safe mode choices with separate actor authority", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    const operations = schemas.QuotationPatch.properties.operations.items.oneOf;
    for (const operation of operations.slice(0, 2)) {
      expect(operation.properties.pricingMode.enum).toEqual(["pmc", "sub_vendor", "in_house"]);
      expect(operation.required).not.toContain("pricingMode");
      expect(operation.properties).not.toHaveProperty("classification");
    }
    expect(schemas.Quotation.properties.canChangePricingMode.type).toBe("boolean");
    for (const name of ["QuotationLine", "QuotationCandidate"]) {
      expect(schemas[name].properties.classification.enum).toEqual(["standard", "special"]);
      expect(schemas[name].properties.pricingModeChoices.items.properties.choices.items).toEqual({ $ref: "#/components/schemas/EstimateTierChoice" });
    }
    expect(schemas.NumberedEstimateRecord.description).toContain("canChangePricingMode");
  });
  it("registers the recommendation query as a project-scoped read without new catalogue privileges", () => {
    const key = "POST /projects/:projectId/quotation/recommendations/query";
    expect(HUMAN_JWT_OPERATIONS[key]).toMatchObject({ permission: "estimation.quotation.read",
      scope: { kind: "project", module: "projects" }, operationClass: "read" });
    const operation = openApiDocument.paths["/projects/{projectId}/quotation/recommendations/query"].post!;
    expect(operation.requestBody).toMatchObject({ required: true, content: { "application/json": {
      schema: { $ref: "#/components/schemas/QuotationRecommendationQuery" } } } });
    expect(operation.responses["2XX"]).toMatchObject({ content: { "application/json": { schema: {
      properties: { data: { $ref: "#/components/schemas/QuotationRecommendations" } } } } } });
  });

  it("documents bounded draft sources and basket filters for server-side candidate search", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.QuotationRecommendationQuery.properties.sources.maxItems).toBe(200);
    expect(schemas.QuotationRecommendationQuery.properties.limit.maximum).toBe(20);
    expect(schemas.QuotationRecommendationQuery.required).toEqual(["expectedVersion", "roomId", "sources"]);
    const parameters = openApiDocument.paths["/projects/{projectId}/quotation/items"].get!.parameters ?? [];
    expect(parameters.map(parameter => "name" in parameter ? parameter.name : null)).toEqual(expect.arrayContaining(["projectId", "search", "mainBasketId", "subBasketId", "offset", "limit"]));
  });

  it("documents the canonical quotation-approval fields on every current-state DTO", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    const fields = ["quotationApprovalState", "currentQuotationApproved", "requiresClientReapproval",
      "quotationApprovalSource", "currentQuotationApproval"];
    for (const schema of ["Quotation", "NumberedEstimateRecord", "NullableNumberedEstimateRecord",
      "AdminProjectEstimateSummary", "ClientEstimateReviewItem", "DesignPlanTask"]) {
      expect(Object.keys(schemas[schema].properties)).toEqual(expect.arrayContaining(fields));
    }
    expect(schemas.CurrentQuotationApproval.required).toEqual([
      "kind", "reviewRoundId", "estimateVersion", "approvedAt"
    ]);
    expect(schemas.DesignPlanTask.properties.estimationWorkflowVersion.enum).toEqual([2, 3]);
  });

  it("maps quotation mutation responses to the canonical estimate approval projection", () => {
    for (const [path, method] of [
      ["/leads/{leadId}/estimate/submit", "post"],
      ["/estimates/{estimateId}/send-client", "post"],
      ["/estimates/{estimateId}/enable-collaboration", "post"],
      ["/estimates/{estimateId}/withdraw-review", "post"],
      ["/estimates/{estimateId}/unlock", "post"]
    ] as const) {
      expect(openApiDocument.paths[path][method]!.responses["2XX"]).toMatchObject({
        content: { "application/json": { schema: { properties: {
          data: { $ref: "#/components/schemas/NumberedEstimateRecord" }
        } } } }
      });
    }
  });

  it("documents optional staff submission preparation separately from saved publication without restricting shared records", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    for (const name of ["NumberedEstimateRecord", "NullableNumberedEstimateRecord"]) {
      expect(schemas[name].description).toContain("canPrepareQuotationSubmission");
      expect(schemas[name].description).toContain("canPublishQuotation");
      expect(schemas[name].description).toContain("already-saved quotation");
      expect(schemas[name].additionalProperties).toBe(true);
      expect(schemas[name].required ?? []).not.toContain("capabilities");
    }
  });
});
