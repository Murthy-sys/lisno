import {
  PERMISSION_CODES,
  REQUESTABLE_PROJECT_MODULES
} from "./domain/authorization.js";
import {
  DESIGN_PLAN_STATUSES,
  PROJECT_WORKFLOW_TASK_KINDS,
  PROJECT_WORKFLOW_TASK_STATUSES
} from "./domain/project-workflow.js";
import { ROLE_CODES } from "./domain/roles.js";
import { INVITABLE_ROLE_CODES } from "./domain/user-invitations.js";
import {
  HUMAN_JWT_OPERATION_LIST,
  splitHumanOperationKey,
  type HumanJwtMethod,
  type HumanJwtOperation,
  type HumanJwtOperationKeyShape
} from "./domain/route-operations.js";
import { workerFailureCodes } from "./services/extraction-worker.service.js";

type OpenApiSchema = Readonly<Record<string, unknown>>;
type OpenApiParameter = Readonly<Record<string, unknown>>;
type OpenApiRequestBody = Readonly<Record<string, unknown>>;
type OpenApiResponse = Readonly<Record<string, unknown>>;

interface OpenApiOperation extends Record<string, unknown> {
  readonly tags: readonly string[];
  readonly summary: string;
  readonly operationId: string;
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
}

type OpenApiPathItem = Record<string, OpenApiOperation>;

export interface LisnoOpenApiDocument {
  readonly openapi: "3.0.3";
  readonly info: Readonly<Record<string, unknown>>;
  readonly servers: readonly Readonly<Record<string, unknown>>[];
  readonly tags: readonly Readonly<Record<string, unknown>>[];
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
  readonly components: Readonly<Record<string, unknown>>;
}

const successEnvelopeSchema: OpenApiSchema = {
  type: "object",
  required: ["data"],
  properties: {
    data: { description: "Endpoint-specific response payload." }
  }
};

const jsonSuccessResponse: OpenApiResponse = {
  description: "Successful response.",
  content: {
    "application/json": { schema: successEnvelopeSchema }
  }
};

const standardProtectedErrors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/AuthenticationRequired" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "409": { $ref: "#/components/responses/Conflict" },
  "429": { $ref: "#/components/responses/TooManyRequests" },
  "500": { $ref: "#/components/responses/InternalError" }
} as const satisfies Readonly<Record<string, OpenApiResponse>>;

const genericJsonRequestBody: OpenApiRequestBody = {
  required: true,
  description:
    "This route validates a JSON object. Its exact legacy schema is not yet exported to OpenAPI; consult the route-specific validation errors when integrating.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/GenericJsonObject" }
    }
  },
  "x-lisno-schema-completeness": "generic"
};

const requestBodiesByOperation: Readonly<Record<string, OpenApiRequestBody>> = {
  "POST /auth/login": jsonRequest("LoginRequest"),
  "POST /auth/client-signup": jsonRequest("ClientSignupRequest"),
  "POST /auth/user-invitations/inspect": jsonRequest("InvitationInspectRequest"),
  "POST /auth/user-invitations/accept": jsonRequest("InvitationAcceptRequest"),
  "POST /admin/projects": jsonRequest("AdminProjectInitiationRequest"),
  "POST /admin/projects/:projectId/design-assignment": jsonRequest(
    "DesignerAssignmentRequest"
  ),
  "POST /estimates/:estimateId/assign": jsonRequest(
    "DesignerAssignmentRequest"
  ),
  "POST /estimates/:estimateId/designer-decision": jsonRequest(
    "EstimateDecisionRequest"
  ),
  "POST /client/estimates/:estimateId/decision": jsonRequest(
    "EstimateDecisionRequest"
  ),
  "PUT /leads/:leadId/estimate": jsonRequest("EstimateInput"),
  "POST /estimates/:estimateId/design-uploads": multipartRequest(
    "FileUploadRequest"
  ),
  "POST /tasks/:taskId/design-versions": multipartRequest(
    "FileUploadRequest"
  ),
  "POST /estimate-design-drawings/:drawingId/replacement": multipartRequest(
    "DrawingReplacementRequest"
  ),
  "POST /admin/estimate-client-response-tasks/:roundId/decision":
    multipartRequest("EstimateProxyDecisionRequest"),
  "POST /admin/design-plan-response-tasks/:roundId/decision":
    multipartRequest("DesignPlanProxyDecisionRequest"),
  "POST /estimates/:estimateId/client-email/retry": jsonRequest(
    "EstimateEmailRetryRequest"
  ),
  "POST /internal/extraction-jobs/:jobId/complete": jsonRequest(
    "ExtractionCompletionRequest"
  ),
  "POST /internal/extraction-jobs/:jobId/fail": jsonRequest(
    "ExtractionFailureRequest"
  )
};

const operationsWithoutBodies = new Set<string>([
  "POST /leads/:leadId/estimate/submit",
  "POST /estimates/:estimateId/send-client",
  "POST /estimate-design-uploads/:uploadId/retry",
  "POST /estimates/:estimateId/design-drawings/submit",
  "POST /design-versions/:versionId/retry-extraction",
  "POST /design-versions/:versionId/submit-sections",
  "POST /internal/extraction-jobs/claim",
  "POST /internal/extraction-jobs/:jobId/heartbeat"
]);

