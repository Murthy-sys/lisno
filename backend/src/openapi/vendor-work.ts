const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const key = { type: "string", minLength: 8, maxLength: 128 };
const dateTime = { type: "string", format: "date-time" };
const nullableDateTime = { ...dateTime, nullable: true };
const nullableText = { type: "string", nullable: true };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const task = object({
  id, projectId: id, vendorId: id, orderId: id, orderRevision: version, lineId: id,
  sourceSectionId: id, sectionLabel: { type: "string" }, sourceLineItemKey: id,
  roomName: { type: "string" }, itemName: { type: "string" },
  scopeType: { type: "string", enum: ["supply", "execution", "supply_and_execution"], nullable: true },
  description: { type: "string" }, targetDate: { type: "string", format: "date", nullable: true },
  deliveryLocation: nullableText,
  status: { type: "string", enum: ["awaiting_vendor_access", "ready", "in_progress", "submitted_for_client", "changes_requested", "client_approved", "superseded"] },
  version, progress: { type: "integer", minimum: 0, maximum: 100 },
  displayProgress: { type: "integer", minimum: 0, maximum: 100 },
  progressSource: { type: "string", enum: ["vendor", "site_manager"] }, currentRound: version,
  note: { type: "string" }, requestedChangeReason: nullableText, imageCount: { type: "integer", minimum: 0 },
  imageIds: { type: "array", items: id },
  submittedAt: nullableDateTime, acceptedAt: nullableDateTime
});
const review = object({
  id, projectId: id, assignmentId: id, round: version,
  status: { type: "string", enum: ["pending", "approved", "changes_requested"] }, version,
  roomName: { type: "string" }, itemName: { type: "string" }, scopeType: nullableText,
  description: { type: "string" }, sourceSectionId: id, sectionLabel: { type: "string" },
  note: { type: "string" }, progress: { type: "integer", minimum: 0, maximum: 100 }, submittedAt: dateTime,
  imageIds: { type: "array", items: id },
  decision: { ...object({ decision: { type: "string", enum: ["approve", "request_changes"] }, reason: nullableText, decidedAt: dateTime }), nullable: true }
});

export const VENDOR_WORK_SCHEMAS = {
  VendorWorkTask: task,
  VendorWorkTaskPage: object({ items: { type: "array", items: ref("VendorWorkTask") }, total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } }),
  VendorWorkProgress: object({ expectedVersion: version, idempotencyKey: key, progress: { type: "integer", minimum: 0, maximum: 100 }, note: { type: "string", maxLength: 2_000 } }, ["expectedVersion", "idempotencyKey", "progress"]),
  VendorWorkImageUpload: object({ expectedVersion: version, idempotencyKey: key, image: { type: "string", format: "binary", description: "JPEG, PNG, or WebP image with matching filename, signature, and MIME type." } }),
  VendorWorkSubmit: object({ expectedVersion: version, idempotencyKey: key, note: { type: "string", minLength: 1, maxLength: 2_000 } }),
  ClientVendorWorkReview: review,
  ClientVendorWorkReviewPage: object({
    items: { type: "array", items: ref("ClientVendorWorkReview") },
    total: { type: "integer", minimum: 0 },
    pendingTotal: { type: "integer", minimum: 0 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0 }
  }),
  ClientVendorWorkDecision: object({ expectedVersion: version, idempotencyKey: key, decision: { type: "string", enum: ["approve", "request_changes"] }, reason: nullableText }, ["expectedVersion", "idempotencyKey", "decision"]),
  VendorWorkProjectProgress: object({ projectId: id, assignments: { type: "array", items: ref("VendorWorkTask") }, pendingOwner: { type: "string", enum: ["site_manager", "vendor", "client", "super_admin", "none"] } })
};

export const VENDOR_WORK_REQUESTS = {
  "PATCH /vendor/work/:assignmentId/progress": json("VendorWorkProgress"),
  "POST /vendor/work/:assignmentId/images": { required: true, content: { "multipart/form-data": { schema: ref("VendorWorkImageUpload") } } },
  "POST /vendor/work/:assignmentId/submit": json("VendorWorkSubmit"),
  "POST /clients/projects/:projectId/vendor-work-reviews/:reviewId/decision": json("ClientVendorWorkDecision")
};

export const VENDOR_WORK_RESPONSES = {
  "GET /vendor/work": "VendorWorkTaskPage",
  "GET /vendor/work/:assignmentId": "VendorWorkTask",
  "PATCH /vendor/work/:assignmentId/progress": "VendorWorkTask",
  "POST /vendor/work/:assignmentId/images": "VendorWorkTask",
  "POST /vendor/work/:assignmentId/submit": "ClientVendorWorkReview",
  "GET /clients/projects/:projectId/vendor-work-reviews": "ClientVendorWorkReviewPage",
  "POST /clients/projects/:projectId/vendor-work-reviews/:reviewId/decision": "ClientVendorWorkReview",
  "GET /projects/:projectId/vendor-work-progress": "VendorWorkProjectProgress"
};

export const VENDOR_WORK_QUERY_PARAMETERS = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } }
] as const;
