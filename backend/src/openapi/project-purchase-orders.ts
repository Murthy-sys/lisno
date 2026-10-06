import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const id = { type: "string", minLength: 1, maxLength: 500 };
const paise = { type: "integer", minimum: 0, maximum: MAX_FINANCE_AMOUNT_PAISE };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const line = {
  procurementItemId: id,
  quantityMilliUnits: { type: "integer", minimum: 1, maximum: 1_000_000_000, description: "Ordered quantity in thousandths of the procurement item's UOM; independent of estimate quantity." },
  unitPricePaise: { ...paise, minimum: 1 },
  gstBasisPoints: { type: "integer", minimum: 0, maximum: 10_000 },
  scopeType: { type: "string", enum: ["supply", "execution", "supply_and_execution"] },
  description: { type: "string", minLength: 1, maxLength: 2_000 },
  targetDate: { type: "string", format: "date" },
  deliveryLocation: { type: "string", minLength: 1, maxLength: 500 }
};
const responseLine = { ...line, scopeType: { ...line.scopeType, nullable: true },
  targetDate: { ...line.targetDate, nullable: true },
  deliveryLocation: { ...line.deliveryLocation, nullable: true } };
const totals = object({ netPaise: paise, gstPaise: paise, totalPaise: paise });
const receiptKey = { type: "string", minLength: 8, maxLength: 128 };
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });

export const PROJECT_PURCHASE_ORDER_SCHEMAS = {
  ProjectPurchaseOrderLineInput: object(line),
  ProjectPurchaseOrderDraftInput: object({ vendorId: id, lines: { type: "array", minItems: 1, maxItems: 100, items: ref("ProjectPurchaseOrderLineInput") }, terms: { type: "string", minLength: 1, maxLength: 4_000 }, idempotencyKey: receiptKey }),
  ProjectPurchaseOrderUpdateInput: object({ lines: { type: "array", minItems: 1, maxItems: 100, items: ref("ProjectPurchaseOrderLineInput") }, terms: { type: "string", minLength: 1, maxLength: 4_000 }, expectedVersion: version, idempotencyKey: receiptKey }),
  ProjectPurchaseOrderSubmitInput: object({ expectedVersion: version, idempotencyKey: receiptKey }),
  ProjectPurchaseOrderDecisionInput: object({ expectedVersion: version, submittedRevisionId: id, idempotencyKey: receiptKey,
    decision: { type: "string", enum: ["approve", "request_changes", "reject"] }, reason: { type: "string", nullable: true, maxLength: 2_000 }, budgetOverrideReason: { type: "string", nullable: true, maxLength: 2_000 } }, ["expectedVersion", "submittedRevisionId", "idempotencyKey", "decision"]),
  ProjectPurchaseOrderReasonInput: object({ expectedVersion: version, idempotencyKey: receiptKey, reason: { type: "string", minLength: 1, maxLength: 2_000 } }),
  ProjectPurchaseOrderLine: object({ id, ...responseLine, procurementItemVersion: version, netPaise: paise, gstPaise: paise, totalPaise: paise }),
  ProjectPurchaseOrderApprovedLine: object({ id, ...responseLine, procurementItemVersion: version, estimateId: id, estimateVersion: version, estimateReviewRoundId: { ...id, nullable: true }, sourceSectionId: id, sourceLineItemKey: id,
    roomName: { type: "string" }, itemName: { type: "string" }, brand: { type: "string" }, uomId: id, uomCode: { type: "string" }, uomName: { type: "string" }, netPaise: paise, gstPaise: paise, totalPaise: paise }),
  ProjectPurchaseOrderRevision: object({ id, revision: version, submittedAt: { type: "string", format: "date-time" }, submittedById: id, terms: { type: "string", nullable: true },
    lines: { type: "array", items: ref("ProjectPurchaseOrderApprovedLine") }, totals }),
  ProjectPurchaseOrderDecision: object({ id, revisionId: id, revision: version, decision: { type: "string", enum: ["approve", "request_changes", "reject"] },
    actorId: id, reason: { type: "string", nullable: true }, budgetOverrideReason: { type: "string", nullable: true }, decidedAt: { type: "string", format: "date-time" } }),
  ProjectPurchaseOrder: object({ id, orderNumber: id, projectId: id, projectRequestId: { ...id, nullable: true }, vendor: object({ id, code: id, name: id }),
    status: { type: "string", enum: ["draft", "pending_approval", "changes_requested", "rejected", "approved", "cancelled"] },
    version, revision: { type: "integer", minimum: 0 }, estimateSource: object({ estimateId: id, estimateVersion: version, estimateReviewRoundId: { ...id, nullable: true } }),
    terms: { type: "string", nullable: true }, draftLines: { type: "array", items: ref("ProjectPurchaseOrderLine") }, draftTotals: totals,
    submittedRevisionId: { ...id, nullable: true }, approvedRevisionId: { ...id, nullable: true }, approvedNetPaise: { ...paise, nullable: true }, approvedGstPaise: { ...paise, nullable: true }, approvedTotalPaise: { ...paise, nullable: true },
    decisions: { type: "array", items: ref("ProjectPurchaseOrderDecision") }, revisions: { type: "array", items: ref("ProjectPurchaseOrderRevision") },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }),
  ProjectPurchaseOrderPage: object({ items: { type: "array", items: ref("ProjectPurchaseOrder") }, total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } }),
  ProjectPurchaseOrderCommitments: object({ approvedEstimatePaise: { ...paise, description: "Approved included-line procurement budget before GST." }, committedPaise: { ...paise, description: "Approved PO net commitments before GST, distinct from posted ledger spend." }, committedGstPaise: paise, committedTotalPaise: paise, remainingPaise: { type: "integer", description: "Pre-GST budget less pre-GST commitment; may be negative after an audited override." } }),
  VendorPurchaseOrder: object({ id, orderNumber: id, projectId: id, vendor: object({ id, code: id, name: id }), revision: version,
    approvedAt: { type: "string", format: "date-time" }, terms: { type: "string", nullable: true },
    lines: { type: "array", items: ref("ProjectPurchaseOrderApprovedLine") }, totals })
};

