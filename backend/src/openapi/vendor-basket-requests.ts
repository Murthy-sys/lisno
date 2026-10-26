const id = { type: "string", minLength: 1, maxLength: 128 };
const dateTime = { type: "string", format: "date-time" };
const requestRef = { $ref: "#/components/schemas/KnowledgeVendorBasketRequest" };
const body = (name: string) => ({ required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
  "x-lisno-schema-completeness": "exact" });
const pageQuery = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } }
];

export const VENDOR_BASKET_REQUEST_SCHEMAS = {
  KnowledgeVendorBasketRequest: { type: "object", additionalProperties: false,
    required: ["id", "requesterId", "vendorId", "vendorName", "proposedName", "status", "version", "basketId", "subBasketId", "mainLineId", "reason", "createdAt", "decidedAt", "decidedById"],
    properties: { requestMode: { type: "string", enum: ["hierarchy_intake", "full_configuration"] }, target: { oneOf: [
        { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["new_main_basket"] } } },
        { type: "object", additionalProperties: false, required: ["kind", "basketId"], properties: { kind: { type: "string", enum: ["new_sub_basket"] }, basketId: id } }
      ] }, targetParentName: { type: "string", nullable: true }, kind: { type: "string", enum: ["configuration_proposal", "name_only", "configuration_sub_basket"] }, description: { type: "string", maxLength: 4000, nullable: true }, proposalId: { ...id, nullable: true },
      proposalCounts: { type: "object", properties: { subBaskets: { type: "integer" }, mainLines: { type: "integer" } } },
      id, requesterId: id, vendorId: { ...id, nullable: true }, vendorName: { type: "string", nullable: true },
      proposedName: { type: "string" }, status: { type: "string", enum: ["pending", "fulfilled", "rejected"] },
      version: { type: "integer", minimum: 1 }, basketId: { ...id, nullable: true },
      subBasketId: { ...id, nullable: true }, mainLineId: { ...id, nullable: true },
      reason: { type: "string", nullable: true }, createdAt: dateTime,
      decidedAt: { ...dateTime, nullable: true }, decidedById: { ...id, nullable: true } } },
  KnowledgeVendorBasketRequestCreate: { type: "object", additionalProperties: false,
    required: ["vendorName", "proposedName", "idempotencyKey"],
    properties: { vendorId: { ...id, nullable: true }, vendorName: { type: "string", minLength: 1, maxLength: 240 },
      proposedName: { type: "string", minLength: 1, maxLength: 240 },
      idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" } } },
  KnowledgeConfigurationSubBasketRequestCreate: { type: "object", additionalProperties: false,
    required: ["basketId", "name", "description", "idempotencyKey"],
    properties: { basketId: id, name: { type: "string", minLength: 1, maxLength: 240 },
      description: { type: "string", minLength: 1, maxLength: 4000 },
      idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" } } },
  KnowledgeVendorBasketRequestDecision: { type: "object", additionalProperties: false,
    required: ["decision", "expectedVersion", "idempotencyKey"],
    oneOf: [
      { properties: { decision: { enum: ["fulfill"] } } },
      { properties: { decision: { enum: ["reject"] } }, not: { required: ["configuration"] } }
    ],
    properties: { decision: { type: "string", enum: ["fulfill", "reject"] },
      expectedVersion: { type: "integer", minimum: 1 }, reason: { type: "string", minLength: 1, maxLength: 1000, nullable: true },
      configuration: { type: "object", additionalProperties: false,
        oneOf: [{ required: ["subBasketId"], not: { required: ["subBasketName"] } },
          { required: ["subBasketName"], not: { required: ["subBasketId"] } }],
        properties: { subBasketId: id, subBasketName: { type: "string", minLength: 1, maxLength: 240 },
          mainLineName: { type: "string", minLength: 1, maxLength: 240 } } },
      idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" } } },
  KnowledgeVendorBasketRequestPage: { type: "object", additionalProperties: false, required: ["items", "pagination"],
    properties: { items: { type: "array", items: requestRef }, pagination: { type: "object", additionalProperties: false,
      required: ["total", "limit", "offset", "hasMore"], properties: {
        total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }, hasMore: { type: "boolean" }
      } } } }
} as const;

export const VENDOR_BASKET_REQUEST_BODIES = {
  "POST /admin/ai-estimator-knowledge/sub-basket-requests": body("KnowledgeConfigurationSubBasketRequestCreate"),
  "POST /procurement/vendor-basket-requests": body("KnowledgeVendorBasketRequestCreate"),
  "POST /admin/ai-estimator-knowledge/basket-requests/:requestId/decision": body("KnowledgeVendorBasketRequestDecision")
} as const;

export const VENDOR_BASKET_REQUEST_RESPONSES = {
  "POST /admin/ai-estimator-knowledge/sub-basket-requests": "KnowledgeVendorBasketRequest",
  "POST /procurement/vendor-basket-requests": "KnowledgeVendorBasketRequest",
  "GET /procurement/vendor-basket-requests/mine": "KnowledgeVendorBasketRequestPage",
  "GET /admin/ai-estimator-knowledge/basket-requests": "KnowledgeVendorBasketRequestPage",
  "GET /admin/ai-estimator-knowledge/basket-requests/:requestId": "KnowledgeVendorBasketRequest",
  "POST /admin/ai-estimator-knowledge/basket-requests/:requestId/decision": "KnowledgeVendorBasketRequest"
} as const;

export const VENDOR_BASKET_REQUEST_QUERIES = {
  "GET /procurement/vendor-basket-requests/mine": [...pageQuery,
    { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 240 }, description: "Literal, case-insensitive requested basket name search." },
    { name: "status", in: "query", required: false, schema: { type: "string", enum: ["pending", "fulfilled", "rejected"] } },
    { name: "targetKind", in: "query", required: false, schema: { type: "string", enum: ["new_main_basket", "new_sub_basket"] } }
  ],
  "GET /admin/ai-estimator-knowledge/basket-requests": [
    ...pageQuery,
    { name: "status", in: "query", required: false,
      schema: { type: "string", enum: ["pending", "fulfilled", "rejected"] } }
  ]
} as const;
