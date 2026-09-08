import {
} from "../contracts/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_AVAILABILITY_STATES,
  AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES,
  AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
  AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES,
  AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELDS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELD_OPTIONS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELDS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELD_OPTIONS,
  AI_ESTIMATOR_KNOWLEDGE_MODE_KINDS,
  AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS,
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES,
  AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  AI_ESTIMATOR_KNOWLEDGE_SPECIFICATION_FIELD_TYPES,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES
} from "../domain/ai-estimator-knowledge.js";
import { AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS } from "../domain/ai-estimator-knowledge-priority.js";

type OpenApiObject = Readonly<Record<string, unknown>>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` }) as const;
const jsonRequest = (name: string) => ({
  required: true,
  content: { "application/json": { schema: ref(name) } },
  "x-lisno-schema-completeness": "exact"
}) as const;

const admin = "/admin/ai-estimator-knowledge";
const masterFamilies = ["uoms", "vendors", "taxes", "priorities", "surfaces", "modes"] as const;

export const AI_ESTIMATOR_KNOWLEDGE_REQUEST_BODIES: Readonly<Record<string, OpenApiObject>> = {
  [`POST ${admin}/baskets`]: jsonRequest("KnowledgeBasketCreateRequest"),
  [`PATCH ${admin}/baskets/:basketId`]: jsonRequest("KnowledgeBasketUpdateRequest"),
  [`PUT ${admin}/baskets/:basketId/quality`]: jsonRequest("KnowledgeBasketQualityUpdateRequest"),
  [`DELETE ${admin}/baskets/:basketId`]: jsonRequest("KnowledgePermanentDeleteBasketRequest"),
  [`POST ${admin}/baskets/:basketId/sub-baskets`]: jsonRequest("KnowledgeSubBasketCreateRequest"),
  [`POST ${admin}/baskets/:basketId/main-lines`]: jsonRequest("KnowledgeMainLineCreateRequest"),
  [`PATCH ${admin}/main-lines/:mainLineId`]: jsonRequest("KnowledgeMainLineUpdateRequest"),
  [`DELETE ${admin}/main-lines/:mainLineId`]: jsonRequest("KnowledgeArchiveRequest"),
  [`POST ${admin}/main-lines/:mainLineId/revisions`]: jsonRequest("KnowledgeRevisionCreateRequest"),
  [`PUT ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: jsonRequest("KnowledgeSectionUpdateRequest"),
  [`POST ${admin}/main-lines/:mainLineId/revisions/:revisionId/activate`]: jsonRequest("KnowledgeActivationRequest"),
  [`POST ${admin}/main-lines/:mainLineId/deactivate`]: jsonRequest("KnowledgeExpectedVersionRequest"),
  [`POST ${admin}/main-lines/:mainLineId/duplicate`]: jsonRequest("KnowledgeDuplicateRequest"),
  [`POST ${admin}/preview`]: jsonRequest("KnowledgePreviewRequest"),
  "POST /ai-estimator-knowledge/context": jsonRequest("KnowledgeContextRequest"),
  ...Object.fromEntries(masterFamilies.flatMap((family) => {
    const createName = family === "uoms"
      ? "KnowledgeUomCreateRequest"
      : family === "taxes"
        ? "KnowledgeTaxCreateRequest"
        : family === "surfaces"
          ? "KnowledgeSurfaceCreateRequest"
        : "KnowledgeMasterCreateRequest";
    const updateName = family === "uoms"
      ? "KnowledgeUomUpdateRequest"
      : family === "taxes"
        ? "KnowledgeTaxUpdateRequest"
        : family === "surfaces"
          ? "KnowledgeSurfaceUpdateRequest"
        : "KnowledgeMasterUpdateRequest";
    return [
      [`POST ${admin}/${family}`, jsonRequest(createName)],
      [`PATCH ${admin}/${family}/:id`, jsonRequest(updateName)],
      [`DELETE ${admin}/${family}/:id`, jsonRequest("KnowledgeArchiveRequest")]
    ];
  }))
};

export const AI_ESTIMATOR_KNOWLEDGE_RESPONSE_SCHEMAS: Readonly<Record<string, string>> = {
  [`GET ${admin}/baskets/:basketId/sub-baskets`]: "KnowledgeSubBasketPage",
  [`POST ${admin}/baskets/:basketId/sub-baskets`]: "KnowledgeSubBasket",
  [`GET ${admin}/baskets`]: "KnowledgeBasketPage",
  [`POST ${admin}/baskets`]: "KnowledgeBasket",
  [`PATCH ${admin}/baskets/:basketId`]: "KnowledgeBasket",
  [`GET ${admin}/baskets/:basketId/quality`]: "KnowledgeBasketQuality",
  [`PUT ${admin}/baskets/:basketId/quality`]: "KnowledgeBasketQuality",
  [`DELETE ${admin}/baskets/:basketId`]: "KnowledgePermanentDeleteBasketResult",
  [`GET ${admin}/baskets/:basketId/deletion-impact`]: "KnowledgeBasketDeletionImpact",
  [`GET ${admin}/baskets/:basketId/main-lines`]: "KnowledgeMainLinePage",
  [`POST ${admin}/baskets/:basketId/main-lines`]: "KnowledgeItemDetail",
  [`PATCH ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`DELETE ${admin}/main-lines/:mainLineId`]: "KnowledgeMainLineDeletionResult",
  [`GET ${admin}/items`]: "KnowledgeItemPage",
  [`GET ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`GET ${admin}/main-lines/:mainLineId/history`]: "KnowledgeRevisionPage",
  [`POST ${admin}/main-lines/:mainLineId/revisions`]: "KnowledgeRevision",
  [`GET ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "KnowledgeSectionEnvelope",
  [`PUT ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "KnowledgeSectionMutationEnvelope",
  [`POST ${admin}/main-lines/:mainLineId/revisions/:revisionId/activate`]: "KnowledgeItemDetail",
  [`POST ${admin}/main-lines/:mainLineId/deactivate`]: "KnowledgeItemDetail",
  [`POST ${admin}/main-lines/:mainLineId/duplicate`]: "KnowledgeItemDetail",
  [`POST ${admin}/preview`]: "KnowledgePreview",
  "POST /ai-estimator-knowledge/context": "KnowledgeContext",
  ...Object.fromEntries(masterFamilies.flatMap((family) => {
    const itemSchema = family === "priorities"
      ? "KnowledgePriority"
      : family === "surfaces"
        ? "KnowledgeSurface"
        : "KnowledgeMaster";
    const pageResponseSchema = family === "priorities"
      ? "KnowledgePriorityPage"
      : family === "surfaces"
        ? "KnowledgeSurfacePage"
        : "KnowledgeMasterPage";
    return [
      [`GET ${admin}/${family}`, pageResponseSchema],
      [`POST ${admin}/${family}`, itemSchema],
      [`PATCH ${admin}/${family}/:id`, itemSchema],
      [`DELETE ${admin}/${family}/:id`, itemSchema]
    ];
  }))
};

export const AI_ESTIMATOR_KNOWLEDGE_OPERATION_SUMMARIES: Readonly<Record<string, string>> = {
  [`GET ${admin}/baskets/:basketId/sub-baskets`]: "List a Main Basket’s Sub Baskets",
  [`POST ${admin}/baskets/:basketId/sub-baskets`]: "Create a Sub Basket",
  [`GET ${admin}/baskets`]: "List knowledge Baskets",
  [`POST ${admin}/baskets`]: "Create a knowledge Basket",
  [`PATCH ${admin}/baskets/:basketId`]: "Update a knowledge Basket",
  [`GET ${admin}/baskets/:basketId/quality`]: "Read the shared Main Basket quality checklist",
  [`PUT ${admin}/baskets/:basketId/quality`]: "Save an immutable shared Main Basket quality checklist revision",
  [`DELETE ${admin}/baskets/:basketId`]: "Permanently delete a knowledge Basket and everything in it",
  [`GET ${admin}/baskets/:basketId/deletion-impact`]: "Read permanent-deletion impact for a knowledge Basket",
  [`GET ${admin}/baskets/:basketId/main-lines`]: "List a Basket's Main Lines",
  [`POST ${admin}/baskets/:basketId/main-lines`]: "Create a Main Line and Draft revision",
  [`PATCH ${admin}/main-lines/:mainLineId`]: "Update a knowledge Main Line",
  [`DELETE ${admin}/main-lines/:mainLineId`]: "Permanently delete a knowledge Main Line and its revisions",
  [`GET ${admin}/items`]: "Search estimation knowledge items",
  [`GET ${admin}/main-lines/:mainLineId`]: "Read an estimation knowledge item",
  [`GET ${admin}/main-lines/:mainLineId/history`]: "Read estimation knowledge revision history",
  [`POST ${admin}/main-lines/:mainLineId/revisions`]: "Create a Draft knowledge revision",
  [`GET ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "Read a revision section",
  [`PUT ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "Update a Draft revision section",
  [`POST ${admin}/main-lines/:mainLineId/revisions/:revisionId/activate`]: "Activate a Draft knowledge revision",
  [`POST ${admin}/main-lines/:mainLineId/deactivate`]: "Deactivate an estimation knowledge item",
  [`POST ${admin}/main-lines/:mainLineId/duplicate`]: "Duplicate an estimation knowledge item",
  [`POST ${admin}/preview`]: "Calculate a deterministic knowledge preview",
  "POST /ai-estimator-knowledge/context": "Resolve Active AI estimator knowledge context",
  ...Object.fromEntries(masterFamilies.flatMap((family) => [
    [`GET ${admin}/${family}`, `List knowledge ${family}`],
    [`POST ${admin}/${family}`, `Create a knowledge ${family.slice(0, -1)}`],
    [`PATCH ${admin}/${family}/:id`, `Update a knowledge ${family.slice(0, -1)}`],
    [`DELETE ${admin}/${family}/:id`, `Archive a knowledge ${family.slice(0, -1)}`]
  ]))
};

export const AI_ESTIMATOR_KNOWLEDGE_PAGINATION_OPERATIONS = new Set<string>([
  `GET ${admin}/baskets/:basketId/sub-baskets`,
  `GET ${admin}/baskets`,
  `GET ${admin}/baskets/:basketId/main-lines`,
  `GET ${admin}/items`,
  `GET ${admin}/main-lines/:mainLineId/history`,
  ...masterFamilies.map((family) => `GET ${admin}/${family}`)
]);

const searchParameter = {
  name: "search",
  in: "query",
  required: false,
  schema: { type: "string", minLength: 1, maxLength: 240 }
} as const;
const includeArchivedParameter = {
  name: "includeArchived",
  in: "query",
  required: false,
  schema: { type: "boolean", default: false }
} as const;
const masterStatusParameter = {
  name: "status",
  in: "query",
  required: false,
  schema: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES] }
} as const;

