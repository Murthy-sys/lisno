import {
  AI_ESTIMATOR_KNOWLEDGE_BASKET_DELETION_BLOCKER_CODES
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
  [`DELETE ${admin}/baskets/:basketId`]: jsonRequest("KnowledgeArchiveRequest"),
  [`DELETE ${admin}/baskets/:basketId/permanent`]: jsonRequest("KnowledgePermanentDeleteBasketRequest"),
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
        : "KnowledgeMasterCreateRequest";
    const updateName = family === "uoms"
      ? "KnowledgeUomUpdateRequest"
      : family === "taxes"
        ? "KnowledgeTaxUpdateRequest"
        : "KnowledgeMasterUpdateRequest";
    return [
      [`POST ${admin}/${family}`, jsonRequest(createName)],
      [`PATCH ${admin}/${family}/:id`, jsonRequest(updateName)],
      [`DELETE ${admin}/${family}/:id`, jsonRequest("KnowledgeArchiveRequest")]
    ];
  }))
};

export const AI_ESTIMATOR_KNOWLEDGE_RESPONSE_SCHEMAS: Readonly<Record<string, string>> = {
  [`GET ${admin}/baskets`]: "KnowledgeBasketPage",
  [`POST ${admin}/baskets`]: "KnowledgeBasket",
  [`PATCH ${admin}/baskets/:basketId`]: "KnowledgeBasket",
  [`DELETE ${admin}/baskets/:basketId`]: "KnowledgeBasket",
  [`GET ${admin}/baskets/:basketId/deletion-impact`]: "KnowledgeBasketDeletionImpact",
  [`DELETE ${admin}/baskets/:basketId/permanent`]: "KnowledgePermanentDeleteBasketResult",
  [`GET ${admin}/baskets/:basketId/main-lines`]: "KnowledgeMainLinePage",
  [`POST ${admin}/baskets/:basketId/main-lines`]: "KnowledgeItemDetail",
  [`PATCH ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`DELETE ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
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
    const itemSchema = family === "priorities" ? "KnowledgePriority" : "KnowledgeMaster";
    const pageResponseSchema = family === "priorities" ? "KnowledgePriorityPage" : "KnowledgeMasterPage";
    return [
      [`GET ${admin}/${family}`, pageResponseSchema],
      [`POST ${admin}/${family}`, itemSchema],
      [`PATCH ${admin}/${family}/:id`, itemSchema],
      [`DELETE ${admin}/${family}/:id`, itemSchema]
    ];
  }))
};

