const id = { type: "string", minLength: 1, maxLength: 128 };
const dateTime = { type: "string", format: "date-time" };
const base = "/admin/ai-estimator-knowledge/basket-request-notifications";

export const VENDOR_BASKET_REQUEST_NOTIFICATION_SCHEMAS = {
  KnowledgeVendorBasketRequestNotification: {
    type: "object", additionalProperties: false,
    required: ["id", "type", "requestId", "proposalId", "target", "targetParentName", "proposedName", "vendorName", "requester", "status", "createdAt", "readAt"],
    properties: { id, type: { type: "string", enum: ["basket_request.submitted"] }, requestId: id,
      proposalId: { ...id, nullable: true },
      target: { oneOf: [
        { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["new_main_basket"] } } },
        { type: "object", additionalProperties: false, required: ["kind", "basketId"], properties: { kind: { type: "string", enum: ["new_sub_basket"] }, basketId: id } }
      ] },
      targetParentName: { type: "string", maxLength: 240, nullable: true },
      proposedName: { type: "string", maxLength: 240 }, vendorName: { type: "string", maxLength: 240, nullable: true },
      requester: { type: "object", additionalProperties: false, required: ["id", "name"], properties: { id, name: { type: "string", maxLength: 240 } } },
      status: { type: "string", enum: ["pending", "fulfilled", "rejected"] }, createdAt: dateTime, readAt: { ...dateTime, nullable: true }
    }
  },
  KnowledgeVendorBasketRequestNotificationPage: {
    type: "object", additionalProperties: false, required: ["items", "unreadCount", "pagination"],
    properties: {
      items: { type: "array", items: { $ref: "#/components/schemas/KnowledgeVendorBasketRequestNotification" } },
      unreadCount: { type: "integer", minimum: 0 },
      pagination: { type: "object", additionalProperties: false, required: ["limit", "offset", "total", "hasMore"],
        properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0, maximum: 100000 },
          total: { type: "integer", minimum: 0 }, hasMore: { type: "boolean" } } }
    }
  },
  KnowledgeVendorBasketRequestNotificationRead: { type: "object", additionalProperties: false, properties: {} }
} as const;

export const VENDOR_BASKET_REQUEST_NOTIFICATION_RESPONSES = {
  [`GET ${base}`]: "KnowledgeVendorBasketRequestNotificationPage",
  [`PUT ${base}/:notificationId/read`]: "KnowledgeVendorBasketRequestNotification"
} as const;

export const VENDOR_BASKET_REQUEST_NOTIFICATION_QUERIES = {
  [`GET ${base}`]: [
    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } }
  ]
} as const;

export const VENDOR_BASKET_REQUEST_NOTIFICATION_BODIES = {
  [`PUT ${base}/:notificationId/read`]: { required: false, "x-lisno-schema-completeness": "exact",
    content: { "application/json": { schema: { $ref: "#/components/schemas/KnowledgeVendorBasketRequestNotificationRead" } } } }
} as const;