export const AI_ESTIMATOR_KNOWLEDGE_QUERY_PARAMETERS: Readonly<
  Record<string, readonly OpenApiObject[]>
> = {
  [`GET ${admin}/baskets/:basketId/sub-baskets`]: [searchParameter],
  [`GET ${admin}/baskets`]: [searchParameter, masterStatusParameter, includeArchivedParameter],
  [`GET ${admin}/baskets/:basketId/main-lines`]: [searchParameter, includeArchivedParameter],
  [`GET ${admin}/items`]: [
    searchParameter,
    ...["basketId", "priorityId", "modeId", "surfaceId", "uomId", "vendorId"].map((name) => ({
      name,
      in: "query",
      required: false,
      schema: { type: "string", minLength: 1, maxLength: 128 }
    })),
    {
      name: "status",
      in: "query",
      required: false,
      schema: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES] }
    }
  ],
  ...Object.fromEntries(masterFamilies.map((family) => [
    `GET ${admin}/${family}`,
    [searchParameter, masterStatusParameter, includeArchivedParameter]
  ]))
};

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const shortText = { type: "string", minLength: 1, maxLength: 240 } as const;
const version = { type: "integer", minimum: 1 } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = { ...dateTime, nullable: true } as const;
const decimal = { type: "string", minLength: 1, maxLength: 64, pattern: "^(0|[1-9][0-9]*)(\\.[0-9]+)?$" } as const;
const description = { type: "string", minLength: 1, maxLength: 4_000, nullable: true } as const;
const displayOrder = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER
} as const;
const createDisplayOrder = {
  ...displayOrder,
  deprecated: true,
  description:
    "Assigned automatically after existing values when omitted. Explicit values remain temporarily accepted for backward compatibility."
} as const;
const editableDisplayOrder = {
  ...displayOrder,
  description: "Optional explicit display position used when manually reordering an existing value."
} as const;
const masterStatus = { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES] } as const;
const sectionApplicability = { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY] } as const;

const actorMetadata = {
  createdById: id,
  updatedById: id,
  createdAt: dateTime,
  updatedAt: dateTime
} as const;

const masterProperties = {
  id,
  version,
  masterType: { type: "string", enum: [...masterFamilies] },
  code: { type: "string", minLength: 1, maxLength: 64 },
  name: { type: "string", minLength: 1, maxLength: 240 },
  description,
  displayOrder,
  status: masterStatus,
  decimalScale: { type: "integer", minimum: 0, maximum: 3 },
  ...actorMetadata
} as const;

const masterCreateRequestProperties = {
  code: masterProperties.code,
  name: masterProperties.name,
  description,
  displayOrder: createDisplayOrder,
  status: { type: "string", enum: ["active", "inactive"] }
} as const;
const masterUpdateRequestProperties = {
  code: masterProperties.code,
  name: masterProperties.name,
  description,
  displayOrder: editableDisplayOrder,
  status: { type: "string", enum: ["active", "inactive"] }
} as const;
const masterRequiredProperties = Object.keys(masterProperties).filter(
  (key) => key !== "decimalScale"
);
const priorityProperties = {
  ...Object.fromEntries(
    Object.entries(masterProperties).filter(([key]) => key !== "decimalScale")
  ),
  masterType: { type: "string", enum: ["priorities"] },
  semanticTier: {
    type: "string",
    enum: [...AI_ESTIMATOR_KNOWLEDGE_PRIORITY_SEMANTIC_TIERS],
    readOnly: true,
    description: "Backend-owned canonical Priority meaning. Omitted for legacy or non-canonical Priority masters."
  }
} as const;
const surfaceProperties = {
  ...Object.fromEntries(
    Object.entries(masterProperties).filter(([key]) => key !== "decimalScale")
  ),
  masterType: { type: "string", enum: ["surfaces"] }
} as const;

const amountComponent = {
  type: "object",
  additionalProperties: false,
  required: ["amountPaise", "basisAmountPaise", "rateBps"],
  properties: {
    amountPaise: { type: "integer", minimum: 0 },
    basisAmountPaise: { type: "integer", minimum: 0 },
    rateBps: { type: "integer", minimum: 0, nullable: true }
  }
} as const;