const responseSchemaByOperation: Readonly<Record<string, string>> = {
  "POST /auth/login": "AuthPayload",
  "POST /auth/client-signup": "AuthPayload",
  "GET /auth/me": "PublicUser",
  "GET /auth/authorization": "AuthorizationSnapshot",
  "GET /admin/designers": "DesignerOptionList",
  "POST /admin/projects/:projectId/design-assignment": "DesignPlanTask",
  "GET /designer/design-plan-tasks": "DesignPlanTaskList",
  "GET /admin/design-plan-response-tasks": "DesignPlanReviewTaskList",
  "POST /admin/design-plan-response-tasks/:roundId/decision":
    "DesignPlanReviewTask",
  "GET /workflow-tasks": "ProjectWorkflowTaskList"
};

const pdfOperations = new Set<string>([
  "GET /estimates/:estimateId/pdf",
  "GET /client/estimates/:estimateId/pdf",
  "GET /admin/estimate-client-response-tasks/:roundId/pdf"
]);

const imageOperations = new Set<string>([
  "GET /design-source-pages/:pageId/image",
  "GET /design-section-revisions/:revisionId/image",
  "GET /estimate-design-source-pages/:pageId/image",
  "GET /estimate-design-revisions/:revisionId/image",
  "GET /client/estimate-plan-pages/:pageId/thumbnail",
  "GET /client/estimate-plan-pages/:pageId/current-image",
  "GET /estimate-plan-pages/:pageId/current-image"
]);

const attachmentOperations = new Set<string>([
  "GET /design-versions/:versionId/download",
  "GET /admin/estimate-client-response-tasks/:roundId/proof",
  "GET /internal/extraction-jobs/:jobId/source"
]);

const multipartOperations = new Set<string>([
  "POST /estimates/:estimateId/design-uploads",
  "POST /tasks/:taskId/design-versions",
  "POST /estimate-design-drawings/:drawingId/replacement",
  "POST /admin/estimate-client-response-tasks/:roundId/decision",
  "POST /admin/design-plan-response-tasks/:roundId/decision"
]);

const storedAttachmentContentTypes = [
  "application/octet-stream",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic"
] as const;

const operationSummaries: Readonly<Record<string, string>> = {
  "GET /health": "Check API health",
  "POST /auth/login": "Sign in and issue a JWT",
  "POST /auth/client-signup": "Create a Client account",
  "GET /auth/me": "Read the current user",
  "GET /auth/authorization": "Read the current authorization snapshot",
  "POST /auth/user-invitations/inspect": "Inspect a staff invitation",
  "POST /auth/user-invitations/accept": "Accept a staff invitation",
  "GET /admin/projects": "List projects for Admin or Super Admin",
  "POST /admin/projects": "Initiate a project and assign an Estimator",
  "GET /admin/projects/:projectId": "Read Admin project details",
  "GET /admin/designers": "List assignable Designers",
  "POST /admin/projects/:projectId/design-assignment":
    "Assign a Designer to an approved estimate",
  "GET /designer/design-plan-tasks": "List the current Designer's plan work",
  "GET /admin/design-plan-response-tasks":
    "List design-plan Client response tasks",
  "POST /admin/design-plan-response-tasks/:roundId/decision":
    "Record a Client-proxy design-plan decision with proof",
  "GET /workflow-tasks": "List role-specific execution tasks",
  "POST /estimates/:estimateId/design-uploads":
    "Upload a design plan for extraction",
  "GET /estimates/:estimateId/design-uploads":
    "Read design uploads and extracted drawings",
  "POST /estimate-design-uploads/:uploadId/retry":
    "Retry failed design-plan extraction",
  "POST /internal/extraction-jobs/claim": "Claim the next extraction job",
  "GET /internal/extraction-jobs/:jobId/source":
    "Download an extraction job source",
  "POST /internal/extraction-jobs/:jobId/heartbeat":
    "Renew an extraction job lease",
  "POST /internal/extraction-jobs/:jobId/complete":
    "Complete an extraction job",
  "POST /internal/extraction-jobs/:jobId/fail": "Fail an extraction job"
};

const paginationOperationKeys = new Set<string>([
  "GET /projects",
  "GET /client/project-summaries",
  "GET /admin/projects",
  "GET /admin/users",
  "GET /admin/user-invitations",
  "GET /access-requests/mine",
  "GET /access-requests/review",
  "GET /leads",
  "GET /leads/:leadId/activities",
  "GET /tasks/:taskId/events",
  "GET /organization/team",
  "GET /organization/tree",
  "GET /organization/managers/:managerId/designers",
  "GET /kpis/users/:userId/tasks",
  "GET /kpis/users/:userId",
  "GET /evaluations/:subjectId",
  "GET /projects/:projectId/activity",
  "GET /designers/:designerId/audit",
  "GET /audit",
  "GET /projects/:projectId/design-versions",
  "GET /admin/estimate-client-response-tasks"
]);

const statusFilterOperationKeys = new Set<string>([
  "GET /admin/estimate-client-response-tasks",
  "GET /admin/design-plan-response-tasks"
]);

const paginationParameters: readonly OpenApiParameter[] = [
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  },
  {
    name: "offset",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 0, default: 0 }
  }
];

const statusFilterParameter: OpenApiParameter = {
  name: "status",
  in: "query",
  required: false,
  schema: {
    type: "string",
    enum: ["pending", "approved", "changes_requested"]
  }
};

const queryParametersByOperation: Readonly<
  Record<string, readonly OpenApiParameter[]>
