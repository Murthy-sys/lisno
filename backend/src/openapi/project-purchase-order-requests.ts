import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: "object", additionalProperties: false, required, properties });
const id = { type: "string", minLength: 1, maxLength: 500 };
const paise = { type: "integer", minimum: 0, maximum: MAX_FINANCE_AMOUNT_PAISE };
const quantity = { type: "integer", minimum: 1, maximum: 1_000_000_000 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const totals = object({ netPaise: paise, gstPaise: paise, totalPaise: paise });
const source = object({ estimateId: id, estimateVersion: version, estimateReviewRoundId: { ...id, nullable: true } });
const blocker = object({ code: { type: "string" }, message: { type: "string" }, itemId: id }, ["code", "message"]);
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });

export const PROJECT_PURCHASE_ORDER_REQUEST_SCHEMAS = {
  ProjectPurchaseOrderModeDecisionSave: object({
    sourceLineItemKey: id, expectedVersion: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
    expectedEstimateSource: source,
    expectedRevisionDigest: { ...digest, nullable: true, description: "Required when mode is selected; must match the saved Configuration revision." },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    mode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"], nullable: true },
    quantity: { type: "string", nullable: true, minLength: 1, maxLength: 64 },
    discountBps: { type: "integer", minimum: 0, maximum: 10_000 },
    markupBasis: { type: "string", enum: ["starting", "minimum"] },
    exceptionReason: { type: "string", nullable: true, minLength: 10, maxLength: 2_000 },
    recovery: object({ expectedObservedDigest: digest, reason: { type: "string", minLength: 10, maxLength: 2_000 },
      acknowledge: { type: "boolean", enum: [true] } })
  }, ["sourceLineItemKey", "expectedVersion", "expectedEstimateSource", "idempotencyKey", "mode", "quantity"]),
  ProjectPurchaseOrderModePreviewInput: object({
    estimateSource: source,
    sourceLineItemKey: id,
    expectedVersion: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
    mode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] },
    quantity: { type: "string", minLength: 1, maxLength: 64 },
    discountBps: { type: "integer", minimum: 0, maximum: 10_000 },
    markupBasis: { type: "string", enum: ["starting", "minimum"] },
    expectedObservedDigest: digest
  }, ["estimateSource", "sourceLineItemKey", "expectedVersion", "mode", "quantity", "discountBps", "markupBasis"]),
  ProjectPurchaseOrderModeIntegrityBasis: object({
    kind: { type: "string", enum: ["observed_unverified"] },
    activatedDigest: digest, observedDigest: digest,
    reason: { type: "string", minLength: 10, maxLength: 2_000 }, actorId: id,
    acknowledgedAt: { type: "string", format: "date-time" }
  }),
  ProjectPurchaseOrderModeIntegrity: object({
    status: { type: "string", enum: ["mismatch"] },
    activatedDigest: digest, observedDigest: digest,
    candidateAvailability: { type: "array", items: object({
      key: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] }, label: { type: "string" },
      available: { type: "boolean" }, issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") }
    }) }
  }),
  ProjectPurchaseOrderModeDecision: object({
    id, version, sourceLineItemKey: id,
    mode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"], nullable: true },
    quantity: { type: "string", nullable: true },
    discountBps: { type: "integer", minimum: 0, maximum: 10_000 },
    markupBasis: { type: "string", enum: ["starting", "minimum"] },
    exceptionReason: { type: "string", nullable: true },
    revisionId: { ...id, nullable: true }, revisionDigest: { ...digest, nullable: true },
    updatedAt: { type: "string", format: "date-time" },
    integrityBasis: ref("ProjectPurchaseOrderModeIntegrityBasis")
  }, ["id", "version", "sourceLineItemKey", "mode", "quantity", "discountBps", "markupBasis", "exceptionReason", "revisionId", "revisionDigest", "updatedAt"]),
  ProjectPurchaseOrderModeIssue: object({ code: { type: "string" }, message: { type: "string" } }),
  ProjectPurchaseOrderModePriceReference: object({
    state: { type: "string", enum: ["ready", "unavailable"] },
    priceVersionId: { ...id, nullable: true }, priceVersionNumber: { type: "integer", nullable: true },
    taxVersionId: { ...id, nullable: true }, taxVersionNumber: { type: "integer", nullable: true },
    unitPricePaise: { ...paise, nullable: true }, gstBasisPoints: { type: "integer", minimum: 0, maximum: 10_000, nullable: true },
    treatment: { type: "string", enum: ["inclusive", "exclusive"], nullable: true },
    effectiveFrom: { type: "string", format: "date-time", nullable: true },
    effectiveTo: { type: "string", format: "date-time", nullable: true },
    issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") }
  }),
  ProjectPurchaseOrderModePreview: object({
    formulaVersion: { type: "string" }, mode: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] },
    quantity: { type: "string" }, quantityScale: { type: "integer", minimum: 0, maximum: 3 },
    baseCostPaise: paise, adjustedCostPaise: paise, lowQuantityImpactPaise: paise,
    appliedImpactBps: { type: "integer", nullable: true }, sellingPaise: paise,
    finalVendorChargesPaise: { type: "integer", nullable: true },
    floorSellingPaise: { ...paise, nullable: true }, marginBps: { type: "integer", nullable: true },
    discountBps: { type: "integer" }, discountAmountPaise: paise,
    quantityRule: { type: "object", nullable: true, additionalProperties: true },
    procurementQuantitySuggestion: { type: "string", nullable: true },
    settings: { type: "object", additionalProperties: true },
    components: { type: "array", items: { type: "object", additionalProperties: true } }
  }),
  ProjectPurchaseOrderModeStandardCostPreview: object({
    mode: { type: "string", enum: ["sub_vendor"] }, quantity: { type: "string" },
    baseCostPaise: paise, adjustedCostPaise: paise,
    baseRates: { type: "array", items: object({ scope: { type: "string", enum: ["sub_vendor"] },
      ratePaise: paise }) }
  }),
  ProjectPurchaseOrderModeCalculationStage: object({
    scope: { type: "string", enum: ["pmc", "sub_vendor", "in_house_labor", "in_house_material"] },
    baseRatePaise: paise, baseSubtotalPaise: paise, lowQuantityLimit: { type: "string" },
    configuredImpactBps: { type: "integer", minimum: 0 }, thresholdMet: { type: "boolean" },
    appliedImpactBps: { type: "integer", minimum: 0 }, adjustedUnitRatePaise: paise,
    adjustedCostPaise: paise, lowQuantityImpactPaise: paise,
    marginBps: { type: "integer", minimum: 0 }, marginAmountPaise: paise,
    sellingBeforeDiscountPaise: paise, discountBasisPaise: paise, discountAmountPaise: paise,
    floorSellingPaise: { ...paise, nullable: true }, sellingPaise: paise
  }),
  ProjectPurchaseOrderModeDraftPreview: object({
    projectId: id, estimateSource: source, sourceLineItemKey: id,
    decisionVersion: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
    revision: { type: "object", nullable: true, additionalProperties: true },
    uom: { type: "object", nullable: true, additionalProperties: true },
    preview: { ...ref("ProjectPurchaseOrderModePreview"), nullable: true },
    scopes: { type: "array", items: ref("ProjectPurchaseOrderModeCalculationStage") },
    issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") },
    integrity: ref("ProjectPurchaseOrderModeIntegrity")
  }, ["projectId", "estimateSource", "sourceLineItemKey", "decisionVersion", "revision", "uom", "preview", "scopes", "issues"]),
  ProjectPurchaseOrderModeResolution: object({
    state: { type: "string", enum: ["ready", "selection_required", "unavailable", "exception"] },
    options: { type: "array", items: object({ key: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] }, label: { type: "string" } }) },
    availability: { type: "array", items: object({ key: { type: "string", enum: ["pmc", "sub_vendor", "in_house"] },
      label: { type: "string" }, available: { type: "boolean" }, issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") } }) },
    decision: { ...ref("ProjectPurchaseOrderModeDecision"), nullable: true },
    preview: { ...ref("ProjectPurchaseOrderModePreview"), nullable: true },
    issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") },
    revision: { type: "object", nullable: true, additionalProperties: true },
    uom: { type: "object", nullable: true, additionalProperties: true },
    priceReferences: { type: "object", additionalProperties: ref("ProjectPurchaseOrderModePriceReference") },
    integrity: ref("ProjectPurchaseOrderModeIntegrity")
  }, ["state", "options", "decision", "preview", "issues", "revision", "uom", "priceReferences"]),
  ProjectPurchaseOrderPreparationBlocker: blocker,
  ProjectPurchaseOrderPreparationItem: object({ id, version, sourceSectionId: { ...id, nullable: true },
    sourceLineItemKey: { ...id, nullable: true }, roomName: { type: "string", nullable: true },
    itemName: { type: "string" }, brand: { type: "string" },
    uom: object({ id, code: { type: "string" }, name: { type: "string" }, decimalScale: { type: "integer", minimum: 0, maximum: 3, nullable: true }, status: { type: "string" } }),
    vendor: { ...object({ id, code: { type: "string" }, name: { type: "string" }, status: { type: "string" } }), nullable: true },
    plannedOrderQuantityMilliUnits: { ...quantity, nullable: true }, pricePaise: { ...paise, minimum: 1 },
    allocatedWorkPaise: { ...paise, nullable: true }, plannedLineNetPaise: { ...paise, nullable: true },
    blockers: { type: "array", items: ref("ProjectPurchaseOrderPreparationBlocker") } }),
  ProjectPurchaseOrderPreparationSection: object({ id, label: { type: "string" }, roomName: { type: "string" },
    estimatedPaise: paise, netPaise: { ...paise, nullable: true },
    items: { type: "array", items: ref("ProjectPurchaseOrderPreparationItem") } }),
  ProjectPurchaseOrderPreparationEstimateLine: object({
    estimateMode: ref("ProcurementEstimateMode"),
    key: id, included: { type: "boolean" }, source: { type: "string", enum: ["configuration", "legacy"] },
    itemType: { type: "string", enum: ["main_line", "temporary"] },
    mainBasketClassification: { type: "string", enum: ["standard", "special"] },
    mainBasketClassificationExplicit: { type: "boolean" },
    roomId: { ...id, nullable: true }, roomName: { type: "string" },
    mainBasketId: { ...id, nullable: true }, mainBasketName: { type: "string", nullable: true },
    subBasketId: { ...id, nullable: true }, subBasketName: { type: "string", nullable: true },
    mainLineId: { ...id, nullable: true }, mainLineName: { type: "string", nullable: true },
    quantity: { type: "string" }, unit: { type: "string" }, amountPaise: { ...paise, nullable: true },
    itemIds: { type: "array", items: id }, mode: { ...ref("ProjectPurchaseOrderModeResolution"), nullable: true },
    projectRate: object({ version: { type: "integer", minimum: 0 },
      overridePaise: { ...paise, nullable: true } }),
    standardSuggestion: { ...object({ preview: { ...ref("ProjectPurchaseOrderModeStandardCostPreview"), nullable: true },
      issues: { type: "array", items: ref("ProjectPurchaseOrderModeIssue") } }), nullable: true }
  }, ["key", "included", "source", "estimateMode", "mainBasketClassification", "mainBasketClassificationExplicit", "roomId", "roomName", "mainBasketId", "mainBasketName", "subBasketId", "subBasketName", "mainLineId", "mainLineName", "quantity", "unit", "amountPaise", "itemIds", "mode", "projectRate"]),
  ProjectPurchaseOrderPreparation: object({ projectId: id, estimateSource: source, approvedEstimatePaise: paise,
    committedPaise: paise, committedGstPaise: paise, committedTotalPaise: paise,
    remainingPaise: { type: "integer" },
    orderDefaults: object({ targetDate: { type: "string", format: "date", nullable: true }, deliveryLocation: { type: "string", nullable: true } }),
    estimateLines: { type: "array", items: ref("ProjectPurchaseOrderPreparationEstimateLine") },
    sections: { type: "array", items: ref("ProjectPurchaseOrderPreparationSection") },
    netPaise: { ...paise, nullable: true }, itemCount: { type: "integer", minimum: 0 },
    readyItemCount: { type: "integer", minimum: 0 }, blockers: { type: "array", items: ref("ProjectPurchaseOrderPreparationBlocker") }, digest }),
  ProjectPurchaseOrderRequestLineInput: object({ procurementItemId: id, expectedVersion: version,
    gstBasisPoints: { type: "integer", minimum: 0, maximum: 10_000 },
    scopeType: { type: "string", enum: ["supply", "execution", "supply_and_execution"] },
    description: { type: "string", minLength: 1, maxLength: 2_000 }, targetDate: { type: "string", format: "date" },
    deliveryLocation: { type: "string", minLength: 1, maxLength: 500 },
    commercialExceptionReason: { type: "string", minLength: 10, maxLength: 2_000, nullable: true }
  }, ["procurementItemId", "expectedVersion", "gstBasisPoints", "scopeType", "description", "targetDate", "deliveryLocation"]),
  ProjectPurchaseOrderRequestVendorTerms: object({ vendorId: id, terms: { type: "string", minLength: 1, maxLength: 4_000 } }),
  ProjectPurchaseOrderRequestSubmit: object({ expectedPreparationDigest: digest,
    expectedRequestVersion: version,
    lines: { type: "array", minItems: 1, maxItems: 500, items: ref("ProjectPurchaseOrderRequestLineInput") },
    vendorTerms: { type: "array", minItems: 1, maxItems: 100, items: ref("ProjectPurchaseOrderRequestVendorTerms") },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 128 }
  }, ["expectedPreparationDigest", "lines", "vendorTerms", "idempotencyKey"]),
  ProjectPurchaseOrderRequestQuoteInput: object({ expectedPreparationDigest: digest,
    lines: { type: "array", minItems: 1, maxItems: 500, items: ref("ProjectPurchaseOrderRequestLineInput") },
    vendorTerms: { type: "array", minItems: 1, maxItems: 100, items: ref("ProjectPurchaseOrderRequestVendorTerms") }
  }),
  ProjectPurchaseOrderRequestModeSnapshot: object({
    sourceLineItemKey: id, source: { type: "string", enum: ["configuration", "legacy"] },
    roomId: { ...id, nullable: true }, roomName: { type: "string" },
    mainBasketId: { ...id, nullable: true }, mainBasketName: { type: "string", nullable: true },
    subBasketId: { ...id, nullable: true }, subBasketName: { type: "string", nullable: true },
    mainLineId: { ...id, nullable: true }, mainLineName: { type: "string", nullable: true },
    approvedQuantity: { type: "string" }, approvedUnit: { type: "string" }, approvedAmountPaise: paise,
    referenceAsOf: { type: "string", format: "date-time" }, mode: ref("ProjectPurchaseOrderModeResolution"),
    actualChildren: { type: "array", items: object({
      procurementItemId: id, vendorId: id, quantityMilliUnits: quantity, unitPricePaise: paise,
      gstBasisPoints: { type: "integer", minimum: 0, maximum: 10_000 }, allocatedWorkPaise: paise,
      netPaise: paise, gstPaise: paise, totalPaise: paise,
      commercialExceptionReason: { type: "string", nullable: true }
    }) },
    actualTotals: ref("ProjectPurchaseOrderRequestTotals"),
    actualNetMinusConfiguredCostPaise: { type: "integer", nullable: true }
  }),
  ProjectPurchaseOrderRequestQuote: { type: "object", additionalProperties: true,
    required: ["projectId", "preparationDigest", "estimateSource", "approvedEstimatePaise", "committedPaise", "remainingPaise", "lines", "modeSnapshots", "sectionTotals", "vendorTotals", "totals"],
    properties: { projectId: id, preparationDigest: digest, estimateSource: source,
      approvedEstimatePaise: paise, committedPaise: paise, committedGstPaise: paise, committedTotalPaise: paise,
      remainingPaise: { type: "integer" }, lines: { type: "array", items: { type: "object" } },
      modeSnapshots: { type: "array", items: ref("ProjectPurchaseOrderRequestModeSnapshot") },
      sectionTotals: { type: "array", items: { type: "object" } }, vendorTotals: { type: "array", items: { type: "object" } },
      totals: ref("ProjectPurchaseOrderRequestTotals") } },
  ProjectPurchaseOrderRequestDecision: object({ expectedVersion: version, submittedRevisionId: id,
    idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    decision: { type: "string", enum: ["approve", "request_changes", "reject"] },
    reason: { type: "string", nullable: true, maxLength: 2_000,
      description: "Required when requesting changes or rejecting; also required on approval when a submitted mode uses unverified saved Configuration values." },
    budgetOverrideReason: { type: "string", nullable: true, maxLength: 2_000 }
  }, ["expectedVersion", "submittedRevisionId", "idempotencyKey", "decision"]),
  ProjectPurchaseOrderRequestTotals: totals,
  ProjectPurchaseOrderRequestRevision: { type: "object", additionalProperties: true,
    required: ["id", "revision", "modeSnapshotStatus", "modeSnapshots", "lines", "totals"],
    properties: { id, revision: version,
      modeSnapshotStatus: { type: "string", enum: ["captured", "historical_unavailable"] },
      modeSnapshots: { type: "array", items: ref("ProjectPurchaseOrderRequestModeSnapshot") },
      lines: { type: "array", items: { type: "object" } }, totals: ref("ProjectPurchaseOrderRequestTotals") } },
  ProjectPurchaseOrderRequest: { type: "object", additionalProperties: true,
    required: ["id", "projectId", "projectName", "requestNumber", "status", "version", "submittedRevisionId", "approvedEstimatePaise", "committedPaise", "committedGstPaise", "committedTotalPaise", "remainingPaise", "revisions", "totals", "sectionTotals", "vendorTotals"],
    properties: { id, projectId: id, projectName: { type: "string" }, requestNumber: { type: "string" }, status: { type: "string", enum: ["pending_approval", "changes_requested", "rejected", "approved"] },
      version, revision: version, submittedRevisionId: id, estimateSource: source,
      approvedEstimatePaise: paise, committedPaise: paise, committedGstPaise: paise,
      committedTotalPaise: paise, remainingPaise: { type: "integer" },
      totals: ref("ProjectPurchaseOrderRequestTotals"), sectionTotals: { type: "array", items: { type: "object" } },
      vendorTotals: { type: "array", items: { type: "object" } }, decisions: { type: "array", items: { type: "object" } },
      revisions: { type: "array", items: ref("ProjectPurchaseOrderRequestRevision") }, approvedOrderIds: { type: "array", items: id },
      createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  ProjectPurchaseOrderRequestPage: object({ items: { type: "array", items: ref("ProjectPurchaseOrderRequest") },
    total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 } })
};