export const AI_ESTIMATOR_KNOWLEDGE_COMPONENT_SCHEMAS: Readonly<Record<string, OpenApiObject>> = {
  KnowledgeSectionKey: {
    type: "string",
    enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS]
  },
  KnowledgeArchiveRequest: strictObject(["expectedVersion", "reason"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 }
  }),
  KnowledgePermanentDeleteBasketRequest: strictObject(
    ["expectedVersion", "confirmationName", "reason"],
    {
      expectedVersion: version,
      confirmationName: { type: "string", minLength: 1, maxLength: 240 },
      reason: { type: "string", minLength: 1, maxLength: 1_000 }
    }
  ),
  KnowledgeExpectedVersionRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 }
  }),
  KnowledgeBasketCreateRequest: strictObject(["name"], {
    name: masterProperties.name,
    description,
    displayOrder: createDisplayOrder,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeBasketUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    name: masterProperties.name,
    description,
    displayOrder: editableDisplayOrder,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeBasketQualityUpdateRequest: strictObject(["expectedVersion", "parameters"], {
    expectedVersion: version,
    parameters: { type: "array", maxItems: 200, items: ref("KnowledgeQualityParameter"), description: "Full replacement, including an intentional empty list. Combined payload limit 256 KiB. Validated before any writes." }
  }),
  KnowledgeBasketQuality: strictObject(["basketId", "basketName", "basketStatus", "version", "revisionId", "revisionNumber", "contentDigest", "parameters", "updatedAt"], {
    basketId: id, basketName: masterProperties.name, basketStatus: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES] },
    version, revisionId: { ...id, nullable: true }, revisionNumber: { type: "integer", minimum: 0 },
    contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
    parameters: { type: "array", maxItems: 200, items: ref("KnowledgeQualityParameter") }, updatedAt: nullableDateTime
  }),
  KnowledgeQualityParameter: strictObject(["id", "type", "label"], {
    id, type: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES] },
    label: masterProperties.name, unit: { ...masterProperties.name, nullable: true }, category: { ...masterProperties.name, nullable: true },
    allowedValues: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 200 },
    minimum: { type: "string", nullable: true, description: "Canonical nonnegative decimal string." },
    maximum: { type: "string", nullable: true, description: "Canonical nonnegative decimal string." },
    defaultValue: { description: "Value compatible with the parameter type, or null." },
    required: { type: "boolean", description: "Compatibility field. Current quality parameters are always required; shared saves and effective reads normalize this to true." },
    active: { type: "boolean", description: "Compatibility field. Every listed quality parameter is active; shared saves and effective reads normalize this to true." },
    instructions: description, acceptanceCriteria: description, stage: { ...masterProperties.name, nullable: true },
    checkMethod: { type: "string", nullable: true, enum: ["visual", "measurement", "functional_test", "document_review", null] },
    severity: { type: "string", nullable: true, enum: ["critical", "major", "minor", null] },
    responsibleRole: { ...masterProperties.name, nullable: true }, failureAction: description,
    sampling: { ...strictObject(["method", "unit"], {
      method: { type: "string", enum: ["all", "percentage", "fixed_count"] }, unit: masterProperties.name,
      value: { type: "number", nullable: true, description: "Percentage >0 and <=100; fixed count integer 1..1,000,000; absent/null for all. Runtime validation is authoritative." }
    }), nullable: true },
    evidence: { ...strictObject(["photos", "documents", "video"], {
      photos: { type: "boolean" }, documents: { type: "boolean" }, video: { type: "boolean" },
      minPhotosPerSample: { type: "integer", minimum: 1, maximum: 100, nullable: true, description: "Required when photos=true, otherwise absent or null." },
      instructions: description
    }), nullable: true }
  }),
  KnowledgeQualityContext: strictObject(["parameters"], {
    parameters: { type: "array", maxItems: 200, items: ref("KnowledgeQualityParameter") },
    source: strictObject(["kind", "basketId", "revisionId", "revisionNumber", "contentDigest"], {
      kind: { type: "string", enum: ["main_basket"] }, basketId: id, revisionId: id,
      revisionNumber: { type: "integer", minimum: 1 }, contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" }
    })
  }),
  KnowledgeSubBasketCreateRequest: strictObject(["name"], { name: masterProperties.name }),
  KnowledgeMainLineCreateRequest: { ...strictObject(["name"], {
    itemType: { type: "string", enum: ["main_line", "temporary"], description: "Temporary items expose only Overview, Mode and Quality Parameters." },
    subBasketId: id,
    subBasketName: { ...masterProperties.name, description: "Resolved or created under the selected Main Basket. Mutually exclusive with subBasketId." },
    name: masterProperties.name,
    description,
    displayOrder: createDisplayOrder
  }), not: { required: ["subBasketId", "subBasketName"] } },
  KnowledgeMainLineUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    name: masterProperties.name,
    description,
    displayOrder: editableDisplayOrder
  }),
  KnowledgeRevisionCreateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 }
  }),
  KnowledgeActivationRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 }
  }),
  KnowledgeDuplicateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 },
    name: masterProperties.name
  }),
  KnowledgeMasterCreateRequest: strictObject(["code", "name"], masterCreateRequestProperties),
  KnowledgeSurfaceCreateRequest: strictObject(["name"], {
    ...masterCreateRequestProperties
  }),
  KnowledgeUomCreateRequest: strictObject(["code", "name", "decimalScale"], {
    ...masterCreateRequestProperties,
    decimalScale: { type: "integer", minimum: 0, maximum: 3 }
  }),
  KnowledgeTaxVersionRequest: strictObject(
    ["rateBps", "treatment", "applicability", "effectiveFrom"],
    {
      rateBps: { type: "integer", minimum: 0, maximum: 100_000 },
      treatment: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS] },
      applicability: { type: "string", minLength: 1, maxLength: 240 },
      effectiveFrom: dateTime,
      effectiveTo: nullableDateTime,
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES], default: "draft" }
    }
  ),
  KnowledgeTaxVersionUpdateRequest: strictObject(
    ["rateBps", "treatment", "applicability", "effectiveFrom"],
    {
      rateBps: { type: "integer", minimum: 0, maximum: 100_000 },
      treatment: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS] },
      applicability: { type: "string", minLength: 1, maxLength: 240 },
      effectiveFrom: dateTime,
      effectiveTo: nullableDateTime,
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES], default: "draft" },
      rolloverFromVersionId: id
    }
  ),
  KnowledgeTaxCreateRequest: strictObject(["code", "name"], {
    ...masterCreateRequestProperties,
    taxVersion: ref("KnowledgeTaxVersionRequest")
  }),
  KnowledgeMasterUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterUpdateRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeSurfaceUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterUpdateRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeUomUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterUpdateRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] },
    decimalScale: { type: "integer", minimum: 0, maximum: 3 }
  }),
  KnowledgeTaxUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterUpdateRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] },
    taxVersion: ref("KnowledgeTaxVersionUpdateRequest")
  }),
  KnowledgeSectionUpdateRequest: strictObject(
    ["expectedVersion", "payload"],
    {
      expectedVersion: version,
      expectedAggregateVersion: version,
      applicability: sectionApplicability,
      payload: ref("KnowledgeSectionPayload")
    }
  ),
  KnowledgeDescriptiveSpecification: {
    ...strictObject(
      ["id", "name"],
      {
        id,
        name: { type: "string", minLength: 1, maxLength: 240 },
        description
      }
    ),
    example: {
      id: "specification-plywood",
      name: "Plywood",
      description: "18 mm BWP-grade plywood for the cabinet carcass."
    }
  },
  KnowledgeLegacySpecification: {
    deprecated: true,
    description: "Deprecated schema name for a descriptive Specification row.",
    allOf: [ref("KnowledgeDescriptiveSpecification")]
  },
  KnowledgeCanonicalSpecification: {
    deprecated: true,
    description: "Compatibility-only schema for typed Specification rows already stored in a revision. New typed rows and typed-field changes are rejected.",
    oneOf: [
      ...(["text", "textarea"] as const).map((type) => strictObject(
        ["id", "name", "type", "options", "value"],
        {
          id,
          name: { type: "string", minLength: 1, maxLength: 240 },
          description,
          type: { type: "string", enum: [type] },
          options: { type: "array", maxItems: 0, items: { type: "string" } },
          value: { type: "string", maxLength: 4_000, nullable: true }
        }
      )),
      strictObject(
        ["id", "name", "type", "options", "value"],
        {
          id,
          name: { type: "string", minLength: 1, maxLength: 240 },
          description,
          type: { type: "string", enum: ["number"] },
          options: { type: "array", maxItems: 0, items: { type: "string" } },
          value: {
            type: "string",
            maxLength: 64,
            pattern: "^(0|[1-9][0-9]*)(\\.[0-9]{1,6})?$",
            nullable: true
          }
        }
      ),
      ...(["radio", "dropdown"] as const).map((type) => strictObject(
        ["id", "name", "type", "options", "value"],
        {
          id,
          name: { type: "string", minLength: 1, maxLength: 240 },
          description,
          type: { type: "string", enum: [type] },
          options: {
            type: "array",
            minItems: 1,
            maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELD_OPTIONS,
            uniqueItems: true,
            description: "Non-empty options must also be unique after normalized, case-insensitive comparison.",
            items: { type: "string", minLength: 1, maxLength: 240 }
          },
          value: {
            type: "string",
            maxLength: 240,
            nullable: true,
            description: "Null or one of the configured options."
          }
        }
      )),
      strictObject(
        ["id", "name", "type", "options", "value"],
        {
          id,
          name: { type: "string", minLength: 1, maxLength: 240 },
          description,
          type: { type: "string", enum: ["checkbox"] },
          options: { type: "array", maxItems: 0, items: { type: "string" } },
          value: { type: "boolean" }
        }
      )
    ],
    "x-lisno-field-types": [...AI_ESTIMATOR_KNOWLEDGE_SPECIFICATION_FIELD_TYPES],
    example: {
      id: "specification-finish",
      name: "Finish",
      description: "Choose the approved finish.",
      type: "dropdown",
      options: ["Matte", "Gloss"],
      value: "Matte"
    }
  },
  KnowledgeSpecification: {
    description: "A descriptive Specification row for current writes, or an unchanged stored typed row retained for compatibility.",
    oneOf: [
      ref("KnowledgeDescriptiveSpecification"),
      ref("KnowledgeCanonicalSpecification")
    ]
  },
  KnowledgeBudgetSetCommand: {
    ...strictObject(
      [
        "operation", "vendorId", "uomId", "inputAmountPaise",
        "effectiveFrom", "effectiveTo"
      ],
      {
        operation: { type: "string", enum: ["set_budget"] },
        sourcePriceVersionId: {
          ...id,
          nullable: true,
          description: "Opaque current same-revision price-version reference. Omit or send null for a new Budget; send it only to update a retained Budget."
        },
        vendorId: id,
        uomId: id,
        inputAmountPaise: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "Unit Budget before GST in integer paise. Base, tax, and total amounts are derived by the server."
        },
        effectiveFrom: { type: "string", format: "date-time" },
        effectiveTo: { type: "string", format: "date-time", nullable: true }
      }
    ),
    description: "Preferred business-only Budgeting command. Identity, scope, immutable versioning, fixed GST rule/version/treatment, status, calculated amounts, and audit are server-owned. Client-supplied Tax fields are rejected."
  },
  KnowledgePriceEntryAppendCommand: {
    ...strictObject(
      [
        "operation", "priceEntryId", "vendorId", "uomId", "specificationId",
        "modeId", "taxRuleId", "taxVersionId", "inputAmountPaise", "treatment",
        "effectiveFrom", "effectiveTo", "status"
      ],
      {
        operation: { type: "string", enum: ["append"] },
        priceEntryId: id,
        vendorId: id,
        uomId: id,
        specificationId: {
          type: "string",
          nullable: true,
          enum: [null],
          description: "Must be null. Descriptive Specifications are not a price dimension."
        },
        modeId: { ...id, nullable: true },
        taxRuleId: id,
        taxVersionId: id,
        inputAmountPaise: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "Price input in integer paise."
        },
        treatment: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS] },
        effectiveFrom: { type: "string", format: "date-time" },
        effectiveTo: { type: "string", format: "date-time", nullable: true },
        status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES] }
      }
    ),
    deprecated: true,
    description: "Compatibility-only technical command for older clients. New clients should use set_budget. Appends are restricted to the canonical fixed GST policy."
  },
  KnowledgePriceEntryReferenceCommand: strictObject(
    ["operation", "priceEntryId", "priceVersionId"],
    {
      operation: { type: "string", enum: ["reference"] },
      priceEntryId: id,
      priceVersionId: {
        ...id,
        description: "Same-revision immutable price version; historical versions may retain a non-null Specification ID."
      }
    }
  ),
  KnowledgePriceEntryCommand: {
    oneOf: [
      ref("KnowledgeBudgetSetCommand"),
      ref("KnowledgePriceEntryAppendCommand"),
      ref("KnowledgePriceEntryReferenceCommand")
    ]
  },
  KnowledgeModeNonChoiceField: strictObject(
    ["id", "type", "label", "options"],
    {
      id,
      type: { type: "string", enum: ["text", "textarea", "number", "checkbox"] },
      label: { type: "string", minLength: 1, maxLength: 240 },
      options: {
        type: "array",
        maxItems: 0,
        items: { type: "string", minLength: 1, maxLength: 240 }
      }
    }
  ),
  KnowledgeModeChoiceField: strictObject(
    ["id", "type", "label", "options"],
    {
      id,
      type: { type: "string", enum: ["radio", "dropdown"] },
      label: { type: "string", minLength: 1, maxLength: 240 },
      options: {
        type: "array",
        minItems: 1,
        maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELD_OPTIONS,
        uniqueItems: true,
        items: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          pattern: "^\\S(?:[\\s\\S]*\\S)?$"
        },
        description: "Trimmed options are required. Runtime validation also rejects normalized duplicate options."
      }
    }
  ),
  KnowledgeModeField: {
    description: "Definition-only Mode field. Choice and non-choice option constraints are type-specific.",
    oneOf: [
      ref("KnowledgeModeNonChoiceField"),
      ref("KnowledgeModeChoiceField")
    ]
  },
  KnowledgeValuedNonChoiceModeField: {
    ...strictObject(
      ["id", "type", "label", "options", "value"],
      {
        id,
        type: { type: "string", enum: ["text", "textarea", "number", "checkbox"] },
        label: { type: "string", minLength: 1, maxLength: 240 },
        options: {
          type: "array",
          maxItems: 0,
          items: { type: "string", minLength: 1, maxLength: 240 }
        },
        value: {
          oneOf: [
            { type: "string", maxLength: 4_000, nullable: true },
            { type: "boolean" }
          ],
          description: "Configured answer for this component. Absent or null means the component is unanswered."
        }
      }
    ),
    description: "Non-choice Mode field carrying its configured answer."
  },
  KnowledgeValuedChoiceModeField: {
    ...strictObject(
      ["id", "type", "label", "options", "value"],
      {
        id,
        type: { type: "string", enum: ["radio", "dropdown"] },
        label: { type: "string", minLength: 1, maxLength: 240 },
        options: {
          type: "array",
          minItems: 1,
          maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELD_OPTIONS,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 240,
            pattern: "^\\S(?:[\\s\\S]*\\S)?$"
          },
          description: "Trimmed options are required. Runtime validation also rejects normalized duplicate options."
        },
        value: {
          oneOf: [
            { type: "string", maxLength: 4_000, nullable: true },
            { type: "boolean" }
          ],
          description: "Configured answer for this component. Absent or null means the component is unanswered."
        }
      }
    ),
    description: "Choice Mode field carrying its configured answer, drawn from its own options."
  },
  KnowledgeValuedModeField: {
    description: "Mode field carrying the configured answer alongside its definition.",
    oneOf: [
      ref("KnowledgeValuedNonChoiceModeField"),
      ref("KnowledgeValuedChoiceModeField")
    ]
  },
  KnowledgeModeFieldInput: {
    description: "Mode field written either without an answer or with its configured value.",
    oneOf: [
      ref("KnowledgeModeField"),
      ref("KnowledgeValuedModeField")
    ]
  },
  KnowledgeModeConfiguration: {
    description: "Canonical PMC or source-scoped Execution definition template, with deprecated unscoped/Mode-ID compatibility variants.",
    oneOf: [
      strictObject(
        ["id", "modeKind", "fields"],
        {
          id,
          modeKind: {
            type: "string",
            enum: ["pmc"],
            description: "Canonical direct PMC component template."
          },
          fields: {
            type: "array",
            maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELDS,
            items: ref("KnowledgeModeFieldInput")
          }
        }
      ),
      strictObject(
        ["id", "modeKind", "executionSource", "fields"],
        {
          id,
          modeKind: {
            type: "string",
            enum: ["execution"]
          },
          executionSource: {
            type: "string",
            enum: [...AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES],
            description: "Required source identity for a canonical Execution component template."
          },
          fields: {
            type: "array",
            maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELDS,
            items: ref("KnowledgeModeFieldInput")
          }
        }
      ),
      {
        ...strictObject(
          ["id", "modeKind", "fields"],
          {
            id,
            modeKind: { type: "string", enum: ["execution"] },
            fields: {
              type: "array",
              maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELDS,
              items: ref("KnowledgeModeFieldInput")
            }
          }
        ),
        deprecated: true,
        description: "Compatibility-only unscoped Execution configuration. It may remain unchanged or be explicitly assigned to an empty source."
      },
      {
        ...strictObject(
          ["id", "modeId", "fields"],
          {
            id,
            modeId: {
              ...id,
              deprecated: true,
              description: "Legacy reusable Mode reference retained for compatibility."
            },
            fields: {
              type: "array",
              maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_MODE_FIELDS,
              items: ref("KnowledgeModeFieldInput")
            }
          }
        ),
        deprecated: true,
        description: "Compatibility-only reusable-Mode configuration. New writes use canonical modeKind identities."
      }
    ]
  },
  KnowledgeQuantitySlab: strictObject(
    ["id", "minimumQuantity", "maximumQuantity", "adjustmentBps"],
    {
      id,
      minimumQuantity: decimal,
      maximumQuantity: { ...decimal, nullable: true },
      adjustmentBps: { type: "integer", minimum: 0, maximum: 10_000 }
    }
  ),
  KnowledgeSlabRate: {
    ...strictObject(
      ["id", "specificationId", "uomId", "quantity", "unitRatePaise"],
      {
        id,
        specificationId: id,
        uomId: id,
        quantity: {
          ...decimal,
          description: "Positive canonical quantity. Fractional digits cannot exceed the selected UOM decimalScale."
        },
        unitRatePaise: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: "Per-unit slab rate in integer paise."
        }
      }
    ),
    description: "Configured priced slab inputs. Estimated cost is derived as Quantity × Unit rate and is neither accepted nor stored."
  },
  KnowledgeSectionPayload: {
    anyOf: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
      type: "object",
      additionalProperties: false,
      description: `${sectionKey} section payload. Nested rule rows are validated by the authoritative route schema.`,
      properties: sectionPayloadProperties(sectionKey)
    }))
  },
  KnowledgeModeCalculationSettings: {
    ...strictObject(["baseRatePaise", "lowQuantityLimit", "minimumMarkupBps", "startingMarkupBps"], {
      baseRatePaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      lowQuantityLimit: decimal,
      impactBps: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 10_000, default: 1_000,
        description: "Low-quantity Impact in basis points. Defaults to 10% when omitted; 0 disables the uplift." },
      minimumMarkupBps: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 10_000 },
      startingMarkupBps: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 10_000 }
    }),
    description: "Settings for one Mode calculation. Starting markup must be at least minimum markup. Markup is added to cost; the configured Impact applies strictly below the quantity limit. UOM, test quantity, and derived amounts are not stored here."
  },
  KnowledgeModeCalculations: {
    oneOf: [
      strictObject(["pmc", "sub_vendor", "in_house_labor", "in_house_material"], {
        pmc: nullableRef("KnowledgeModeCalculationSettings"),
        sub_vendor: nullableRef("KnowledgeModeCalculationSettings"),
        in_house_labor: nullableRef("KnowledgeModeCalculationSettings"),
        in_house_material: nullableRef("KnowledgeModeCalculationSettings"),
        in_house: { ...nullableRef("KnowledgeModeCalculationSettings"), deprecated: true,
          description: "Preserved legacy In-house snapshot. Split costs do not inherit subsequent edits." }
      }),
      { ...strictObject(["pmc", "sub_vendor", "in_house"], {
        pmc: nullableRef("KnowledgeModeCalculationSettings"),
        sub_vendor: nullableRef("KnowledgeModeCalculationSettings"),
        in_house: nullableRef("KnowledgeModeCalculationSettings")
      }), deprecated: true }
    ],
    description: "Independent PMC, Sub-Vendor, In-house Labor cost, and In-house Material cost settings. Null means unconfigured. Older maps without split costs remain accepted; their In-house values seed both costs once on the next calculation edit. Maps never inherit from the root legacy modeCalculation."
  },
  KnowledgeModeCalculationPreview: strictObject(["revisedUnitRatePaise", "revisedAmountPaise", "totalPaise", "appliedImpactBps"], {
    revisedUnitRatePaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    revisedAmountPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    totalPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    appliedImpactBps: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 10_000 },
    discount: strictObject(["rateBps", "effectiveMarkupBps", "totalBeforeDiscountPaise", "amountPaise"], {
      rateBps: { type: "integer", minimum: 0 }, effectiveMarkupBps: { type: "integer", minimum: 0 },
      totalBeforeDiscountPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      amountPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
    })
  }),
  KnowledgeInHouseCalculationSettings: strictObject(["labor", "material"], {
    labor: ref("KnowledgeModeCalculationSettings"), material: ref("KnowledgeModeCalculationSettings")
  }),
  KnowledgeInHouseCalculationPreview: {
    ...strictObject(["labor", "material", "totalPaise"], {
      labor: ref("KnowledgeModeCalculationPreview"), material: ref("KnowledgeModeCalculationPreview"),
      totalPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
    }),
    description: "Sum of the independently rounded Labor and Material final amounts, after each cost's own Impact and chosen additive markup. Both use the same test quantity and markup basis."
  },
  KnowledgePreviewRequest: strictObject(["quantityScale"], {
    priceVersionId: { ...id, nullable: true },
    taxVersionId: { ...id, nullable: true },
    unitRatePaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true },
    quantityAdjustmentBps: { type: "integer", minimum: 0, maximum: 10_000, nullable: true },
    quantity: { ...decimal, nullable: true, description: "Required and non-null when modeCalculation or inHouseCalculation is supplied." },
    quantityScale: { type: "integer", minimum: 0, maximum: 18 },
    wastageBps: { type: "integer", minimum: 0, nullable: true },
    taxRateBps: { type: "integer", minimum: 0, nullable: true },
    taxTreatment: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS], nullable: true },
    startMarginBps: { type: "integer", minimum: 0, maximum: 9_999, nullable: true },
    bottomMarginBps: { type: "integer", minimum: 0, maximum: 9_999, nullable: true },
    pmcMarkupBps: { type: "integer", minimum: 0, nullable: true },
    duration: { allOf: [ref("KnowledgeDurationPreviewRequest")], nullable: true },
    modeCalculation: ref("KnowledgeModeCalculationSettings"),
    inHouseCalculation: { ...ref("KnowledgeInHouseCalculationSettings"), description: "Combined simulator settings. Cannot be supplied together with modeCalculation." },
    modeCalculationMarkupBasis: {
      type: "string", enum: ["starting", "minimum"], default: "starting",
      description: "Simulator-only choice of additive markup. Requires modeCalculation or inHouseCalculation. Never persisted with Mode settings."
    },
    modeCalculationDiscountBps: {
      type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 10_000, default: 0,
      description: "Simulator-only reduction in markup basis points, not a percentage off selling price. Requires Mode or In-house settings. Cannot exceed chosen markup minus minimum markup (0 when using minimum). For In-house, both costs must satisfy the limit. Never persisted."
    }
  }),
  KnowledgeDurationPreviewRequest: strictObject(["productivity", "productivityScale", "unit"], {
    productivity: decimal,
    productivityScale: { type: "integer", minimum: 0, maximum: 18 },
    unit: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS] },
    minimum: { ...decimal, nullable: true },
    maximum: { ...decimal, nullable: true }
  }),
  KnowledgeContextRequest: {
    ...strictObject(["mainBasketId", "mainLineId"], {
      mainBasketId: id,
      mainLineId: id,
      specificationId: {
        ...id,
        description: "Optional descriptive-guidance selector. It filters returned Specification guidance only and never changes price resolution."
      },
      quantity: decimal,
      uomId: id,
      surfaceId: id,
      modeId: {
        ...id,
        description: "Legacy or generic reusable Mode selector. Cannot be combined with modeKind."
      },
      modeKind: {
        type: "string",
        enum: [...AI_ESTIMATOR_KNOWLEDGE_MODE_KINDS],
        description: "Canonical Mode-tab selector. Cannot be combined with modeId."
      },
      executionSource: {
        type: "string",
        enum: [...AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES],
        description: "Optional Execution definition group selector. Valid only when modeKind is execution."
      }
    }),
    allOf: [
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
    ]
  },
  KnowledgeSubBasket: strictObject(["id", "basketId", "name", "displayOrder", "version", ...Object.keys(actorMetadata)], { id, basketId: id, name: masterProperties.name, displayOrder, version, ...actorMetadata }),
  KnowledgeSubBasketPage: pageSchema("KnowledgeSubBasket"),
  KnowledgeBasket: strictObject(
    ["id", "name", "description", "displayOrder", "status", "version", ...Object.keys(actorMetadata)],
    {
      id,
      name: masterProperties.name,
      description,
      displayOrder,
      status: masterStatus,
      version,
      ...actorMetadata
    }
  ),
  KnowledgeBasketDeletionImpact: strictObject(
    [
      "basketId",
      "basketName",
      "version",
      "mainLineCount",
      "subBasketCount",
      "historicalReferenceCount",
      "bootstrapOwned"
    ],
    {
      basketId: id,
      basketName: masterProperties.name,
      version,
      mainLineCount: { type: "integer", minimum: 0 },
      subBasketCount: { type: "integer", minimum: 0 },
      historicalReferenceCount: { type: "integer", minimum: 0 },
      bootstrapOwned: { type: "boolean" }
    }
  ),
  KnowledgePermanentDeleteBasketResult: strictObject(
    ["basketId", "deleted", "deletedAt"],
    {
      basketId: id,
      deleted: { type: "boolean", enum: [true] },
      deletedAt: dateTime
    }
  ),
  KnowledgeMainLineDeletionResult: strictObject(
    ["mainLineId", "deleted", "deletedAt"],
    {
      mainLineId: id,
      deleted: { type: "boolean", enum: [true] },
      deletedAt: dateTime
    }
  ),
  KnowledgeMaster: strictObject(masterRequiredProperties, masterProperties),
  KnowledgePriority: strictObject(masterRequiredProperties, priorityProperties),
  KnowledgeSurface: strictObject(masterRequiredProperties, surfaceProperties),
  KnowledgeUom: strictObject(Object.keys(masterProperties), masterProperties),
  KnowledgeBasketPage: pageSchema("KnowledgeBasket"),
  KnowledgeMasterPage: pageSchema("KnowledgeMaster"),
  KnowledgePriorityPage: pageSchema("KnowledgePriority"),
  KnowledgeSurfacePage: pageSchema("KnowledgeSurface"),
  KnowledgeMainLine: strictObject(
    ["id", "basketId", "name", "description", "displayOrder", "status", "activeRevisionId", "draftRevisionId", "version", ...Object.keys(actorMetadata)],
    {
      id,
      basketId: id,
      itemType: { type: "string", enum: ["main_line", "temporary"] },
      subBasketId: { ...id, nullable: true },
      name: masterProperties.name,
      description,
      displayOrder,
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES] },
      activeRevisionId: { ...id, nullable: true },
      draftRevisionId: { ...id, nullable: true },
      version,
      ...actorMetadata
    }
  ),
  KnowledgeMainLinePage: pageSchema("KnowledgeMainLine"),
  KnowledgeCompletenessFinding: strictObject(["code", "sectionKey", "message", "blocking"], {
    code: { type: "string" },
    sectionKey: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS] },
    message: { type: "string" },
    blocking: { type: "boolean" }
  }),
  KnowledgeCompleteness: strictObject(["percentage", "sections", "blockers", "warnings"], {
    percentage: { type: "integer", minimum: 0, maximum: 100 },
    sections: {
      type: "array",
      items: strictObject(["sectionKey", "state", "findings"], {
        sectionKey: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS] },
        state: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES] },
        findings: { type: "array", items: ref("KnowledgeCompletenessFinding") }
      })
    },
    blockers: { type: "array", items: ref("KnowledgeCompletenessFinding") },
    warnings: { type: "array", items: ref("KnowledgeCompletenessFinding") }
  }),
  KnowledgeTemporaryMainLineReference: strictObject(
    ["mainLineId", "mainLineName", "basketId", "basketName", "subBasketId", "subBasketName", "status", "revisionId", "revisionStatus", "rules"], {
      mainLineId: id, mainLineName: { type: "string" }, basketId: id, basketName: { type: "string" },
      subBasketId: { ...id, nullable: true }, subBasketName: { type: "string", nullable: true },
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES] }, revisionId: id,
      revisionStatus: { type: "string", enum: ["draft", "active"] },
      rules: { type: "array", items: strictObject(["id", "trigger", "action", "requirement", "reason", "active"], {
        id, trigger: { type: "string", enum: ["added", "removed"] }, action: { type: "string", enum: ["add", "remove"] },
        requirement: { type: "string", enum: ["must", "can"] }, reason: { type: "string" }, active: { type: "boolean" }
      }) }
    }
  ),
  KnowledgeItemListItem: strictObject(
    ["id", "basketId", "basketName", "mainLineId", "mainLineName", "description", "status", "activeRevisionId", "draftRevisionId", "revisionNumber", "uomId", "priorityId", "modeIds", "surfaceIds", "vendorIds", "completeness", "allowedActions", "version", ...Object.keys(actorMetadata)],
    {
      id,
      basketId: id,
      itemType: { type: "string", enum: ["main_line", "temporary"] },
      linkedMainLines: { type: "array", items: ref("KnowledgeTemporaryMainLineReference") },
      basketName: { type: "string" },
      subBasketId: { ...id, nullable: true },
      subBasketName: { type: "string", nullable: true },
      mainLineId: id,
      mainLineName: { type: "string" },
      description,
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES] },
      activeRevisionId: { ...id, nullable: true },
      draftRevisionId: { ...id, nullable: true },
      revisionNumber: { type: "integer", minimum: 1, nullable: true },
      uomId: { ...id, nullable: true },
      priorityId: { ...id, nullable: true },
      modeIds: { type: "array", items: id },
      surfaceIds: { type: "array", items: id },
      vendorIds: { type: "array", items: id },
      completeness: { allOf: [ref("KnowledgeCompleteness")], description: "Current display completeness includes the shared Main Basket checklist, if configured. Item revision snapshots remain unchanged." },
      allowedActions: { type: "array", items: { type: "string" } },
      version,
      ...actorMetadata
    }
  ),
  KnowledgeItemPage: pageSchema("KnowledgeItemListItem"),
  KnowledgeItemDetail: strictObject(
    ["id", "basketId", "basketName", "mainLineId", "mainLineName", "description", "status", "activeRevisionId", "draftRevisionId", "revisionNumber", "uomId", "priorityId", "modeIds", "surfaceIds", "vendorIds", "completeness", "allowedActions", "version", ...Object.keys(actorMetadata), "activeRevision", "draftRevision", "blockers", "warnings"],
    {
      id,
      basketId: id,
      itemType: { type: "string", enum: ["main_line", "temporary"] },
      linkedMainLines: { type: "array", items: ref("KnowledgeTemporaryMainLineReference") },
      basketName: { type: "string" },
      subBasketId: { ...id, nullable: true },
      subBasketName: { type: "string", nullable: true },
      mainLineId: id,
      mainLineName: { type: "string" },
      description,
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES] },
      activeRevisionId: { ...id, nullable: true },
      draftRevisionId: { ...id, nullable: true },
      revisionNumber: { type: "integer", minimum: 1, nullable: true },
      uomId: { ...id, nullable: true },
      priorityId: { ...id, nullable: true },
      modeIds: { type: "array", items: id },
      surfaceIds: { type: "array", items: id },
      vendorIds: { type: "array", items: id },
      completeness: { allOf: [ref("KnowledgeCompleteness")], description: "Current display completeness includes the shared Main Basket checklist, if configured. Item revision snapshots remain unchanged." },
      allowedActions: { type: "array", items: { type: "string" } },
      version,
      ...actorMetadata,
      activeRevision: nullableRef("KnowledgeRevision"),
      draftRevision: nullableRef("KnowledgeRevision"),
      blockers: { type: "array", items: ref("KnowledgeCompletenessFinding") },
      warnings: { type: "array", items: ref("KnowledgeCompletenessFinding") }
    }
  ),
  KnowledgeRevision: strictObject(
    ["id", "mainLineId", "revisionNumber", "status", "sourceRevisionId", "contentDigest", "completeness", "activatedAt", "activatedById", "supersededAt", "supersededById", "version", ...Object.keys(actorMetadata)],
    {
      id,
      mainLineId: id,
      revisionNumber: { type: "integer", minimum: 1 },
      status: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES] },
      sourceRevisionId: { ...id, nullable: true },
      contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$", nullable: true },
      completeness: { allOf: [ref("KnowledgeCompleteness")], description: "Stored historical item revision completeness. Shared Basket edits never rewrite this snapshot." },
      activatedAt: nullableDateTime,
      activatedById: { ...id, nullable: true },
      supersededAt: nullableDateTime,
      supersededById: { ...id, nullable: true },
      version,
      ...actorMetadata
    }
  ),
  KnowledgeRevisionList: { type: "array", items: ref("KnowledgeRevision") },
  KnowledgeRevisionPage: pageSchema("KnowledgeRevision"),
  KnowledgeSectionEnvelope: strictObject(
    ["id", "mainLineId", "revisionId", "sectionKey", "applicability", "payload", "version", ...Object.keys(actorMetadata)],
    {
      id,
      mainLineId: id,
      revisionId: id,
      sectionKey: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS] },
      applicability: sectionApplicability,
      payload: ref("KnowledgeSectionPayload"),
      referenceState: ref("KnowledgeSectionReferenceState"),
      version,
      ...actorMetadata
    }
  ),
  KnowledgeSectionMutationEnvelope: strictObject(
    ["id", "mainLineId", "revisionId", "sectionKey", "applicability", "payload", "version", "aggregateVersion", ...Object.keys(actorMetadata)],
    {
      id,
      mainLineId: id,
      revisionId: id,
      sectionKey: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS] },
      applicability: sectionApplicability,
      payload: ref("KnowledgeSectionPayload"),
      referenceState: ref("KnowledgeSectionReferenceState"),
      version,
      aggregateVersion: version,
      ...actorMetadata
    }
  ),
  KnowledgeSectionReferenceState: strictObject(
    ["specificationIds"],
    {
      specificationIds: {
        type: "array",
        uniqueItems: true,
        description: "Revision-wide Specification IDs referenced by immutable saved price versions or priced quantity slabs. Response-only removal guidance.",
        items: id
      }
    }
  ),
  KnowledgePreviewAmountComponent: amountComponent,
  KnowledgePreview: strictObject(
    ["formulaVersion", "effectivePriceVersionId", "taxVersionId", "effectiveUnitRatePaise", "adjustedUnitRate", "requiredQuantity", "procurementQuantity", "vendorPreTax", "vendorTax", "vendorTotal", "startMargin", "bottomMargin", "pmcMarkup", "duration"],
    {
      formulaVersion: { type: "string", enum: ["knowledge-preview-v1"] },
      effectivePriceVersionId: { ...id, nullable: true },
      taxVersionId: { ...id, nullable: true },
      effectiveUnitRatePaise: { type: "integer", minimum: 0, nullable: true },
      adjustedUnitRate: nullableRef("KnowledgePreviewAmountComponent"),
      requiredQuantity: { ...decimal, nullable: true },
      procurementQuantity: { ...decimal, nullable: true },
      vendorPreTax: nullableRef("KnowledgePreviewAmountComponent"),
      vendorTax: nullableRef("KnowledgePreviewAmountComponent"),
      vendorTotal: nullableRef("KnowledgePreviewAmountComponent"),
      startMargin: nullableRef("KnowledgePreviewAmountComponent"),
      bottomMargin: nullableRef("KnowledgePreviewAmountComponent"),
      pmcMarkup: nullableRef("KnowledgePreviewAmountComponent"),
      modeCalculation: ref("KnowledgeModeCalculationPreview"),
      inHouseCalculation: ref("KnowledgeInHouseCalculationPreview"),
      duration: {
        type: "object",
        nullable: true,
        additionalProperties: false,
        required: ["raw", "clamped", "unit"],
        properties: {
          raw: decimal,
          clamped: decimal,
          unit: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS] }
        }
      }
    }
  ),
  KnowledgeConfigurationContext: strictObject(
    ["formulaVersion", "moneyUnit", "percentageUnit", "selection", "uom", "shared", "state", "issues", "calculations"],
    {
      formulaVersion: { type: "string", enum: ["mode-markup-v1"] },
      moneyUnit: { type: "string", enum: ["paise"] },
      percentageUnit: { type: "string", enum: ["basis_points"] },
      selection: strictObject(["modeKind", "executionSource"], {
        modeKind: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_MODE_KINDS, null], nullable: true },
        executionSource: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_EXECUTION_SOURCES, null], nullable: true }
      }),
      uom: { ...strictObject(["id", "name", "decimalScale"], {
        id, name: shortText, decimalScale: { type: "integer", minimum: 0, maximum: 3 }
      }), nullable: true },
      shared: strictObject(["paragraph", "scopeConfigurationId", "inclusions", "exclusions"], {
        paragraph: { type: "string", nullable: true, description: "Saved shared wording only; null uses the UI's generated description. Structured selected lists are authoritative for analysis." },
        scopeConfigurationId: { ...shortText, nullable: true },
        inclusions: { type: "array", items: strictObject(["id", "name"], { id: shortText, name: shortText }) },
        exclusions: { type: "array", items: strictObject(["id", "name"], { id: shortText, name: shortText }) }
      }),
      state: { type: "string", enum: ["ready", "selection_required", "not_configured", "invalid"] },
      issues: { type: "array", items: strictObject(["code", "scope"], {
        code: { type: "string" },
        scope: { type: "string", enum: ["pmc", "sub_vendor", "in_house_labor", "in_house_material", null], nullable: true }
      }) },
      calculations: { type: "array", maxItems: 2, items: strictObject(["scope", "source", "settings", "maximumDiscountBps"], {
        scope: { type: "string", enum: ["pmc", "sub_vendor", "in_house_labor", "in_house_material"] },
        source: { type: "string", enum: ["scoped", "legacy_shared", "legacy_in_house", null], nullable: true },
        settings: { ...strictObject(["baseRatePaise", "lowQuantityLimit", "impactBps", "minimumMarkupBps", "startingMarkupBps"], {
          baseRatePaise: { type: "integer", minimum: 0 }, lowQuantityLimit: decimal,
          impactBps: { type: "integer", minimum: 0 }, minimumMarkupBps: { type: "integer", minimum: 0 }, startingMarkupBps: { type: "integer", minimum: 0 }
        }), nullable: true },
        maximumDiscountBps: { type: "integer", minimum: 0, nullable: true, description: "Starting markup minus minimum markup, in basis points. This is not a discount percentage on selling price." }
      }) }
    }
  ),
  KnowledgeContext: strictObject(["lineage", "availability", "sections", "preview", "configuration"], {
    lineage: strictObject(["mainLineId", "revisionId", "revisionNumber", "priceVersionId", "taxVersionId", "formulaVersion", "contentDigest", "evaluatedAt"], {
      mainLineId: id,
      revisionId: id,
      revisionNumber: { type: "integer", minimum: 1 },
      priceVersionId: { ...id, nullable: true },
      taxVersionId: { ...id, nullable: true },
      formulaVersion: { type: "string", enum: ["knowledge-preview-v1"] },
      contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      evaluatedAt: dateTime,
      basketQualityRevisionId: id,
      basketQualityContentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" }
    }),
    availability: {
      type: "array",
      items: strictObject(["sectionKey", "state", "reasonCode"], {
        sectionKey: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS] },
        state: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_AVAILABILITY_STATES] },
        reasonCode: { type: "string", nullable: true }
      })
    },
    sections: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((key) => [key, key === "quality" ? ref("KnowledgeQualityContext") : {}]))
    },
    preview: { ...nullableRef("KnowledgePreview"), description: "Legacy price-version preview only. For independent Mode cost settings use configuration; do not combine these pricing systems." },
    configuration: ref("KnowledgeConfigurationContext")
  })
};

