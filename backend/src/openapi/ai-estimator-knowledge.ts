import {
  AI_ESTIMATOR_KNOWLEDGE_AVAILABILITY_STATES,
  AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES,
  AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
  AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES
} from "../domain/ai-estimator-knowledge.js";

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
  [`GET ${admin}/baskets/:basketId/main-lines`]: "KnowledgeMainLinePage",
  [`POST ${admin}/baskets/:basketId/main-lines`]: "KnowledgeItemDetail",
  [`PATCH ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`DELETE ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`GET ${admin}/items`]: "KnowledgeItemPage",
  [`GET ${admin}/main-lines/:mainLineId`]: "KnowledgeItemDetail",
  [`GET ${admin}/main-lines/:mainLineId/history`]: "KnowledgeRevisionPage",
  [`POST ${admin}/main-lines/:mainLineId/revisions`]: "KnowledgeRevision",
  [`GET ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "KnowledgeSectionEnvelope",
  [`PUT ${admin}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`]: "KnowledgeSectionEnvelope",
  [`POST ${admin}/main-lines/:mainLineId/revisions/:revisionId/activate`]: "KnowledgeItemDetail",
  [`POST ${admin}/main-lines/:mainLineId/deactivate`]: "KnowledgeItemDetail",
  [`POST ${admin}/main-lines/:mainLineId/duplicate`]: "KnowledgeItemDetail",
  [`POST ${admin}/preview`]: "KnowledgePreview",
  "POST /ai-estimator-knowledge/context": "KnowledgeContext",
  ...Object.fromEntries(masterFamilies.flatMap((family) => [
    [`GET ${admin}/${family}`, "KnowledgeMasterPage"],
    [`POST ${admin}/${family}`, "KnowledgeMaster"],
    [`PATCH ${admin}/${family}/:id`, "KnowledgeMaster"],
    [`DELETE ${admin}/${family}/:id`, "KnowledgeMaster"]
  ]))
};

export const AI_ESTIMATOR_KNOWLEDGE_OPERATION_SUMMARIES: Readonly<Record<string, string>> = {
  [`GET ${admin}/baskets`]: "List knowledge Baskets",
  [`POST ${admin}/baskets`]: "Create a knowledge Basket",
  [`PATCH ${admin}/baskets/:basketId`]: "Update a knowledge Basket",
  [`DELETE ${admin}/baskets/:basketId`]: "Archive a knowledge Basket",
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
const displayOrder = { type: "integer", minimum: 0, default: 0 } as const;
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

const masterRequestProperties = {
  code: masterProperties.code,
  name: masterProperties.name,
  description,
  displayOrder,
  status: { type: "string", enum: ["active", "inactive"] }
} as const;
const masterRequiredProperties = Object.keys(masterProperties).filter(
  (key) => key !== "decimalScale"
);

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
  KnowledgeExpectedVersionRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1_000 }
  }),
  KnowledgeBasketCreateRequest: strictObject(["name"], {
    name: masterProperties.name,
    description,
    displayOrder,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeBasketUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    name: masterProperties.name,
    description,
    displayOrder,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeMainLineCreateRequest: strictObject(["name"], {
    name: masterProperties.name,
    description,
    displayOrder
  }),
  KnowledgeMainLineUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    name: masterProperties.name,
    description,
    displayOrder
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
  KnowledgeMasterCreateRequest: strictObject(["code", "name"], masterRequestProperties),
  KnowledgeUomCreateRequest: strictObject(["code", "name", "decimalScale"], {
    ...masterRequestProperties,
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
    ...masterRequestProperties,
    taxVersion: ref("KnowledgeTaxVersionRequest")
  }),
  KnowledgeMasterUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] }
  }),
  KnowledgeUomUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterRequestProperties,
    status: { type: "string", enum: ["active", "inactive"] },
    decimalScale: { type: "integer", minimum: 0, maximum: 3 }
  }),
  KnowledgeTaxUpdateRequest: strictObject(["expectedVersion"], {
    expectedVersion: version,
    ...masterRequestProperties,
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
  KnowledgeSectionPayload: {
    anyOf: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => ({
      type: "object",
      additionalProperties: false,
      description: `${sectionKey} section payload. Nested rule rows are validated by the authoritative route schema.`,
      properties: Object.fromEntries(sectionPayloadKeys(sectionKey).map((key) => [key, {}]))
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
  KnowledgeContextRequest: strictObject(["mainBasketId", "mainLineId"], {
    mainBasketId: id,
    mainLineId: id,
    specificationId: id,
    quantity: decimal,
    uomId: id,
    surfaceId: id,
    modeId: id
  }),
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
  KnowledgeMaster: strictObject(masterRequiredProperties, masterProperties),
  KnowledgeUom: strictObject(Object.keys(masterProperties), masterProperties),
  KnowledgeBasketPage: pageSchema("KnowledgeBasket"),
  KnowledgeMasterPage: pageSchema("KnowledgeMaster"),
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
      version,
      ...actorMetadata
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
    pricing: ["specifications", "brands", "technicalDescription", "qualityLevel", "internalVendorNotes"],
    "quantity-margin": ["quantitySlabs", "gapBehavior", "startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps", "previewInputs"],
    scope: ["modeIds", "surfaceIds", "exclusions"],
    recommendations: ["recommendations"],
    quality: ["parameters"],
    execution: ["steps", "productivity"],
    advanced: ["dependencies", "modeOverrides", "revisionLineage"]
  };
  return keys[sectionKey] ?? [];
}