> = {
  "GET /admin/estimators": [
    {
      name: "search",
      in: "query",
      required: false,
      schema: { type: "string", maxLength: 100, default: "" }
    },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }
    },
    {
      name: "offset",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 0, default: 0 }
    }
  ],
  "GET /organization/managers": [
    {
      name: "search",
      in: "query",
      required: false,
      schema: { type: "string", maxLength: 100, default: "" }
    },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }
    },
    {
      name: "offset",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 0, default: 0 }
    }
  ],
  "GET /admin/users": [
    {
      name: "search",
      in: "query",
      required: false,
      schema: { type: "string", minLength: 1, maxLength: 200 }
    },
    {
      name: "role",
      in: "query",
      required: false,
      schema: { $ref: "#/components/schemas/Role" }
    },
    {
      name: "active",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["true", "false"] }
    }
  ],
  "GET /access-requests/mine": accessRequestFilterParameters(),
  "GET /access-requests/review": accessRequestFilterParameters(),
  "GET /admin/user-invitations": [
    {
      name: "search",
      in: "query",
      required: false,
      schema: { type: "string", minLength: 1, maxLength: 200 }
    },
    {
      name: "role",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: [...INVITABLE_ROLE_CODES]
      }
    },
    {
      name: "status",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["pending", "delivery_failed", "expired", "revoked", "superseded", "accepted"]
      }
    },
    {
      name: "deliveryStatus",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["queued", "sent", "failed"] }
    }
  ],
  "GET /leads": [
    {
      name: "search",
      in: "query",
      required: false,
      schema: { type: "string" }
    },
    {
      name: "stage",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["new_lead", "contacted", "site_visit", "design_meeting", "estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"]
      }
    }
  ],
  "GET /estimate-plan-change-requests": [
    {
      name: "estimateId",
      in: "query",
      required: false,
      schema: { type: "string", minLength: 1 }
    },
    {
      name: "status",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["open", "resolved"] }
    }
  ],
  "GET /designers/:designerId/audit": [
    {
      name: "sort",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["asc", "desc"] }
    }
  ],
  "GET /audit": [
    ...auditFilterParameters(),
    {
      name: "sort",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["asc", "desc"] }
    }
  ],
  "GET /kpis/users/:userId/tasks": kpiPeriodParameters(),
  "GET /kpis/users/:userId": kpiPeriodParameters()
};

function kpiPeriodParameters(): readonly OpenApiParameter[] {
  return [
    {
      name: "from",
      in: "query",
      required: true,
      schema: { type: "string", format: "date-time" }
    },
    {
      name: "to",
      in: "query",
      required: true,
      schema: { type: "string", format: "date-time" }
    }
  ];
}

function auditFilterParameters(): readonly OpenApiParameter[] {
  return ["actorId", "entityType", "entityId"].map((name) => ({
    name,
    in: "query",
    required: false,
    schema: { type: "string", minLength: 1 }
  }));
}

function accessRequestFilterParameters(): readonly OpenApiParameter[] {
  return [
    {
      name: "status",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["pending", "approved", "rejected", "cancelled"]
      }
    },
    {
      name: "module",
      in: "query",
      required: false,
      schema: { type: "string", enum: [...REQUESTABLE_PROJECT_MODULES] }
    }
  ];
}

const paths: Record<string, OpenApiPathItem> = {};

for (const operation of HUMAN_JWT_OPERATION_LIST) {
  const { method, path } = splitHumanOperationKey(operation.key);
  addOperation(paths, path, method, humanOperation(operation));
}

addOperation(paths, "/health", "GET", publicOperation("GET /health", {
  responses: {
    "200": {
      description: "API is healthy.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["data"],
            properties: {
              data: {
                type: "object",
                required: ["status"],
                properties: { status: { type: "string", enum: ["ok"] } }
              }
            }
          }
        }
      }
    }
  }
}));

addOperation(paths, "/auth/login", "POST", publicOperation("POST /auth/login", {
  requestBody: requestBodiesByOperation["POST /auth/login"],
  responses: publicJsonResponses("AuthPayload", ["400", "401", "429", "500"])
}));

addOperation(
  paths,
  "/auth/client-signup",
  "POST",
  publicOperation("POST /auth/client-signup", {
    requestBody: requestBodiesByOperation["POST /auth/client-signup"],
    responses: publicJsonResponses("AuthPayload", ["400", "401", "409", "429", "500"], "201")
  })
);

addOperation(
  paths,
  "/auth/user-invitations/inspect",
  "POST",
  publicOperation("POST /auth/user-invitations/inspect", {
    tags: ["Invitations"],
    requestBody: requestBodiesByOperation["POST /auth/user-invitations/inspect"],
    responses: publicJsonResponses(undefined, ["400", "404", "410", "429", "500"])
  })
);

addOperation(
  paths,
  "/auth/user-invitations/accept",
  "POST",
  publicOperation("POST /auth/user-invitations/accept", {
    tags: ["Invitations"],
    requestBody: requestBodiesByOperation["POST /auth/user-invitations/accept"],
    responses: publicJsonResponses(undefined, ["400", "404", "409", "410", "429", "500"], "201")
  })
);

addWorkerOperations(paths);