function strictObject(required: readonly string[], properties: Readonly<Record<string, unknown>>): OpenApiObject {
  return { type: "object", additionalProperties: false, required, properties };
}

function pageSchema(itemSchema: string): OpenApiObject {
  return strictObject(["items", "pagination"], {
    items: { type: "array", items: ref(itemSchema) },
    pagination: ref("Pagination")
  });
}

function nullableRef(name: string): OpenApiObject {
  return { allOf: [ref(name)], nullable: true };
}

function sectionPayloadKeys(sectionKey: string): readonly string[] {
  const keys: Readonly<Record<string, readonly string[]>> = {
    overview: ["description", "uomId", "priorityId", "surfaceIds", "modeIds", "sectionApplicability"],
    pricing: ["specifications", "brands", "technicalDescription", "qualityLevel", "internalVendorNotes", "priceEntries"],
    "quantity-margin": ["quantitySlabs", "slabRates", "gapBehavior", "startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps", "previewInputs"],
    scope: ["modeIds", "surfaceIds", "exclusions"],
    recommendations: ["recommendations", "exclusions", "budgetAlterations"],
    quality: ["parameters"],
    execution: ["steps", "productivity"],
    advanced: ["dependencies", "modeOverrides", "revisionLineage", "modeConfigurations", "modeDescription", "modeCalculation", "modeCalculations", "pmcMarginBps"]
  };
  return keys[sectionKey] ?? [];
}

