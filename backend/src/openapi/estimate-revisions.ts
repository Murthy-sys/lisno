const identity = { type: "string", minLength: 1, maxLength: 128 };
const positiveInteger = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const summaryProperties = {
  id: identity, estimateId: identity, estimateVersion: positiveInteger, sendGeneration: positiveInteger,
  phase: { type: "string", enum: ["pre", "post"], description: "Absent for older publications whose phase was not recorded." },
  workflowVersion: { type: "integer", enum: [2, 3] },
  submittedAt: { type: "string", format: "date-time" },
  status: { type: "string", enum: ["pending", "approved", "changes_requested", "superseded"] },
  deliveryStatus: { type: "string", enum: ["queued", "sent", "failed", "disabled"] },
  subtotalPaise: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: "Frozen subtotal before GST in integer paise, explicitly converted from valid legacy rupees when needed." }
};
const required = ["id", "estimateId", "estimateVersion", "sendGeneration", "submittedAt", "status", "deliveryStatus", "subtotalPaise"];
export const ESTIMATE_REVISION_SCHEMAS = {
  EstimateRevisionSummary: { type: "object", additionalProperties: false, required, properties: summaryProperties },
  EstimateRevisionPage: { type: "object", additionalProperties: false, required: ["items", "pagination"], properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/EstimateRevisionSummary" } },
    pagination: { type: "object", additionalProperties: false, required: ["limit", "nextCursor"], properties: {
      limit: { type: "integer", minimum: 1, maximum: 50 }, nextCursor: { type: "string", nullable: true }
    } }
  } },
  EstimateRevisionDetail: { type: "object", additionalProperties: false, required: [...required, "snapshot"], properties: {
    ...summaryProperties,
    snapshot: { allOf: [{ $ref: "#/components/schemas/ClientEstimateSnapshot" }], description: "Immutable staff publication snapshot, including all saved lines and optional saved room/scope metadata. No live Configuration or client-visibility projection is applied.", properties: {
      rooms: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        id: identity, typeId: identity, label: { type: "string" }, length: { type: "number", minimum: 0 }, width: { type: "number", minimum: 0 }, height: { type: "number", minimum: 0 }, sqft: { type: "number", minimum: 0 }
      } } }, bedroomCount: { type: "integer", nullable: true, minimum: 0 }, scopes: { type: "array", items: { type: "string" } }
    } }
  } }
};
export const ESTIMATE_REVISION_RESPONSES = {
  "GET /estimates/:estimateId/revisions": "EstimateRevisionPage",
  "GET /estimates/:estimateId/revisions/:revisionId": "EstimateRevisionDetail"
};
export const ESTIMATE_REVISION_QUERIES = {
  "GET /estimates/:estimateId/revisions": [
    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
    { name: "cursor", in: "query", required: false, schema: { type: "string", minLength: 1, maxLength: 1024 }, description: "Opaque nextCursor from this estimate's previous page. Results use descending stored publication generation." }
  ]
} as const;
