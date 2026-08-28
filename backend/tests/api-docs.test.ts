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

  it("contains all 142 routes without versioning paths twice", () => {
    const methods = new Set(["get", "post", "put", "patch", "delete"]);
    const operationCount = Object.values(openApiDocument.paths).reduce(
      (total, pathItem) =>
        total + Object.keys(pathItem).filter((method) => methods.has(method)).length,
      0
    );

    expect(operationCount).toBe(HUMAN_JWT_OPERATION_LIST.length + 13);
    expect(operationCount).toBe(142);
    expect(Object.keys(openApiDocument.paths).some((path) =>
      path.startsWith("/api/v1")
    )).toBe(false);
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