export const openApiDocument: LisnoOpenApiDocument = Object.freeze({
  openapi: "3.0.3",
  info: {
    title: "Lisno API",
    version: "1.0.0",
    description:
      "Interactive documentation for the Lisno role-based design operations API. Use POST /auth/login, copy the returned raw JWT, then select Authorize; Swagger UI adds the Bearer prefix. Protected paths are generated from the canonical authorization registry and expose their required permission through x-lisno-permission. Core workflow schemas are exact; routes marked x-lisno-schema-completeness=generic still enforce their source Zod schema at runtime."
  },
  servers: [{ url: "/api/v1", description: "Current Lisno API host" }],
  tags: [
    tag("Health", "API liveness."),
    tag("Authentication", "Sign-in, Client signup, and current-session identity."),
    tag("Invitations", "Staff invitation administration and public acceptance."),
    tag("Administration", "User and access administration."),
    tag("Projects", "Project initiation, hierarchy, and project reads."),
    tag("Project workflow", "Design assignment, Designer upload work, approvals, and execution handoff."),
    tag("Leads", "Estimator/Sales lead management."),
    tag("Estimates", "Estimate drafting, publication, and Client decisions."),
    tag("Estimate design", "Estimate plan uploads, extraction, drawings, and annotations."),
    tag("Design delivery", "Task design versions, sections, approvals, and downloads."),
    tag("Tasks", "Delivery tasks, deadlines, and task events."),
    tag("Organization", "Teams, hierarchy, KPIs, and evaluations."),
    tag("Audit", "Authorized audit and project activity feeds."),
    tag("OCR worker", "Internal extraction-worker protocol. These routes are mounted only when OCR worker authentication is configured.")
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Human-user JWT returned by POST /auth/login. Paste only the raw token."
      },
      workerBearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Private OCR worker token. This is separate from human-user JWTs."
      },
      extractionClaimToken: {
        type: "apiKey",
        in: "header",
        name: "X-Extraction-Claim-Token",
        description: "Per-job claim token returned when an extraction job is leased."
      }
    },
    schemas: componentSchemas(),
    responses: componentResponses()
  }
});

export function openApiPathForRoute(path: string): string {
  return path.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, "{$1}");
}

function humanOperation(operation: HumanJwtOperation): OpenApiOperation {
  const { method, path } = splitHumanOperationKey(operation.key);
  const parameters = [
    ...pathParameters(path),
    ...(paginationOperationKeys.has(operation.key)
      ? paginationParameters
      : []),
    ...(statusFilterOperationKeys.has(operation.key)
      ? [statusFilterParameter]
      : []),
    ...(queryParametersByOperation[operation.key] ?? [])
  ];
  const requestBody = requestBodyFor(operation.key, method);
  return {
    tags: [tagFor(operation)],
    summary: operationSummaries[operation.key] ?? fallbackSummary(method, path),
    description: protectedDescription(operation),
    operationId: operationId(method, path),
    security: [{ bearerAuth: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: responsesFor(operation.key),
    "x-lisno-permission": operation.permission,
    "x-lisno-operation-class": operation.operationClass,
    "x-lisno-super-admin-behavior": operation.superAdminBehavior,
    "x-lisno-availability": operation.availability
  };
}

function publicOperation(
  key: HumanJwtOperationKeyShape,
  overrides: Partial<OpenApiOperation> = {}
): OpenApiOperation {
  const { method, path } = splitHumanOperationKey(key);
  return {
    tags: [path.startsWith("/auth/user-invitations") ? "Invitations" : path === "/health" ? "Health" : "Authentication"],
    summary: operationSummaries[key] ?? fallbackSummary(method, path),
    operationId: operationId(method, path),
    security: [],
    ...(pathParameters(path).length ? { parameters: pathParameters(path) } : {}),
    responses: { "2XX": jsonSuccessResponse },
    ...overrides
  };
}

function addWorkerOperations(target: Record<string, OpenApiPathItem>) {
  const workerOperations: ReadonlyArray<{
    method: HumanJwtMethod;
    path: string;
    requestBody?: OpenApiRequestBody;
    response?: "json" | "source" | "claim";
    claimToken?: boolean;
  }> = [
    { method: "POST", path: "/internal/extraction-jobs/claim", response: "claim" },
    { method: "GET", path: "/internal/extraction-jobs/:jobId/source", response: "source", claimToken: true },
    { method: "POST", path: "/internal/extraction-jobs/:jobId/heartbeat", claimToken: true },
    {
      method: "POST",
      path: "/internal/extraction-jobs/:jobId/complete",
      requestBody: requestBodiesByOperation["POST /internal/extraction-jobs/:jobId/complete"],
      claimToken: true
    },
    {
      method: "POST",
      path: "/internal/extraction-jobs/:jobId/fail",
      requestBody: requestBodiesByOperation["POST /internal/extraction-jobs/:jobId/fail"],
      claimToken: true
    }
  ];

  for (const operation of workerOperations) {
    const key = `${operation.method} ${operation.path}`;
    let responses: Record<string, OpenApiResponse>;
    if (operation.response === "source") {
      responses = {
        ...binaryResponses(storedAttachmentContentTypes, "Stored extraction source file."),
        "503": { $ref: "#/components/responses/ServiceUnavailable" }
      };
    } else if (operation.response === "claim") {
      responses = {
        "200": jsonSuccessResponse,
        "204": { description: "No extraction job is currently available." },
        "401": { $ref: "#/components/responses/AuthenticationRequired" },
        "503": { $ref: "#/components/responses/ServiceUnavailable" },
        "500": { $ref: "#/components/responses/InternalError" }
      };
    } else {
      responses = {
        "200": jsonSuccessResponse,
        "400": { $ref: "#/components/responses/BadRequest" },
        "401": { $ref: "#/components/responses/AuthenticationRequired" },
        "404": { $ref: "#/components/responses/NotFound" },
        "409": { $ref: "#/components/responses/Conflict" },
        "500": { $ref: "#/components/responses/InternalError" }
      };
    }
    addOperation(target, operation.path, operation.method, {
      tags: ["OCR worker"],
      summary: operationSummaries[key] ?? fallbackSummary(operation.method, operation.path),
      description:
        "Internal OCR worker operation. It is available only when OCR worker authentication is configured and must never be called with a human JWT.",
      operationId: operationId(operation.method, operation.path),
      security: [operation.claimToken
        ? { workerBearerAuth: [], extractionClaimToken: [] }
        : { workerBearerAuth: [] }],
      ...(pathParameters(operation.path).length
        ? { parameters: pathParameters(operation.path) }
        : {}),
      ...(operation.requestBody ? { requestBody: operation.requestBody } : {}),
      responses
    });
  }
}

function requestBodyFor(
  key: HumanJwtOperationKeyShape,
  method: HumanJwtMethod
): OpenApiRequestBody | undefined {
  const exact = requestBodiesByOperation[key];
  if (exact) return exact;
  if (
    operationsWithoutBodies.has(key) ||
    method === "GET"
  ) {
    return undefined;
  }
  return genericJsonRequestBody;
}

function responsesFor(key: HumanJwtOperationKeyShape): Readonly<Record<string, OpenApiResponse>> {
  if (pdfOperations.has(key)) {
    return binaryResponses("application/pdf", "PDF attachment.");
  }
  if (imageOperations.has(key)) {
    return binaryResponses("image/png", "PNG image.");
  }
  if (attachmentOperations.has(key)) {
    return binaryResponses(storedAttachmentContentTypes, "Stored attachment using its original content type.");
  }
  const responseSchema = responseSchemaByOperation[key];
  return {
    "2XX": responseSchema
      ? dataResponse(responseSchema, "Successful response.")
      : jsonSuccessResponse,
    ...standardProtectedErrors,
    ...(multipartOperations.has(key)
      ? {
          "413": { $ref: "#/components/responses/PayloadTooLarge" },
          "415": { $ref: "#/components/responses/UnsupportedMediaType" }
        }
      : {})
  };
}

function binaryResponses(
  contentType: string | readonly string[],
  description: string
): Readonly<Record<string, OpenApiResponse>> {
  const contentTypes = typeof contentType === "string" ? [contentType] : contentType;
  return {
    "200": {
      description,
      content: Object.fromEntries(contentTypes.map((type) => [
        type,
        { schema: { type: "string", format: "binary" } }
      ]))
    },
    ...standardProtectedErrors
  };
}

function publicJsonResponses(
  schemaName: string | undefined,
  errorCodes: readonly string[],
  successCode = "200"
): Readonly<Record<string, OpenApiResponse>> {
  const responses: Record<string, OpenApiResponse> = {
    [successCode]: schemaName
      ? dataResponse(schemaName, "Successful response.")
      : jsonSuccessResponse
  };
  for (const code of errorCodes) {
    responses[code] = publicErrorResponse(code);
  }
  return responses;
}

function publicErrorResponse(code: string): OpenApiResponse {
  const names: Readonly<Record<string, string>> = {
    "400": "BadRequest",
    "401": "AuthenticationRequired",
    "404": "NotFound",
    "409": "Conflict",
    "410": "Gone",
    "429": "TooManyRequests",
    "500": "InternalError"
  };
  return { $ref: `#/components/responses/${names[code] ?? "InternalError"}` };
}

function dataResponse(schemaName: string, description: string): OpenApiResponse {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data"],
          properties: { data: { $ref: `#/components/schemas/${schemaName}` } }
        }
      }
    }
  };
}

