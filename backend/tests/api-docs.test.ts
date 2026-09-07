import SwaggerParser from "@apidevtools/swagger-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  HUMAN_JWT_OPERATION_LIST,
  splitHumanOperationKey
} from "../src/domain/route-operations.js";
import {
  openApiDocument,
  openApiPathForRoute
} from "../src/openapi.js";

const app = createApp({
  auth: {
    jwtSecret: "api-docs-test-secret-with-enough-entropy",
    jwtExpiresInSeconds: 900
  }
});

type OpenApiObject = Record<string, unknown>;

function componentSchemas(): Record<string, OpenApiObject> {
  return openApiDocument.components.schemas as Record<string, OpenApiObject>;
}

describe("OpenAPI and Swagger UI", () => {
  it("is a structurally valid OpenAPI document with resolvable references", async () => {
    await expect(
      SwaggerParser.validate(structuredClone(openApiDocument) as never)
    ).resolves.toMatchObject({ openapi: "3.0.3" });
  });

  it("serves a public OpenAPI document with local API and JWT configuration", async () => {
    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/json");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.body).toMatchObject({
      openapi: "3.0.3",
      info: { title: "Lisno API" },
      servers: [{ url: "/api/v1" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          },
          workerBearerAuth: { type: "http", scheme: "bearer" },
          extractionClaimToken: {
            type: "apiKey",
            in: "header",
            name: "X-Extraction-Claim-Token"
          }
        }
      }
    });
    expect(response.body.paths["/auth/login"].post.security).toEqual([]);
    expect(response.body.paths["/projects"].get.security).toEqual([
      { bearerAuth: [] }
    ]);
  });

  it("serves Swagger HTML, local assets, and a locked-down initializer", async () => {
    const page = await request(app).get("/api-docs/");

    expect(page.status).toBe(200);
    expect(page.type).toBe("text/html");
    expect(page.text).toContain("<title>Lisno API documentation</title>");
    expect(page.text).toContain(
      '<meta name="robots" content="noindex, nofollow" />'
    );
    expect(page.text).toContain("./swagger-ui.css");
    expect(page.text).not.toMatch(/cdn\.|unpkg|jsdelivr/iu);
    expect(page.headers["content-security-policy"]).toContain(
      "script-src 'self'"
    );
    expect(page.headers["x-frame-options"]).toBe("DENY");

    const stylesheet = await request(app).get("/api-docs/swagger-ui.css");
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.type).toMatch(/text\/css/iu);
    expect(stylesheet.headers["cache-control"]).toBe(
      "public, max-age=86400"
    );

    const initializer = await request(app).get(
      "/api-docs/swagger-ui-init.js"
    );
    expect(initializer.status).toBe(200);
    expect(initializer.type).toMatch(/javascript/iu);
    expect(initializer.text).toMatch(/"url":\s*"\/openapi\.json"/u);
    expect(initializer.text).toMatch(/"validatorUrl":\s*null/u);
    expect(initializer.text).toMatch(/"persistAuthorization":\s*false/u);
    expect(initializer.headers["cache-control"]).toBe("no-store");
  });

  it("documents generic direct spending without the receipt-backed Procurement class", () => {
    const requestSchema = componentSchemas().FinanceLedgerEntryRequest as {
      oneOf: Array<{
        properties: { expenseClass?: { enum?: unknown[] } };
      }>;
    };
    expect(requestSchema.oneOf[0]?.properties.expenseClass?.enum).toEqual([
      "employee_payment",
      "other"
    ]);

    const readSchema = componentSchemas().FinanceLedgerEntry as {
      properties: { expenseClass?: { enum?: unknown[] } };
    };
    expect(readSchema.properties.expenseClass?.enum).toContain("procurement");
  });

  it("documents bounded Super Admin dashboard reads and explicit units", () => {
    const overview = openApiDocument.paths["/admin/dashboard/overview"]?.get;
    const projects = openApiDocument.paths["/admin/dashboard/projects"]?.get;
    const workforce = openApiDocument.paths["/admin/dashboard/workforce"]?.get;
    for (const operation of [overview, projects, workforce]) {
      expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      expect(operation?.["x-lisno-permission"]).toBe("admin.dashboard.read");
    }
    expect((projects?.parameters as Array<{ name: string; schema: Record<string, unknown> }>))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "limit", schema: expect.objectContaining({ maximum: 50 }) }),
        expect.objectContaining({ name: "periodDays", schema: expect.objectContaining({ enum: [7, 30, 90] }) })
      ]));
    expect(componentSchemas()).toHaveProperty("DashboardRatio");
    expect(componentSchemas()).toHaveProperty("DashboardDataQuality");
    expect(componentSchemas()).toHaveProperty("SuperAdminDashboardOverview");
    const schemas = componentSchemas() as Record<string, {
      additionalProperties?: boolean;
      properties?: Record<string, unknown>;
    }>;
    expect(schemas.SuperAdminDashboardOverview?.additionalProperties).toBe(false);
    expect(schemas.SuperAdminDashboardOverview?.properties?.projects).toEqual({
      $ref: "#/components/schemas/DashboardProjectsMetrics"
    });
    expect(schemas.SuperAdminDashboardProjectPage?.properties?.items).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/DashboardProjectRow" }
    });
    expect(schemas.SuperAdminDashboardWorkforcePage?.properties?.items).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/DashboardWorkforceRow" }
    });
    expect(schemas.DashboardProjectRow?.additionalProperties).toBe(false);
    expect(schemas.DashboardWorkforceRow?.additionalProperties).toBe(false);
  });

  it("keeps the documentation surface read-only, narrow, and configurable", async () => {
    const methodRejected = await request(app).post("/api-docs/");
    expect(methodRejected.status).toBe(405);
    expect(methodRejected.headers.allow).toBe("GET, HEAD");
    expect(methodRejected.body.error.code).toBe("METHOD_NOT_ALLOWED");

    const hiddenVendorPage = await request(app).get(
      "/api-docs/oauth2-redirect.html"
    );
    expect(hiddenVendorPage.status).toBe(404);

    const disabled = createApp({
      auth: {
        jwtSecret: "disabled-api-docs-secret-with-enough-entropy",
        jwtExpiresInSeconds: 900
      },
      apiDocsEnabled: false
    });
    expect((await request(disabled).get("/api-docs/")).status).toBe(404);
    expect((await request(disabled).get("/openapi.json")).status).toBe(404);
  });

  it("documents every canonical human route with bearer security and path parameters", () => {
    for (const registered of HUMAN_JWT_OPERATION_LIST) {
      const { method, path } = splitHumanOperationKey(registered.key);
      const documented = openApiDocument.paths[openApiPathForRoute(path)]?.[
        method.toLowerCase()
      ];

      expect(documented, registered.key).toBeDefined();
      expect(documented?.security, registered.key).toEqual([
        { bearerAuth: [] }
      ]);
      expect(documented?.["x-lisno-permission"], registered.key).toBe(
        registered.permission
      );

      const expectedParameters = Array.from(
        path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu),
        (match) => match[1]
      );
      const documentedParameters = (
        (documented?.parameters ?? []) as Array<{
          name?: string;
          in?: string;
          required?: boolean;
        }>
      )
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);
      expect(documentedParameters, registered.key).toEqual(
        expectedParameters
      );
    }
  });

  it("contains all 189 routes without versioning paths twice", () => {
    const methods = new Set(["get", "post", "put", "patch", "delete"]);
    const operationCount = Object.values(openApiDocument.paths).reduce(
      (total, pathItem) =>
        total + Object.keys(pathItem).filter((method) => methods.has(method)).length,
      0
    );

    expect(operationCount).toBe(HUMAN_JWT_OPERATION_LIST.length + 13);
    expect(operationCount).toBe(189);
    expect(Object.keys(openApiDocument.paths).some((path) =>
      path.startsWith("/api/v1")
    )).toBe(false);
  });

  it("documents all AI Estimator Knowledge operations with exact schemas and 422", () => {
    const knowledgeOperations = HUMAN_JWT_OPERATION_LIST.filter(
      ({ availability }) => availability === "ai_estimator_knowledge"
    );
    expect(knowledgeOperations).toHaveLength(44);

    for (const registered of knowledgeOperations) {
      const { method, path } = splitHumanOperationKey(registered.key);
      const documented = openApiDocument.paths[openApiPathForRoute(path)]?.[
        method.toLowerCase()
      ];
      expect(documented?.tags, registered.key).toEqual([
        "AI Estimator Knowledge"
      ]);
      expect(documented?.responses?.["422"], registered.key).toEqual({
        $ref: "#/components/responses/UnprocessableKnowledge"
      });
      if (method !== "GET") {
        expect(documented?.requestBody, registered.key).toMatchObject({
          required: true,
          "x-lisno-schema-completeness": "exact",
          content: {
            "application/json": {
              schema: { $ref: expect.stringMatching(/^#\/components\/schemas\/Knowledge/u) }
            }
          }
        });
      }
      expect(documented?.requestBody, registered.key).not.toMatchObject({
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/GenericJsonObject" }
          }
        }
      });
    }

    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/main-lines/{mainLineId}/revisions/{revisionId}/sections/{sectionKey}"
      ]?.put?.parameters
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "sectionKey",
        schema: { $ref: "#/components/schemas/KnowledgeSectionKey" }
      })
    ]));
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/main-lines/{mainLineId}/revisions/{revisionId}/sections/{sectionKey}"
      ]?.get?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgeSectionEnvelope" }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/main-lines/{mainLineId}/revisions/{revisionId}/sections/{sectionKey}"
      ]?.put?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgeSectionMutationEnvelope" }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/main-lines/{mainLineId}/revisions/{revisionId}/sections/{sectionKey}"
      ]?.put?.responses?.["503"]
    ).toEqual({ $ref: "#/components/responses/ServiceUnavailable" });
    expect(componentSchemas().KnowledgeSectionMutationEnvelope).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(["version", "aggregateVersion"]),
      properties: {
        version: { type: "integer", minimum: 1 },
        aggregateVersion: { type: "integer", minimum: 1 }
      }
    });

    const previewRequest = componentSchemas().KnowledgePreviewRequest as {
      additionalProperties?: boolean;
      properties: Record<string, unknown>;
    };
    const contextRequest = componentSchemas().KnowledgeContextRequest as {
      additionalProperties?: boolean;
      required?: string[];
      properties: Record<string, unknown>;
      allOf?: unknown[];
    };
    const previewResponse = componentSchemas().KnowledgePreview as {
      properties: Record<string, unknown>;
    };
    expect(previewRequest.additionalProperties).toBe(false);
    expect(previewRequest.properties).not.toHaveProperty("finalPrice");
    expect(contextRequest.additionalProperties).toBe(false);
    expect(contextRequest.required).toEqual(["mainBasketId", "mainLineId"]);
    expect(contextRequest.properties).not.toHaveProperty("name");
    expect(contextRequest.properties.modeKind).toMatchObject({
      type: "string",
      enum: ["pmc", "execution"]
    });
    expect(contextRequest.properties.executionSource).toMatchObject({
      type: "string",
      enum: ["sub_vendor", "in_house"]
    });
    expect(contextRequest.allOf).toEqual([
      { not: { required: ["modeId", "modeKind"] } },
      {
        anyOf: [
          { not: { required: ["executionSource"] } },
          {
            required: ["modeKind"],
            properties: { modeKind: { enum: ["execution"] } }
          }
        ]
      }
    ]);
    expect(previewRequest.properties).not.toHaveProperty("modeKind");
    expect(previewResponse.properties).not.toHaveProperty("finalPrice");

    const sectionPayload = componentSchemas().KnowledgeSectionPayload as {
      anyOf: Array<{
        description?: string;
        additionalProperties?: boolean;
        properties?: Record<string, unknown>;
      }>;
    };
    const advancedPayload = sectionPayload.anyOf.find((schema) =>
      schema.description?.startsWith("advanced section payload"));
    expect(advancedPayload).toMatchObject({
      additionalProperties: false,
      properties: {
        modeConfigurations: {
          type: "array",
          items: { $ref: "#/components/schemas/KnowledgeModeConfiguration" }
        }
      }
    });
    expect(componentSchemas().KnowledgeModeConfiguration).toMatchObject({
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "modeKind", "fields"],
          properties: {
            modeKind: { enum: ["pmc"] },
            fields: {
              type: "array",
              maxItems: 50,
              items: { $ref: "#/components/schemas/KnowledgeModeFieldInput" }
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "modeKind", "executionSource", "fields"],
          properties: {
            modeKind: { enum: ["execution"] },
            executionSource: { enum: ["sub_vendor", "in_house"] },
            fields: {
              type: "array",
              maxItems: 50,
              items: { $ref: "#/components/schemas/KnowledgeModeFieldInput" }
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          deprecated: true,
          required: ["id", "modeKind", "fields"],
          properties: {
            modeKind: { enum: ["execution"] },
            fields: {
              type: "array",
              maxItems: 50,
              items: { $ref: "#/components/schemas/KnowledgeModeFieldInput" }
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "modeId", "fields"],
          properties: {
            modeId: { deprecated: true },
            fields: {
              type: "array",
              maxItems: 50,
              items: { $ref: "#/components/schemas/KnowledgeModeFieldInput" }
            }
          }
        }
      ]
    });
    expect(componentSchemas().KnowledgeModeField).toMatchObject({
      oneOf: [
        { $ref: "#/components/schemas/KnowledgeModeNonChoiceField" },
        { $ref: "#/components/schemas/KnowledgeModeChoiceField" }
      ]
    });
    expect(componentSchemas().KnowledgeModeNonChoiceField).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "label", "options"],
      properties: {
        type: {
          enum: ["text", "textarea", "number", "checkbox"]
        },
        options: { type: "array", maxItems: 0 }
      }
    });
    expect(componentSchemas().KnowledgeModeChoiceField).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "label", "options"],
      properties: {
        type: { enum: ["radio", "dropdown"] },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 240,
            pattern: "^\\S(?:[\\s\\S]*\\S)?$"
          }
        }
      }
    });
    expect(componentSchemas().KnowledgeModeNonChoiceField).not.toHaveProperty("properties.value");
    expect(componentSchemas().KnowledgeModeChoiceField).not.toHaveProperty("properties.value");
    expect(componentSchemas().KnowledgeValuedModeField).toMatchObject({
      oneOf: [
        { $ref: "#/components/schemas/KnowledgeValuedNonChoiceModeField" },
        { $ref: "#/components/schemas/KnowledgeValuedChoiceModeField" }
      ]
    });
    expect(componentSchemas().KnowledgeValuedNonChoiceModeField).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "label", "options", "value"],
      properties: {
        value: {
          oneOf: [
            { type: "string", maxLength: 4_000, nullable: true },
            { type: "boolean" }
          ]
        }
      }
    });
    expect(componentSchemas().KnowledgeValuedNonChoiceModeField).toMatchObject({
      properties: {
        type: { enum: ["text", "textarea", "number", "checkbox"] },
        options: { type: "array", maxItems: 0 }
      }
    });
    expect(componentSchemas().KnowledgeValuedChoiceModeField).toMatchObject({
      properties: {
        type: { enum: ["radio", "dropdown"] },
        options: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          items: { pattern: "^\\S(?:[\\s\\S]*\\S)?$" }
        },
        value: {
          oneOf: [
            { type: "string", maxLength: 4_000, nullable: true },
            { type: "boolean" }
          ]
        }
      }
    });

    const pricingPayload = sectionPayload.anyOf.find((schema) =>
      schema.description?.startsWith("pricing section payload"));
    expect(pricingPayload).toMatchObject({
      additionalProperties: false,
      properties: {
        specifications: {
          type: "array",
          maxItems: 50,
          items: { $ref: "#/components/schemas/KnowledgeSpecification" }
        },
        priceEntries: {
          type: "array",
          items: { $ref: "#/components/schemas/KnowledgePriceEntryCommand" },
          description: expect.stringContaining("null Specification scope")
        }
      }
    });
    expect(componentSchemas().KnowledgeSpecification).toEqual({
      description: "A descriptive Specification row for current writes, or an unchanged stored typed row retained for compatibility.",
      oneOf: [
        { $ref: "#/components/schemas/KnowledgeDescriptiveSpecification" },
        { $ref: "#/components/schemas/KnowledgeCanonicalSpecification" }
      ]
    });
    expect(componentSchemas().KnowledgeDescriptiveSpecification).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "name"],
      example: {
        id: "specification-plywood",
        name: "Plywood",
        description: "18 mm BWP-grade plywood for the cabinet carcass."
      }
    });
    expect(componentSchemas().KnowledgeLegacySpecification).toMatchObject({
      deprecated: true,
      allOf: [{ $ref: "#/components/schemas/KnowledgeDescriptiveSpecification" }]
    });
    expect(componentSchemas().KnowledgeCanonicalSpecification).toMatchObject({
      deprecated: true,
      description: expect.stringContaining("Compatibility-only"),
      "x-lisno-field-types": ["text", "textarea", "number", "radio", "dropdown", "checkbox"],
      example: {
        id: "specification-finish",
        name: "Finish",
        description: "Choose the approved finish.",
        type: "dropdown",
        options: ["Matte", "Gloss"],
        value: "Matte"
      },
      oneOf: expect.arrayContaining([
        expect.objectContaining({
          required: ["id", "name", "type", "options", "value"],
          properties: expect.objectContaining({
            type: { type: "string", enum: ["number"] },
            value: expect.objectContaining({
              pattern: "^(0|[1-9][0-9]*)(\\.[0-9]{1,6})?$"
            })
          })
        }),
        expect.objectContaining({
          properties: expect.objectContaining({
            type: { type: "string", enum: ["checkbox"] },
            value: { type: "boolean" }
          })
        }),
        expect.objectContaining({
          properties: expect.objectContaining({
            type: { type: "string", enum: ["dropdown"] },
            options: expect.objectContaining({
              minItems: 1,
              maxItems: 50,
              uniqueItems: true,
              description: expect.stringContaining("normalized, case-insensitive")
            }),
            value: expect.objectContaining({
              description: "Null or one of the configured options."
            })
          })
        })
      ])
    });
    expect(componentSchemas().KnowledgeBudgetSetCommand).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "operation", "vendorId", "uomId", "inputAmountPaise",
        "effectiveFrom", "effectiveTo"
      ],
      description: expect.stringContaining("business-only Budgeting command"),
      properties: {
        operation: { type: "string", enum: ["set_budget"] },
        sourcePriceVersionId: expect.objectContaining({ nullable: true }),
        inputAmountPaise: expect.objectContaining({
          type: "integer",
          minimum: 0,
          description: expect.stringContaining("derived by the server")
        })
      }
    });
    expect(componentSchemas().KnowledgeBudgetSetCommand.required).not.toContain("sourcePriceVersionId");
    expect(componentSchemas().KnowledgeBudgetSetCommand.properties).not.toHaveProperty("taxRuleId");
    expect(componentSchemas().KnowledgePriceEntryAppendCommand).toMatchObject({
      type: "object",
      additionalProperties: false,
      deprecated: true,
      description: expect.stringContaining("Compatibility-only"),
      required: expect.arrayContaining(["operation", "specificationId", "inputAmountPaise"]),
      properties: {
        operation: { type: "string", enum: ["append"] },
        specificationId: {
          type: "string",
          nullable: true,
          enum: [null],
          description: expect.stringContaining("not a price dimension")
        },
        inputAmountPaise: expect.objectContaining({
          type: "integer",
          minimum: 0,
          description: expect.stringContaining("integer paise")
        })
      }
    });
    expect(componentSchemas().KnowledgePriceEntryReferenceCommand).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["operation", "priceEntryId", "priceVersionId"],
      properties: {
        operation: { type: "string", enum: ["reference"] },
        priceVersionId: expect.objectContaining({
          description: expect.stringContaining("historical versions may retain")
        })
      }
    });
    expect(componentSchemas().KnowledgePriceEntryCommand).toEqual({
      oneOf: [
        { $ref: "#/components/schemas/KnowledgeBudgetSetCommand" },
        { $ref: "#/components/schemas/KnowledgePriceEntryAppendCommand" },
        { $ref: "#/components/schemas/KnowledgePriceEntryReferenceCommand" }
      ]
    });
    expect(componentSchemas().KnowledgeSlabRate).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "specificationId", "uomId", "quantity", "unitRatePaise"],
      description: expect.stringContaining("neither accepted nor stored"),
      properties: {
        specificationId: expect.any(Object),
        uomId: expect.any(Object),
        quantity: expect.objectContaining({
          description: expect.stringContaining("UOM decimalScale")
        }),
        unitRatePaise: expect.objectContaining({
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER
        })
      }
    });
    expect(componentSchemas().KnowledgeQuantitySlab).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["id", "minimumQuantity", "maximumQuantity", "adjustmentBps"]
    });
    expect(componentSchemas().KnowledgeContextRequest).toMatchObject({
      properties: {
        specificationId: expect.objectContaining({
          description: expect.stringContaining("never changes price resolution")
        })
      }
    });
    expect(componentSchemas().KnowledgeSectionReferenceState).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["specificationIds"],
      properties: {
        specificationIds: {
          type: "array",
          uniqueItems: true,
          description: expect.stringMatching(/priced quantity slabs.*Response-only removal guidance/u),
          items: expect.any(Object)
        }
      }
    });
    expect(componentSchemas().KnowledgeSectionEnvelope).toMatchObject({
      properties: {
        referenceState: { $ref: "#/components/schemas/KnowledgeSectionReferenceState" }
      }
    });
    expect(componentSchemas().KnowledgeSectionMutationEnvelope).toMatchObject({
      properties: {
        referenceState: { $ref: "#/components/schemas/KnowledgeSectionReferenceState" }
      }
    });

    expect(componentSchemas().KnowledgePriority).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: expect.not.arrayContaining(["semanticTier", "dependencyEpoch"]),
      properties: {
        masterType: { type: "string", enum: ["priorities"] },
        semanticTier: {
          type: "string",
          enum: ["non_negotiable", "high", "medium", "low"],
          readOnly: true
        }
      }
    });
    expect(componentSchemas().KnowledgePriority.properties).not.toHaveProperty("dependencyEpoch");
    expect(componentSchemas().KnowledgePriority.properties).not.toHaveProperty("decimalScale");
    expect(componentSchemas().KnowledgePriorityPage).toMatchObject({
      properties: {
        items: {
          type: "array",
          items: { $ref: "#/components/schemas/KnowledgePriority" }
        }
      }
    });

    expect(componentSchemas().KnowledgeSurface).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining(["id", "code", "name"]),
      properties: {
        masterType: { type: "string", enum: ["surfaces"] }
      }
    });
    expect(componentSchemas().KnowledgeSurface.properties).not.toHaveProperty("typicalUomIds");
    expect(componentSchemas().KnowledgeSurface.properties).not.toHaveProperty("dependencyEpoch");
    expect(componentSchemas().KnowledgeSurface.properties).not.toHaveProperty("decimalScale");
    expect(componentSchemas().KnowledgeSurfacePage).toMatchObject({
      properties: {
        items: {
          type: "array",
          items: { $ref: "#/components/schemas/KnowledgeSurface" }
        }
      }
    });
    expect(componentSchemas().KnowledgeSurfaceCreateRequest).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        code: expect.any(Object)
      }
    });
    expect(componentSchemas().KnowledgeSurfaceCreateRequest.properties).not.toHaveProperty("typicalUomIds");
    expect(componentSchemas().KnowledgeSurfaceUpdateRequest).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["expectedVersion"]
    });
    expect(componentSchemas().KnowledgeSurfaceUpdateRequest.properties).not.toHaveProperty("typicalUomIds");

    for (const method of ["get", "post", "patch", "delete"] as const) {
      expect(
        openApiDocument.paths[
          method === "get" || method === "post"
            ? "/admin/ai-estimator-knowledge/surfaces"
            : "/admin/ai-estimator-knowledge/surfaces/{id}"
        ]?.[method]?.responses?.["2XX"]
      ).toMatchObject({
        content: {
          "application/json": {
            schema: {
              properties: {
                data: method === "get"
                  ? { $ref: "#/components/schemas/KnowledgeSurfacePage" }
                  : { $ref: "#/components/schemas/KnowledgeSurface" }
              }
            }
          }
        }
      });
    }

    expect(
      openApiDocument.paths["/admin/ai-estimator-knowledge/surfaces"]?.post
        ?.requestBody
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/KnowledgeSurfaceCreateRequest" }
        }
      }
    });
    expect(
      openApiDocument.paths["/admin/ai-estimator-knowledge/surfaces/{id}"]?.patch
        ?.requestBody
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/KnowledgeSurfaceUpdateRequest" }
        }
      }
    });

    for (const schemaName of ["KnowledgeMasterCreateRequest", "KnowledgeMasterUpdateRequest"] as const) {
      const writeSchema = componentSchemas()[schemaName] as {
        properties: Record<string, unknown>;
      };
      expect(writeSchema.properties, schemaName).not.toHaveProperty("semanticTier");
      expect(writeSchema.properties, schemaName).not.toHaveProperty("dependencyEpoch");
    }

    expect(
      openApiDocument.paths["/admin/ai-estimator-knowledge/priorities"]?.get
        ?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgePriorityPage" }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths["/admin/ai-estimator-knowledge/priorities"]?.post
        ?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgePriority" }
            }
          }
        }
      }
    });

    const createRequestNames = [
      "KnowledgeBasketCreateRequest",
      "KnowledgeMainLineCreateRequest",
      "KnowledgeMasterCreateRequest",
      "KnowledgeUomCreateRequest",
      "KnowledgeSurfaceCreateRequest",
      "KnowledgeTaxCreateRequest"
    ] as const;
    const basketResponse = componentSchemas().KnowledgeBasket as {
      required?: string[];
      properties: Record<string, { maximum?: number }>;
    };
    for (const schemaName of createRequestNames) {
      const createRequest = componentSchemas()[schemaName] as {
        required?: string[];
        properties: Record<string, { default?: unknown; deprecated?: boolean; maximum?: number }>;
      };
      expect(createRequest.required, schemaName).not.toContain("displayOrder");
      expect(createRequest.properties.displayOrder, schemaName).toMatchObject({
        deprecated: true,
        maximum: Number.MAX_SAFE_INTEGER
      });
      expect(createRequest.properties.displayOrder, schemaName).not.toHaveProperty("default");
    }
    expect(basketResponse.required).toContain("displayOrder");
    expect(basketResponse.properties.displayOrder).toMatchObject({
      maximum: Number.MAX_SAFE_INTEGER
    });

    const permanentDeleteRequest = componentSchemas()
      .KnowledgePermanentDeleteBasketRequest as {
        additionalProperties?: boolean;
        required?: string[];
        properties?: Record<string, unknown>;
      };
    expect(permanentDeleteRequest).toMatchObject({
      additionalProperties: false,
      required: ["expectedVersion", "confirmationName", "reason"],
      properties: {
        expectedVersion: { type: "integer", minimum: 1 },
        confirmationName: { type: "string", minLength: 1, maxLength: 240 },
        reason: { type: "string", minLength: 1, maxLength: 1_000 }
      }
    });

    const impact = componentSchemas().KnowledgeBasketDeletionImpact as {
      additionalProperties?: boolean;
      required?: string[];
      properties?: Record<string, unknown>;
    };
    /* The impact reports what a deletion carries away; nothing can block one. */
    expect(impact).toMatchObject({
      additionalProperties: false,
      required: [
        "basketId",
        "basketName",
        "version",
        "mainLineCount",
        "historicalReferenceCount",
        "bootstrapOwned"
      ],
      properties: {
        mainLineCount: { type: "integer", minimum: 0 },
        historicalReferenceCount: { type: "integer", minimum: 0 }
      }
    });
    expect(componentSchemas().KnowledgeBasketDeletionBlocker).toBeUndefined();
    expect(componentSchemas().KnowledgeMainLineDeletionResult).toMatchObject({
      additionalProperties: false,
      required: ["mainLineId", "deleted", "deletedAt"]
    });
    expect(componentSchemas().KnowledgePermanentDeleteBasketResult).toMatchObject({
      additionalProperties: false,
      required: ["basketId", "deleted", "deletedAt"],
      properties: {
        deleted: { type: "boolean", enum: [true] },
        deletedAt: { type: "string", format: "date-time" }
      }
    });

    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/baskets/{basketId}/deletion-impact"
      ]?.get?.["x-lisno-permission"]
    ).toBe("ai_estimator_knowledge.configuration.lifecycle");
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/baskets/{basketId}/deletion-impact"
      ]?.get?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgeBasketDeletionImpact" }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/baskets/{basketId}"
      ]?.delete?.requestBody
    ).toMatchObject({
      required: true,
      "x-lisno-schema-completeness": "exact",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/KnowledgePermanentDeleteBasketRequest"
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/ai-estimator-knowledge/baskets/{basketId}"
      ]?.delete?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/KnowledgePermanentDeleteBasketResult" }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths["/admin/ai-estimator-knowledge/baskets/{basketId}"]
        ?.delete?.summary
    ).toBe("Permanently delete a knowledge Basket and everything in it");
  });

  it("documents exact workflow multipart contracts and separate worker security", () => {
    expect(
      openApiDocument.paths["/estimates/{estimateId}/design-uploads"]?.post
        ?.requestBody
    ).toMatchObject({
      required: true,
      content: {
        "multipart/form-data": {
          schema: { $ref: "#/components/schemas/FileUploadRequest" }
        }
      },
      "x-lisno-schema-completeness": "exact"
    });
    expect(
      openApiDocument.paths[
        "/admin/design-plan-response-tasks/{roundId}/decision"
      ]?.post?.requestBody
    ).toMatchObject({
      content: {
        "multipart/form-data": {
          schema: {
            $ref: "#/components/schemas/DesignPlanProxyDecisionRequest"
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/design-plan-response-tasks/{roundId}/email/retry"
      ]?.post
    ).toMatchObject({
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/DesignPlanEmailRetryRequest"
            }
          }
        },
        "x-lisno-schema-completeness": "exact"
      },
      responses: {
        "2XX": {
          content: {
            "application/json": {
              schema: {
                properties: {
                  data: { $ref: "#/components/schemas/DesignPlanReviewTask" }
                }
              }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths["/workflow-tasks/{taskId}"]?.patch?.requestBody
    ).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/WorkflowTaskProgressRequest"
          }
        }
      },
      "x-lisno-schema-completeness": "exact"
    });
    expect(
      openApiDocument.paths["/workflow-tasks/{taskId}"]?.patch?.responses?.[
        "2XX"
      ]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/ProjectWorkflowTask" }
            }
          }
        }
      }
    });
    const designAttachment = openApiDocument.paths[
      "/admin/design-plan-response-tasks/{roundId}/attachments/{attachmentIndex}"
    ]?.get;
    expect(designAttachment?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "roundId", in: "path", required: true }),
      expect.objectContaining({
        name: "attachmentIndex",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 0 }
      })
    ]));
    expect(
      Object.keys(designAttachment?.responses?.["200"]?.content ?? {})
    ).toEqual(expect.arrayContaining([
      "application/pdf",
      "image/png",
      "image/heic"
    ]));
    expect(
      openApiDocument.paths["/internal/extraction-jobs/{jobId}/complete"]
        ?.post?.security
    ).toEqual([
      { workerBearerAuth: [], extractionClaimToken: [] }
    ]);
    expect(
      openApiDocument.paths["/leads/{leadId}/estimate/submit"]?.post
        ?.responses?.["2XX"]
    ).toMatchObject({
      content: { "application/json": expect.any(Object) }
    });

    const uploadResponses = openApiDocument.paths[
      "/estimates/{estimateId}/design-uploads"
    ]?.post?.responses;
    expect(uploadResponses?.["413"]).toEqual({
      $ref: "#/components/responses/PayloadTooLarge"
    });
    expect(uploadResponses?.["415"]).toEqual({
      $ref: "#/components/responses/UnsupportedMediaType"
    });

    const sourceContent = (
      openApiDocument.paths["/internal/extraction-jobs/{jobId}/source"]?.get
        ?.responses?.["200"]?.content as OpenApiObject
    );
    expect(Object.keys(sourceContent)).toEqual(expect.arrayContaining([
      "application/pdf",
      "image/png",
      "image/heic"
    ]));
    expect(
      openApiDocument.paths["/internal/extraction-jobs/claim"]?.post
        ?.responses?.["503"]
    ).toEqual({ $ref: "#/components/responses/ServiceUnavailable" });
    expect(
      openApiDocument.paths["/internal/extraction-jobs/{jobId}/complete"]
        ?.post?.responses?.["404"]
    ).toEqual({ $ref: "#/components/responses/NotFound" });
  });

  it("captures required bodies, conditional proof decisions, and worker payloads", () => {
    expect(openApiDocument.paths["/projects"]?.post?.requestBody).toMatchObject({
      required: true,
      "x-lisno-schema-completeness": "generic"
    });

    const schemas = componentSchemas();
    expect(schemas.DesignPlanProxyDecisionRequest?.oneOf).toHaveLength(2);
    expect(schemas.ExtractionCompletionRequest?.oneOf).toEqual([
      { $ref: "#/components/schemas/ProjectDesignCompletion" },
      { $ref: "#/components/schemas/EstimateDesignCompletion" }
    ]);
    expect(
      (schemas.ExtractionFailureRequest?.properties as OpenApiObject).code
    ).toMatchObject({
      enum: [
        "PDF_RENDER_FAILED",
        "OCR_FAILED",
        "INVALID_SOURCE",
        "RESULT_REJECTED"
      ]
    });
    expect(schemas.FileUploadRequest?.additionalProperties).toBe(false);
    expect(
      openApiDocument.paths[
        "/execution/section-worker-assignments/override"
      ]?.post
    ).toMatchObject({
      requestBody: {
        required: true,
        "x-lisno-schema-completeness": "exact",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/SectionWorkerAssignmentOverrideRequest"
            }
          }
        }
      },
      responses: {
        "2XX": {
          content: {
            "application/json": {
              schema: {
                properties: {
                  data: {
                    $ref: "#/components/schemas/ProjectWorkflowSectionAssignment"
                  }
                }
              }
            }
          }
        }
      }
    });
    expect(
      openApiDocument.paths[
        "/admin/projects/{projectId}/section-assignments"
      ]?.get?.responses?.["2XX"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: {
                $ref: "#/components/schemas/ProjectWorkflowSectionAssignmentList"
              }
            }
          }
        }
      }
    });
    expect(schemas.SectionWorkerAssignmentOverrideRequest).toMatchObject({
      additionalProperties: false,
      required: [
        "projectId",
        "estimateId",
        "designPlanVersion",
        "sourceSectionId",
        "expectedRevision",
        "workerId"
      ],
      properties: {
        expectedRevision: { pattern: "^[a-f0-9]{64}$" },
        workerId: { nullable: true }
      }
    });
    const sectionAssignment = schemas.ProjectWorkflowSectionAssignment;
    const sectionProperties = sectionAssignment?.properties as OpenApiObject;
    expect(schemas.WorkerRole).toEqual({
      type: "string",
      enum: [
        "worker_electrician",
        "worker_plumber",
        "worker_carpenter",
        "worker_painter",
        "worker_civil",
        "worker_other"
      ]
    });
    expect(sectionAssignment?.additionalProperties).toBe(false);
    expect(sectionProperties.assigneeRole).toEqual({
      $ref: "#/components/schemas/WorkerRole"
    });
    expect(sectionProperties.revision).toMatchObject({
      pattern: "^[a-f0-9]{64}$"
    });
    const assignedWorkerProperties = (
      (sectionProperties.assignedWorker as OpenApiObject).properties
    ) as OpenApiObject;
    expect(assignedWorkerProperties).toMatchObject({
      active: { type: "boolean" }
    });
    expect(assignedWorkerProperties.role).toEqual({
      $ref: "#/components/schemas/WorkerRole"
    });
  });

  it("defines unambiguous Super Admin Finance labels and live calculations", () => {
    const schemas = componentSchemas();
    const bucket = schemas.ProjectFinanceBucket;
    const bucketProperties = bucket?.properties as Record<string, OpenApiObject>;
    const summary = schemas.ProjectFinancePortfolioSummary;
    const summaryProperties = summary?.properties as Record<string, OpenApiObject>;

    expect(bucket?.description).toContain(
      "not finalized actual profit until the project is closed"
    );
    expect(bucketProperties.approvedContractTotalPaise).toMatchObject({
      title: "Client-approved amount (including GST)",
      description: expect.stringContaining(
        "approvedSubtotalPaise + approvedGstPaise"
      )
    });
    expect(bucketProperties.targetProfitPaise).toMatchObject({
      title: "Target profit (20%)",
      description: expect.stringContaining("approvedSubtotalPaise x 20%")
    });
    expect(bucketProperties.costBudgetPaise).toMatchObject({
      title: "Cost budget (80%)",
      description: "approvedSubtotalPaise - targetProfitPaise."
    });
    expect(bucketProperties.currentProfitPaise).toMatchObject({
      title: "Current profit (live)",
      description: expect.stringContaining(
        "approvedSubtotalPaise - recordedCostPaise"
      )
    });
    expect(bucketProperties.overheadPaise).toMatchObject({
      title: "Recorded overheads",
      description: expect.stringContaining(
        "Deadline risk never fabricates or estimates a monetary overhead"
      )
    });
    expect(bucketProperties.deadlineStatus).toMatchObject({
      title: "Deadline risk status",
      description: expect.stringContaining("It does not change overheadPaise")
    });

    expect(schemas.ProjectFinanceBucketPage?.description).toContain(
      "not only the current page"
    );
    expect(summary?.description).toContain(
      "all authorized projects with a Client-approved Estimate"
    );
    expect(summaryProperties.approvedContractTotalPaise).toMatchObject({
      title: "Accumulated Client-approved amount"
    });
    expect(summaryProperties.currentMarginBps?.description).toContain(
      "not an average of project margins"
    );
    expect(summaryProperties.overdueTaskCount?.description).toContain(
      "no automatic monetary overhead"
    );
  });

  it("documents high-value query and public error contracts", () => {
    const kpiParameters = openApiDocument.paths["/kpis/users/{userId}"]?.get
      ?.parameters as Array<OpenApiObject>;
    expect(kpiParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "from", required: true }),
      expect.objectContaining({ name: "to", required: true })
    ]));

    const invitationParameters = openApiDocument.paths[
      "/admin/user-invitations"
    ]?.get?.parameters as Array<OpenApiObject>;
    expect(invitationParameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["search", "role", "status", "deliveryStatus"])
    );
    const accessRequestParameters = openApiDocument.paths[
      "/access-requests/review"
    ]?.get?.parameters as Array<OpenApiObject>;
    expect(accessRequestParameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["limit", "offset", "status", "module"])
    );
    expect(
      openApiDocument.paths["/auth/user-invitations/inspect"]?.post
        ?.responses?.["410"]
    ).toEqual({ $ref: "#/components/responses/Gone" });
    expect(
      openApiDocument.paths["/auth/client-signup"]?.post?.responses?.["401"]
    ).toEqual({ $ref: "#/components/responses/AuthenticationRequired" });
  });

  it("does not expose persistence-only credential or storage fields", () => {
    const serialized = JSON.stringify(openApiDocument);

    for (const forbidden of [
      "passwordHash",
      "tokenHash",
      "storedFileReference",
      "clientEmailNormalized",
      "extractionClaimTokenHash"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps unrelated unknown paths on the normal JSON 404 contract", async () => {
    const response = await request(app).get("/api-docs-unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found."
      }
    });
  });
});