function sectionPayloadProperties(sectionKey: string): Readonly<Record<string, unknown>> {
  const properties = Object.fromEntries(
    sectionPayloadKeys(sectionKey).map((key) => [key, {}])
  );
  if (sectionKey === "recommendations") {
    properties.budgetAlterations = {
      type: "array", maxItems: 100,
      description: "Conditional scope guidance for this Main Line. Must/can actions are proposals, not automatic estimate mutations. Temporary items have their own Overview, Mode and Quality configuration. Catalog targets use stable Basket, Sub Basket and Main Line identities.",
      items: { type: "object", additionalProperties: false,
        required: ["id", "trigger", "action", "requirement", "targetType", "targetBasketId", "targetSubBasketId", "targetMainLineId", "reason", "active"],
        properties: {
          id: { type: "string" }, trigger: { type: "string", enum: ["added", "removed"] },
          action: { type: "string", enum: ["add", "remove"] }, requirement: { type: "string", enum: ["must", "can"] },
          targetType: { type: "string", enum: ["catalog", "temporary"] },
          targetBasketId: { type: "string" }, targetSubBasketId: { type: "string", nullable: true },
          targetMainLineId: { type: "string" },
          reason: { type: "string", minLength: 1, maxLength: 4000 }, active: { type: "boolean" }
        }
      }
    };
  }
  if (sectionKey === "advanced") {
    properties.modeDescription = { type: "string", minLength: 1, maxLength: 4_000, nullable: true };
    properties.modeCalculation = { ...nullableRef("KnowledgeModeCalculationSettings"), deprecated: true,
      description: "Legacy shared settings, retained for compatibility. New edits use modeCalculations." };
    properties.modeCalculations = ref("KnowledgeModeCalculations");
    properties.pmcMarginBps = {
      type: "integer", minimum: 1_000, maximum: 2_000, nullable: true,
      description: "Configured PMC margin in integer basis points, from 10% to 20% inclusive. Null or absent means not configured."
    };
    properties.modeConfigurations = {
      type: "array",
      items: ref("KnowledgeModeConfiguration")
    };
  }
  if (sectionKey === "pricing") {
    properties.specifications = {
      type: "array",
      maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELDS,
      items: ref("KnowledgeSpecification")
    };
    properties.priceEntries = {
      type: "array",
      description: "Use set_budget for business writes. Legacy append commands use null Specification scope. Same-revision immutable references may retain historical non-null Specification lineage.",
      items: ref("KnowledgePriceEntryCommand")
    };
  }
  if (sectionKey === "quantity-margin") {
    properties.quantitySlabs = {
      type: "array",
      maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS,
      description: "Legacy ordered quantity ranges that adjust an immutable effective price by basis points.",
      items: ref("KnowledgeQuantitySlab")
    };
    properties.slabRates = {
      type: "array",
      maxItems: AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS,
      description: "Priced slab inputs. They do not participate in runtime effective-price selection.",
      items: ref("KnowledgeSlabRate")
    };
    properties.gapBehavior = {
      type: "string",
      enum: [...AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS],
      description: "Required only when legacy quantitySlabs contains at least one row."
    };
  }
  return properties;
}