function jsonRequest(schemaName: string): OpenApiRequestBody {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` }
      }
    },
    "x-lisno-schema-completeness": "exact"
  };
}

function multipartRequest(schemaName: string): OpenApiRequestBody {
  return {
    required: true,
    content: {
      "multipart/form-data": {
        schema: { $ref: `#/components/schemas/${schemaName}` }
      }
    },
    "x-lisno-schema-completeness": "exact"
  };
}

function addOperation(
  target: Record<string, OpenApiPathItem>,
  path: string,
  method: HumanJwtMethod,
  operation: OpenApiOperation
) {
  const openApiPath = openApiPathForRoute(path);
  const item = target[openApiPath] ?? {};
  item[method.toLowerCase()] = operation;
  target[openApiPath] = item;
}

function pathParameters(path: string): OpenApiParameter[] {
  return Array.from(path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu), (match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1 }
  }));
}

function protectedDescription(operation: HumanJwtOperation): string {
  const superAdminNote = operation.superAdminBehavior === "deny_personal"
    ? " Super Admin is intentionally denied because this is a personal workflow operation."
    : operation.superAdminBehavior === "admin_override"
      ? " Super Admin may use the audited administrative override path."
      : operation.superAdminBehavior === "global_read"
        ? " Super Admin receives the authorized global-read view."
        : "";
  return `Requires the \`${operation.permission}\` permission.${superAdminNote}`;
}

function tagFor(operation: HumanJwtOperation): string {
  const { path } = splitHumanOperationKey(operation.key);
  if (operation.availability === "project_workflow") return "Project workflow";
  if (operation.availability === "identity_provisioning") return "Invitations";
  if (path.startsWith("/auth")) return "Authentication";
  if (path.startsWith("/access-requests") || path.startsWith("/project-access-grants") || path.startsWith("/admin/users")) return "Administration";
  if (path.startsWith("/leads")) return "Leads";
  if (path.includes("estimate-design") || path.includes("estimate-plan") || path.includes("design-drawings")) return "Estimate design";
  if (path.startsWith("/estimates") || path.startsWith("/client/estimates") || operation.availability === "estimate_client_response") return "Estimates";
  if (path.includes("design-version") || path.includes("design-section") || path.includes("design-source")) return "Design delivery";
  if (path.startsWith("/tasks") || path.startsWith("/floors") || path.startsWith("/stages")) return "Tasks";
  if (path.startsWith("/organization") || path.startsWith("/kpis") || path.startsWith("/evaluations") || path.startsWith("/designers")) return "Organization";
  if (path.startsWith("/audit") || path.endsWith("/activity")) return "Audit";
  return "Projects";
}