export const PROJECT_PURCHASE_ORDER_QUERY_PARAMETERS = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } }
] as const;

export const PROJECT_PURCHASE_ORDER_REQUESTS = {
  "POST /procurement/projects/:projectId/purchase-orders": json("ProjectPurchaseOrderDraftInput"),
  "PATCH /procurement/projects/:projectId/purchase-orders/:orderId": json("ProjectPurchaseOrderUpdateInput"),
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/submit": json("ProjectPurchaseOrderSubmitInput"),
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/decision": json("ProjectPurchaseOrderDecisionInput"),
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/amend": json("ProjectPurchaseOrderReasonInput"),
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/cancel": json("ProjectPurchaseOrderReasonInput")
};
export const PROJECT_PURCHASE_ORDER_RESPONSES = {
  "GET /procurement/projects/:projectId/purchase-orders": "ProjectPurchaseOrderPage",
  "GET /procurement/projects/:projectId/purchase-orders/:orderId": "ProjectPurchaseOrder",
  "POST /procurement/projects/:projectId/purchase-orders": "ProjectPurchaseOrder",
  "PATCH /procurement/projects/:projectId/purchase-orders/:orderId": "ProjectPurchaseOrder",
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/submit": "ProjectPurchaseOrder",
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/decision": "ProjectPurchaseOrder",
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/amend": "ProjectPurchaseOrder",
  "POST /procurement/projects/:projectId/purchase-orders/:orderId/cancel": "ProjectPurchaseOrder",
  "GET /procurement/projects/:projectId/purchase-order-commitments": "ProjectPurchaseOrderCommitments",
  "GET /admin/purchase-orders/pending": "ProjectPurchaseOrderPage",
  "GET /vendor/purchase-orders/:orderId": "VendorPurchaseOrder"
};