export const PROJECT_PURCHASE_ORDER_REQUEST_REQUESTS = {
  "POST /procurement/projects/:projectId/purchase-order-mode-decisions": json("ProjectPurchaseOrderModeDecisionSave"),
  "POST /procurement/projects/:projectId/purchase-order-mode-previews": json("ProjectPurchaseOrderModePreviewInput"),
  "POST /procurement/projects/:projectId/purchase-order-requests/quote": json("ProjectPurchaseOrderRequestQuoteInput"),
  "POST /procurement/projects/:projectId/purchase-order-requests": json("ProjectPurchaseOrderRequestSubmit"),
  "POST /admin/purchase-order-requests/:requestId/decision": json("ProjectPurchaseOrderRequestDecision")
};
export const PROJECT_PURCHASE_ORDER_REQUEST_RESPONSES = {
  "POST /procurement/projects/:projectId/purchase-order-mode-decisions": "ProjectPurchaseOrderModeDecision",
  "POST /procurement/projects/:projectId/purchase-order-mode-previews": "ProjectPurchaseOrderModeDraftPreview",
  "POST /procurement/projects/:projectId/purchase-order-requests/quote": "ProjectPurchaseOrderRequestQuote",
  "GET /procurement/projects/:projectId/purchase-order-preparation": "ProjectPurchaseOrderPreparation",
  "GET /procurement/projects/:projectId/purchase-order-requests": "ProjectPurchaseOrderRequestPage",
  "GET /procurement/projects/:projectId/purchase-order-requests/:requestId": "ProjectPurchaseOrderRequest",
  "POST /procurement/projects/:projectId/purchase-order-requests": "ProjectPurchaseOrderRequest",
  "GET /admin/purchase-order-requests/pending": "ProjectPurchaseOrderRequestPage",
  "POST /admin/purchase-order-requests/:requestId/decision": "ProjectPurchaseOrderRequest"
};
export const PROJECT_PURCHASE_ORDER_REQUEST_QUERY_PARAMETERS = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } }
] as const;