function fallbackSummary(method: HumanJwtMethod, path: string): string {
  const resource = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(":"))
    .at(-1)
    ?.replace(/-/gu, " ") ?? "resource";
  const verb: Readonly<Record<HumanJwtMethod, string>> = {
    GET: "Read",
    POST: "Create or run",
    PUT: "Replace",
    PATCH: "Update",
    DELETE: "Delete"
  };
  return `${verb[method]} ${resource}`;
}

function operationId(method: HumanJwtMethod, path: string): string {
  const words = path
    .split("/")
    .filter(Boolean)
    .flatMap((segment) => segment.replace(/^:/u, "").split(/[-_]/u));
  return method.toLowerCase() + words.map(capitalize).join("");
}

function capitalize(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function tag(name: string, description: string) {
  return { name, description } as const;
}

function componentSchemas(): Readonly<Record<string, OpenApiSchema>> {
  const id = { type: "string", minLength: 1 } as const;
  const dateTime = { type: "string", format: "date-time" } as const;
  return {
    GenericJsonObject: {
      type: "object",
      additionalProperties: true,
      description: "Generic placeholder for a route whose private Zod schema has not yet been exported to OpenAPI."
    },
    ApiErrorResponse: {
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            fields: {
              type: "object",
              additionalProperties: { type: "string" }
            }
          }
        }
      }
    },
    Pagination: {
      type: "object",
      required: ["limit", "offset", "total", "hasMore"],
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
        total: { type: "integer", minimum: 0 },
        hasMore: { type: "boolean" }
      }
    },
    Role: { type: "string", enum: [...ROLE_CODES] },
    PermissionCode: { type: "string", enum: [...PERMISSION_CODES] },
    PublicUser: {
      type: "object",
      required: ["id", "name", "email", "role"],
      properties: {
        id,
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" },
        role: { $ref: "#/components/schemas/Role" },
        avatar: { type: "string" }
      }
    },
    AuthPayload: {
      type: "object",
      required: ["token", "user"],
      properties: {
        token: {
          type: "string",
          description: "Raw JWT. Paste this value into Swagger Authorize without adding Bearer."
        },
        user: { $ref: "#/components/schemas/PublicUser" }
      }
    },
    AuthorizationSnapshot: {
      type: "object",
      required: ["role", "policyVersion", "permissions"],
      properties: {
        role: { $ref: "#/components/schemas/Role" },
        policyVersion: { type: "string" },
        permissions: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "#/components/schemas/PermissionCode" }
        }
      }
    },
    LoginRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", format: "password", minLength: 1 }
      }
    },
    ClientSignupRequest: {
      type: "object",
      additionalProperties: false,
      required: ["name", "email", "mobile", "address", "password", "passwordConfirmation"],
      properties: {
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" },
        mobile: { type: "string", minLength: 1 },
        address: { type: "string", minLength: 1 },
        password: { type: "string", format: "password", minLength: 12, maxLength: 128 },
        passwordConfirmation: {
          type: "string",
          format: "password",
          description: "Must exactly match password."
        }
      }
    },
    InvitationInspectRequest: {
      type: "object",
      additionalProperties: false,
      required: ["token"],
      properties: { token: { type: "string" } }
    },
    InvitationAcceptRequest: {
      type: "object",
      additionalProperties: false,
      required: ["token", "password", "passwordConfirmation"],
      properties: {
        token: { type: "string" },
        password: { type: "string", format: "password", minLength: 12, maxLength: 128 },
        passwordConfirmation: {
          type: "string",
          format: "password",
          description: "Must exactly match password."
        }
      }
    },
    AdminProjectInitiationRequest: {
      type: "object",
      additionalProperties: false,
      required: ["clientName", "clientEmail", "clientMobile", "projectName", "location", "propertyType", "budgetMin", "budgetMax", "nextAction", "nextActionAt", "estimatorId"],
      properties: {
        clientName: { type: "string", minLength: 1 },
        clientEmail: { type: "string", format: "email" },
        clientMobile: { type: "string", minLength: 1 },
        projectName: { type: "string", minLength: 1 },
        location: { type: "string", minLength: 1 },
        propertyType: { type: "string", minLength: 1 },
        budgetMin: { type: "number", minimum: 0 },
        budgetMax: { type: "number", minimum: 0, description: "Must be greater than or equal to budgetMin." },
        nextAction: { type: "string", minLength: 1 },
        nextActionAt: dateTime,
        estimatorId: id
      }
    },
    DesignerAssignmentRequest: {
      type: "object",
      additionalProperties: false,
      required: ["designerId"],
      properties: { designerId: id }
    },
    EstimateDecisionRequest: {
      type: "object",
      additionalProperties: false,
      required: ["decision"],
      properties: {
        decision: { type: "string", enum: ["approve", "request_changes"] },
        note: { type: "string", maxLength: 1000, default: "" }
      }
    },
    EstimateLineInput: {
      type: "object",
      additionalProperties: false,
      required: ["catalogueId", "roomName", "specification", "unit", "rate", "quantity", "included"],
      properties: {
        catalogueId: { type: "string", minLength: 1 },
        roomName: { type: "string", minLength: 1 },
        specification: { type: "string", minLength: 1 },
        unit: { type: "string", minLength: 1 },
        rate: { type: "number", minimum: 0 },
        quantity: { type: "number", minimum: 0 },
        included: { type: "boolean" }
      }
    },
    EstimateInput: {
      type: "object",
      additionalProperties: false,
      required: ["propertyType", "rooms", "scopes", "lineItems"],
      properties: {
        propertyType: { type: "string", minLength: 1 },
        rooms: { type: "array", items: { type: "object", additionalProperties: true } },
        scopes: { type: "array", items: { type: "string" } },
        lineItems: { type: "array", items: { $ref: "#/components/schemas/EstimateLineInput" } }
      }
    },
    FileUploadRequest: {
      type: "object",
      additionalProperties: false,
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "PDF, PNG, JPEG, WebP, TIFF, or HEIC/HEIF. File signatures are verified. Default maximum size is 25 MiB."
        }
      }
    },
    DrawingReplacementRequest: {
      type: "object",
      additionalProperties: false,
      required: ["file", "version"],
      properties: {
        file: { type: "string", format: "binary" },
        version: { type: "integer", minimum: 1 }
      }
    },
    EstimateProxyDecisionRequest: proofDecisionSchema("version"),
    DesignPlanProxyDecisionRequest: proofDecisionSchema("expectedVersion"),
    EstimateEmailRetryRequest: {
      type: "object",
      additionalProperties: false,
      required: ["roundId", "version"],
      properties: {
        roundId: id,
        version: { type: "integer", minimum: 1 }
      }
    },
    DesignPlanStatus: { type: "string", enum: [...DESIGN_PLAN_STATUSES] },
    ProjectWorkflowTaskKind: { type: "string", enum: [...PROJECT_WORKFLOW_TASK_KINDS] },
    ProjectWorkflowTaskStatus: { type: "string", enum: [...PROJECT_WORKFLOW_TASK_STATUSES] },
    DesignerOption: {
      type: "object",
      required: ["id", "name", "email"],
      properties: {
        id,
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" }
      }
    },
    DesignerOptionList: {
      type: "array",
      items: { $ref: "#/components/schemas/DesignerOption" }
    },
    DesignPlanTask: {
      type: "object",
      required: ["id", "estimateId", "projectId", "projectName", "clientName", "status", "designPlanVersion", "rooms", "scopes", "lineItems"],
      properties: {
        id,
        estimateId: id,
        projectId: id,
        projectName: { type: "string" },
        clientName: { type: "string" },
        status: { $ref: "#/components/schemas/DesignPlanStatus" },
        designPlanVersion: { type: "integer", minimum: 0 },
        rooms: { type: "array", items: { type: "object", additionalProperties: true } },
        scopes: { type: "array", items: { type: "string" } },
        lineItems: { type: "array", items: { type: "object", additionalProperties: true } }
      }
    },
    DesignPlanTaskList: {
      type: "array",
      items: { $ref: "#/components/schemas/DesignPlanTask" }
    },
    DesignPlanReviewTask: {
      type: "object",
      required: ["id", "estimateId", "projectId", "projectName", "clientName", "designPlanVersion", "status", "deliveryStatus", "submittedAt", "version", "attachmentNames"],
      properties: {
        id,
        estimateId: id,
        projectId: id,
        projectName: { type: "string" },
        clientName: { type: "string" },
        designPlanVersion: { type: "integer", minimum: 1 },
        status: {
          type: "string",
          enum: ["pending", "approved", "changes_requested"]
        },
        deliveryStatus: {
          type: "string",
          enum: ["queued", "sending", "sent", "failed", "disabled"]
        },
        submittedAt: dateTime,
        version: { type: "integer", minimum: 1 },
        attachmentNames: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    DesignPlanReviewTaskList: {
      type: "array",
      items: { $ref: "#/components/schemas/DesignPlanReviewTask" }
    },
    ProjectWorkflowTask: {
      type: "object",
      required: ["id", "projectId", "projectName", "estimateId", "kind", "title", "description", "assigneeRole", "sourceSectionId", "roomName", "status", "openedAt"],
      properties: {
        id,
        projectId: id,
        projectName: { type: "string" },
        estimateId: id,
        kind: { $ref: "#/components/schemas/ProjectWorkflowTaskKind" },
        status: { $ref: "#/components/schemas/ProjectWorkflowTaskStatus" },
        title: { type: "string" },
        description: { type: "string" },
        assigneeRole: { $ref: "#/components/schemas/Role" },
        sourceSectionId: { type: "string", nullable: true },
        roomName: { type: "string", nullable: true },
        openedAt: dateTime
      }
    },
    ProjectWorkflowTaskList: {
      type: "array",
      items: { $ref: "#/components/schemas/ProjectWorkflowTask" }
    },
    ExtractionCrop: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "integer", minimum: 0 },
        y: { type: "integer", minimum: 0 },
        width: { type: "integer", minimum: 1 },
        height: { type: "integer", minimum: 1 }
      }
    },
    ProjectExtractionSection: {
      type: "object",
      additionalProperties: false,
      required: ["label", "confidence", "crop", "imageBase64"],
      properties: {
        label: { type: "string", minLength: 1, maxLength: 500 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        crop: { $ref: "#/components/schemas/ExtractionCrop" },
        imageBase64: { type: "string", format: "byte", minLength: 1 }
      }
    },
    ProjectExtractionPage: {
      type: "object",
      additionalProperties: false,
      required: ["pageNumber", "width", "height", "imageBase64", "sections"],
      properties: {
        pageNumber: { type: "integer", minimum: 1 },
        width: { type: "integer", minimum: 1, maximum: 100000 },
        height: { type: "integer", minimum: 1, maximum: 100000 },
        imageBase64: { type: "string", format: "byte", minLength: 1 },
        sections: {
          type: "array",
          maxItems: 500,
          items: { $ref: "#/components/schemas/ProjectExtractionSection" }
        }
      }
    },
    CanonicalExtractionMatch: {
      type: "object",
      additionalProperties: false,
      required: ["id", "confidence", "evidence", "ambiguous"],
      properties: {
        id: { type: "string", nullable: true, maxLength: 128 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidence: {
          type: "array",
          maxItems: 20,
          items: { type: "string", minLength: 1, maxLength: 500 }
        },
        ambiguous: { type: "boolean" }
      }
    },
    EstimateExtractionSection: {
      type: "object",
      additionalProperties: false,
      required: ["label", "confidence", "crop", "imageBase64", "proposal"],
      properties: {
        label: { type: "string", minLength: 1, maxLength: 500 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        crop: { $ref: "#/components/schemas/ExtractionCrop" },
        imageBase64: { type: "string", format: "byte", minLength: 1 },
        proposal: {
          type: "object",
          additionalProperties: false,
          required: ["detectedTitle", "room", "scope"],
          properties: {
            detectedTitle: { type: "string", minLength: 1, maxLength: 500 },
            room: { $ref: "#/components/schemas/CanonicalExtractionMatch" },
            scope: { $ref: "#/components/schemas/CanonicalExtractionMatch" }
          }
        }
      }
    },
    EstimateExtractionPage: {
      type: "object",
      additionalProperties: false,
      required: ["pageNumber", "width", "height", "imageBase64", "sections"],
      properties: {
        pageNumber: { type: "integer", minimum: 1 },
        width: { type: "integer", minimum: 1, maximum: 100000 },
        height: { type: "integer", minimum: 1, maximum: 100000 },
        imageBase64: { type: "string", format: "byte", minLength: 1 },
        sections: {
          type: "array",
          maxItems: 500,
          items: { $ref: "#/components/schemas/EstimateExtractionSection" }
        }
      }
    },
    ProjectDesignCompletion: {
      type: "object",
      additionalProperties: false,
      required: ["resultId", "pages"],
      properties: {
        kind: { type: "string", enum: ["project_design"] },
        resultId: { type: "string", minLength: 1, maxLength: 200 },
        pages: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { $ref: "#/components/schemas/ProjectExtractionPage" }
        }
      }
    },
    EstimateDesignCompletion: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "resultId", "pages"],
      properties: {
        kind: { type: "string", enum: ["estimate_design"] },
        resultId: { type: "string", minLength: 1, maxLength: 200 },
        pages: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { $ref: "#/components/schemas/EstimateExtractionPage" }
        }
      }
    },
    ExtractionCompletionRequest: {
      description: "Strict worker extraction result. The route accepts JSON up to 64 MiB.",
      oneOf: [
        { $ref: "#/components/schemas/ProjectDesignCompletion" },
        { $ref: "#/components/schemas/EstimateDesignCompletion" }
      ]
    },
    ExtractionFailureRequest: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: [...workerFailureCodes] },
        message: { type: "string", minLength: 1, maxLength: 500 }
      }
    }
  };
}

