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
  ProjectPurchaseOrderPreparation: object({ projectId: id, estimateSource: source, approvedEstimatePaise: paise,
    committedPaise: paise, committedGstPaise: paise, committedTotalPaise: paise,
    remainingPaise: { type: "integer" }, sections: { type: "array", items: ref("ProjectPurchaseOrderPreparationSection") },
    netPaise: { ...paise, nullable: true }, itemCount: { type: "integer", minimum: 0 },
    readyItemCount: { type: "integer", minimum: 0 }, blockers: { type: "array", items: ref("ProjectPurchaseOrderPreparationBlocker") }, digest }),
  ProjectPurchaseOrderRequestLineInput: object({ procurementItemId: id, expectedVersion: version,
    gstBasisPoints: { type: "integer", minimum: 0, maximum: 10_000 },
    scopeType: { type: "string", enum: ["supply", "execution", "supply_and_execution"] },
    description: { type: "string", minLength: 1, maxLength: 2_000 }, targetDate: { type: "string", format: "date" },
    deliveryLocation: { type: "string", minLength: 1, maxLength: 500 } }),
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
  ProjectPurchaseOrderRequestQuote: { type: "object", additionalProperties: true,
    required: ["projectId", "preparationDigest", "estimateSource", "approvedEstimatePaise", "committedPaise", "remainingPaise", "lines", "sectionTotals", "vendorTotals", "totals"],
    properties: { projectId: id, preparationDigest: digest, estimateSource: source,
      approvedEstimatePaise: paise, committedPaise: paise, committedGstPaise: paise, committedTotalPaise: paise,
      remainingPaise: { type: "integer" }, lines: { type: "array", items: { type: "object" } },
      sectionTotals: { type: "array", items: { type: "object" } }, vendorTotals: { type: "array", items: { type: "object" } },
      totals: ref("ProjectPurchaseOrderRequestTotals") } },
  ProjectPurchaseOrderRequestDecision: object({ expectedVersion: version, submittedRevisionId: id,
    idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    decision: { type: "string", enum: ["approve", "request_changes", "reject"] },
    reason: { type: "string", nullable: true, maxLength: 2_000 },
    budgetOverrideReason: { type: "string", nullable: true, maxLength: 2_000 }
  }, ["expectedVersion", "submittedRevisionId", "idempotencyKey", "decision"]),
  ProjectPurchaseOrderRequestTotals: totals,
  ProjectPurchaseOrderRequest: { type: "object", additionalProperties: true,
    required: ["id", "projectId", "projectName", "requestNumber", "status", "version", "submittedRevisionId", "approvedEstimatePaise", "committedPaise", "committedGstPaise", "committedTotalPaise", "remainingPaise", "revisions", "totals", "sectionTotals", "vendorTotals"],
    properties: { id, projectId: id, projectName: { type: "string" }, requestNumber: { type: "string" }, status: { type: "string", enum: ["pending_approval", "changes_requested", "rejected", "approved"] },
      version, revision: version, submittedRevisionId: id, estimateSource: source,
      approvedEstimatePaise: paise, committedPaise: paise, committedGstPaise: paise,
      committedTotalPaise: paise, remainingPaise: { type: "integer" },
      totals: ref("ProjectPurchaseOrderRequestTotals"), sectionTotals: { type: "array", items: { type: "object" } },
      vendorTotals: { type: "array", items: { type: "object" } }, decisions: { type: "array", items: { type: "object" } },
      revisions: { type: "array", items: { type: "object" } }, approvedOrderIds: { type: "array", items: id },
      createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  ProjectPurchaseOrderRequestPage: object({ items: { type: "array", items: ref("ProjectPurchaseOrderRequest") },
    total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 } })
};

export const PROJECT_PURCHASE_ORDER_REQUEST_REQUESTS = {
  "POST /procurement/projects/:projectId/purchase-order-requests/quote": json("ProjectPurchaseOrderRequestQuoteInput"),
  "POST /procurement/projects/:projectId/purchase-order-requests": json("ProjectPurchaseOrderRequestSubmit"),
  "POST /admin/purchase-order-requests/:requestId/decision": json("ProjectPurchaseOrderRequestDecision")
};
export const PROJECT_PURCHASE_ORDER_REQUEST_RESPONSES = {
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
