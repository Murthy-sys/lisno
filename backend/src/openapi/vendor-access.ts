const text = { type: "string" };
const integer = { type: "integer", minimum: 1 };
const nullableText = { ...text, nullable: true };
const nullableInteger = { ...integer, nullable: true };
const dateTime = { ...text, format: "date-time", nullable: true };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const actions = { type: "array", uniqueItems: true, items: { ...text, enum: ["send_invitation", "resend_invitation", "send_work_notification"] } };
const access = { ...text, enum: ["unknown", "setup_pending", "active", "blocked"] };
const invitation = { allOf: [ref("VendorAccessInvitation")], nullable: true };
const delivery = {
  state: { ...text, enum: ["not_requested", "queued", "sending", "sent", "failed", "delivery_unavailable", "intervention_required", "cancelled"] },
  failureCode: nullableText, sentAt: dateTime, updatedAt: dateTime, cooldownUntil: dateTime
};
const command = {
  expectedVendorVersion: integer, invitationId: nullableText, expectedInvitationVersion: nullableInteger,
  idempotencyKey: { ...text, minLength: 8, maxLength: 128 }
};
export const VENDOR_ACCESS_SCHEMAS = {
  VendorDeliveryReadiness: object({ state: { ...text, enum: ["ready", "paused", "unavailable"] }, reasonCode: nullableText, lastProcessedAt: dateTime }),
  VendorAccessInvitation: object({ id: text, version: integer,
    status: { ...text, enum: ["pending", "expired", "delivery_failed", "accepted", "revoked", "superseded"] },
    deliveryStatus: { ...text, enum: ["queued", "sent", "failed"] }, expiresAt: { ...text, format: "date-time" } }),
  VendorLoginAccess: object({ vendorId: text, vendorName: text, vendorVersion: integer,
    recipient: { ...object({ name: text, email: { ...text, format: "email" } }), nullable: true },
    access, invitation, delivery: object(delivery), readiness: ref("VendorDeliveryReadiness"), availableActions: actions, blockedReasonCode: nullableText }),
  VendorAccessIntent: object({ ...delivery, id: nullableText, version: nullableInteger,
    projectId: text, vendorId: text, vendorName: text, vendorVersion: integer, orderId: text, orderLabel: text,
    orderVersion: integer, revision: integer, access, invitation, readiness: ref("VendorDeliveryReadiness"),
    availableActions: actions, blockedReasonCode: nullableText, attempts: { type: "integer", minimum: 0 }, canRetry: { type: "boolean" } }),
  VendorAccessPage: object({ items: { type: "array", items: ref("VendorAccessIntent") }, total: { type: "integer", minimum: 0 }, readiness: ref("VendorDeliveryReadiness") }),
  VendorInvitationCommand: object(command),
  VendorOrderAccessCommand: object({ ...command, action: actions.items, expectedOrderVersion: integer,
    expectedOrderRevision: integer, expectedAccessVersion: nullableInteger })
};
const body = (schema: string) => ({ required: true, content: { "application/json": { schema: ref(schema) } } });
export const VENDOR_ACCESS_REQUESTS = {
  "POST /procurement/vendors/:vendorId/login-access/send": body("VendorInvitationCommand"),
  "POST /procurement/vendors/:vendorId/login-access/resend": body("VendorInvitationCommand"),
  "POST /projects/:projectId/vendor-access/orders/:orderId/send": body("VendorOrderAccessCommand")
};
export const VENDOR_ACCESS_RESPONSES = {
  "GET /procurement/vendors/:vendorId/login-access": "VendorLoginAccess",
  "POST /procurement/vendors/:vendorId/login-access/send": "VendorLoginAccess",
  "POST /procurement/vendors/:vendorId/login-access/resend": "VendorLoginAccess",
  "POST /projects/:projectId/vendor-access/orders/:orderId/send": "VendorAccessPage"
};