export const AI_ESTIMATOR_KNOWLEDGE_OPERATION_SUMMARIES: Readonly<Record<string, string>> = {
  [`GET ${admin}/baskets`]: "List knowledge Baskets",
  [`POST ${admin}/baskets`]: "Create a knowledge Basket",
  [`PATCH ${admin}/baskets/:basketId`]: "Update a knowledge Basket",
  [`DELETE ${admin}/baskets/:basketId`]: "Archive a knowledge Basket",
  [`GET ${admin}/baskets/:basketId/deletion-impact`]: "Read permanent-deletion impact for a knowledge Basket",
  [`DELETE ${admin}/baskets/:basketId/permanent`]: "Permanently delete an empty knowledge Basket",
  [`GET ${admin}/baskets/:basketId/main-lines`]: "List a Basket's Main Lines",
  [`POST ${admin}/baskets/:basketId/main-lines`]: "Create a Main Line and Draft revision",
  [`PATCH ${admin}/main-lines/:mainLineId`]: "Update a knowledge Main Line",
  [`DELETE ${admin}/main-lines/:mainLineId`]: "Archive a knowledge Main Line",
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
  KnowledgeMainLineCreateRequest: strictObject(["name"], {
    name: masterProperties.name,
    description,
    displayOrder: createDisplayOrder
  }),
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
  KnowledgeLegacyValuedNonChoiceModeField: {
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
          description: "Immutable stored answer retained only for compatibility with an existing stable field ID."
        }
      }
    ),
    deprecated: true,
    description: "Compatibility-only stored non-choice Mode field. New writes must omit value."
  },
  KnowledgeLegacyValuedChoiceModeField: {
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
          description: "Immutable stored answer retained only for compatibility with an existing stable field ID."
        }
      }
    ),
    deprecated: true,
    description: "Compatibility-only stored choice Mode field. New writes must omit value."
  },
  KnowledgeLegacyValuedModeField: {
    deprecated: true,
    description: "Compatibility-only stored Mode field. New writes must use KnowledgeModeField without value.",
    oneOf: [
      ref("KnowledgeLegacyValuedNonChoiceModeField"),
      ref("KnowledgeLegacyValuedChoiceModeField")
    ]
  },
  KnowledgeModeFieldInput: {
    description: "Definition-only field for new writes, or an unchanged compatibility-valued field already present in the Draft.",
    oneOf: [
      ref("KnowledgeModeField"),
      ref("KnowledgeLegacyValuedModeField")
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
  KnowledgePreviewRequest: strictObject(["quantityScale"], {
    priceVersionId: { ...id, nullable: true },
    taxVersionId: { ...id, nullable: true },
    unitRatePaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true },
    quantityAdjustmentBps: { type: "integer", minimum: 0, maximum: 10_000, nullable: true },
    quantity: { ...decimal, nullable: true },
    quantityScale: { type: "integer", minimum: 0, maximum: 18 },
    wastageBps: { type: "integer", minimum: 0, nullable: true },
    taxRateBps: { type: "integer", minimum: 0, nullable: true },
    taxTreatment: { type: "string", enum: [...AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS], nullable: true },
    startMarginBps: { type: "integer", minimum: 0, maximum: 9_999, nullable: true },
    bottomMarginBps: { type: "integer", minimum: 0, maximum: 9_999, nullable: true },
    pmcMarkupBps: { type: "integer", minimum: 0, nullable: true },
    duration: { allOf: [ref("KnowledgeDurationPreviewRequest")], nullable: true }
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
  KnowledgeBasketDeletionBlocker: strictObject(["code", "message"], {
    code: {
      type: "string",
      enum: [...AI_ESTIMATOR_KNOWLEDGE_BASKET_DELETION_BLOCKER_CODES]
    },
    message: { type: "string" }
  }),
  KnowledgeBasketDeletionImpact: strictObject(
    [
      "basketId",
      "basketName",
      "version",
      "mainLineCount",
      "historicalReferenceCount",
      "bootstrapOwned",
      "canDelete",
      "blockers"
    ],
    {
      basketId: id,
      basketName: masterProperties.name,
      version,
      mainLineCount: { type: "integer", minimum: 0 },
      historicalReferenceCount: { type: "integer", minimum: 0 },
      bootstrapOwned: { type: "boolean" },
      canDelete: { type: "boolean" },
      blockers: {
        type: "array",
        items: ref("KnowledgeBasketDeletionBlocker")
      }
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
  KnowledgeMaster: strictObject(masterRequiredProperties, masterProperties),
  KnowledgePriority: strictObject(masterRequiredProperties, priorityProperties),
  KnowledgeUom: strictObject(Object.keys(masterProperties), masterProperties),
  KnowledgeBasketPage: pageSchema("KnowledgeBasket"),
  KnowledgeMasterPage: pageSchema("KnowledgeMaster"),
  KnowledgePriorityPage: pageSchema("KnowledgePriority"),
  KnowledgeMainLine: strictObject(
    ["id", "basketId", "name", "description", "displayOrder", "status", "activeRevisionId", "draftRevisionId", "version", ...Object.keys(actorMetadata)],
    {
      id,
      basketId: id,
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
  KnowledgeItemListItem: strictObject(
    ["id", "basketId", "basketName", "mainLineId", "mainLineName", "description", "status", "activeRevisionId", "draftRevisionId", "revisionNumber", "uomId", "priorityId", "modeIds", "surfaceIds", "vendorIds", "completeness", "allowedActions", "version", ...Object.keys(actorMetadata)],
    {
      id,
      basketId: id,
      basketName: { type: "string" },
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
      completeness: ref("KnowledgeCompleteness"),
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
      basketName: { type: "string" },
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
      completeness: ref("KnowledgeCompleteness"),
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
      completeness: ref("KnowledgeCompleteness"),
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
  KnowledgeContext: strictObject(["lineage", "availability", "sections", "preview"], {
    lineage: strictObject(["mainLineId", "revisionId", "revisionNumber", "priceVersionId", "taxVersionId", "formulaVersion", "contentDigest", "evaluatedAt"], {
      mainLineId: id,
      revisionId: id,
      revisionNumber: { type: "integer", minimum: 1 },
      priceVersionId: { ...id, nullable: true },
      taxVersionId: { ...id, nullable: true },
      formulaVersion: { type: "string", enum: ["knowledge-preview-v1"] },
      contentDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      evaluatedAt: dateTime
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
      properties: Object.fromEntries(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((key) => [key, {}]))
    },
    preview: nullableRef("KnowledgePreview")
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
    recommendations: ["recommendations"],
    quality: ["parameters"],
    execution: ["steps", "productivity"],
    advanced: ["dependencies", "modeOverrides", "revisionLineage", "modeConfigurations"]
  };
  return keys[sectionKey] ?? [];
}

function sectionPayloadProperties(sectionKey: string): Readonly<Record<string, unknown>> {
  const properties = Object.fromEntries(
    sectionPayloadKeys(sectionKey).map((key) => [key, {}])
  );
  if (sectionKey === "advanced") {
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