function proofDecisionSchema(versionField: "version" | "expectedVersion"): OpenApiSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["proof", versionField, "decision"],
    properties: {
      proof: {
        type: "string",
        format: "binary",
        description: "Required PDF, JPEG, PNG, or WebP proof."
      },
      [versionField]: { type: "integer", minimum: 1 },
      decision: { type: "string", enum: ["approve", "request_changes"] },
      note: {
        type: "string",
        maxLength: 1000,
        default: "",
        description: "Required when decision is request_changes."
      }
    },
    oneOf: [
      {
        properties: {
          decision: { type: "string", enum: ["approve"] }
        }
      },
      {
        required: ["note"],
        properties: {
          decision: { type: "string", enum: ["request_changes"] },
          note: { type: "string", minLength: 1, maxLength: 1000 }
        }
      }
    ]
  };
}

function componentResponses(): Readonly<Record<string, OpenApiResponse>> {
  return {
    BadRequest: errorResponse("The request is malformed or fails validation."),
    AuthenticationRequired: errorResponse("Authentication is missing, invalid, or expired."),
    Forbidden: errorResponse("The authenticated identity is not authorized for this operation."),
    NotFound: errorResponse("The requested resource is unavailable or not visible to this identity."),
    Conflict: errorResponse("The request conflicts with the current version or workflow state."),
    Gone: errorResponse("The requested invitation is no longer available."),
    PayloadTooLarge: errorResponse("The uploaded file exceeds the configured size limit."),
    UnsupportedMediaType: errorResponse("The uploaded file type or signature is not supported."),
    ServiceUnavailable: errorResponse("The operation is temporarily unavailable and may be retried."),
    TooManyRequests: {
      ...errorResponse("The request rate limit has been reached."),
      headers: {
        "Retry-After": {
          description: "Whole seconds until another attempt is allowed.",
          schema: { type: "integer", minimum: 0 }
        }
      }
    },
    InternalError: errorResponse("An unexpected server error occurred.")
  };
}

function errorResponse(description: string): OpenApiResponse {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiErrorResponse" }
      }
    }
  };
}
