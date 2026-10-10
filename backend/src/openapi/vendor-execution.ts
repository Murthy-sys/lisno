const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: "string" };
const integer = { type: "integer", minimum: 0 };
const nullableText = { ...text, nullable: true };
const dateTime = { type: "string", format: "date-time" };
const date = { type: "string", format: "date" };
const ids = { type: "array", items: text };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const page = (name: string, extra: Record<string, unknown> = {}) => object({ items: { type: "array", items: ref(name) }, total: integer, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: integer, ...extra });
const actions = ["setup", "acknowledge", "propose_schedule", "confirm_schedule", "report", "submit", "verify", "request_changes", "hold", "resume", "exempt_evidence"];
const command = object({ action: { ...text, enum: actions }, expectedVersion: integer, idempotencyKey: { ...text, minLength: 8, maxLength: 128 },
  note: { ...text, minLength: 1, maxLength: 2000 }, reason: { ...text, minLength: 1, maxLength: 2000 }, nextAction: { ...text, minLength: 1, maxLength: 2000 },
  progress: { type: "integer", minimum: 0, maximum: 100 }, status: { ...text, enum: ["not_started", "in_progress", "blocked"] }, startDate: date, finishDate: date, reviewDate: date, submissionId: text, imageIds: { ...ids, maxItems: 20, uniqueItems: true }
}, ["action", "expectedVersion", "idempotencyKey"]);
const policyFields = { timezone: text, reminderTime: { ...text, pattern: "^[0-2][0-9]:[0-5][0-9]$" }, deadlineTime: text, escalationTime: text, effectiveDate: date };
const counts = object(Object.fromEntries(["total", "open", "reported", "verified", "clientAccepted", "missing", "blocked", "overdue", "awaitingVerification", "setupRequired"].map(key => [key, integer])));
export const EXECUTION_SCHEMAS = {
  ExecutionCommand: { ...command, description: "Validated per action: schedule actions require dates; reports require status, progress and note; blocked reports also require reason and nextAction; reviews require the exact submissionId. Reasons are required for holds, resume, exemptions and rejection. Every mutation checks current identity, source, role, scope and expectedVersion." },
  ExecutionPolicy: object({ projectId: text, version: integer, ...policyFields }),
  ExecutionPolicyUpdate: object({ ...policyFields, expectedVersion: integer, idempotencyKey: { ...text, minLength: 8, maxLength: 128 }, reason: { ...text, minLength: 1, maxLength: 2000 } }),
  ExecutionCounts: counts,
  ExecutionProjectMetadata: object({ id: text, name: text, status: { ...text, enum: ["planning", "active", "on_hold", "completed"] }, completionAuthority: { ...text, enum: ["legacy_staff", "vendor_client"] } }),
  ExecutionVendorReport: object({ eventId: text, executionRound: integer, reportedAt: dateTime, note: text, reason: nullableText, nextAction: nullableText, progress: { type: "integer", minimum: 0, maximum: 100 }, status: { ...text, enum: ["not_started", "in_progress", "blocked"] } }),
  ExecutionDailyStatus: object({ localDate: date, dueAt: { ...dateTime, nullable: true }, state: { ...text, enum: ["not_due", "due", "on_time", "late", "missing", "exempt"] }, reportedAt: { ...dateTime, nullable: true } }),
  ExecutionWork: object({
    ...Object.fromEntries(["id", "projectId", "projectName", "vendorId", "vendorName", "orderId", "orderNumber", "lineId", "sourceLineItemKey", "itemName", "roomName", "description", "legacyStatus", "latestNote"].map(key => [key, text])),
    ...Object.fromEntries(["scopeType", "mainBasketId", "mainBasketName", "subBasketId", "subBasketName", "mainLineId", "uomCode"].map(key => [key, nullableText])),
    orderRevision: integer, sourceAvailable: { type: "boolean" }, quantityMilliUnits: { ...integer, nullable: true }, originalTargetDate: { ...date, nullable: true }, timezone: text,
    tracking: { ...text, enum: ["setup_required", "tracked", "legacy_review"] }, version: integer, executionRound: integer,
    status: { ...text, enum: ["assigned", "awaiting_schedule", "not_started", "in_progress", "blocked", "awaiting_verification", "site_verified", "awaiting_client", "changes_requested", "client_approved", "superseded"] }, progress: { type: "integer", minimum: 0, maximum: 100 },
    latestVendorReport: { allOf: [ref("ExecutionVendorReport")], nullable: true },
    latestReportAt: { ...dateTime, nullable: true }, acknowledgedAt: { ...dateTime, nullable: true },
    proposedSchedule: { ...object({ startDate: date, finishDate: date, reason: nullableText }), nullable: true },
    schedule: { ...object({ startDate: date, finishDate: date, revision: integer, confirmedAt: dateTime, confirmedById: text }), nullable: true },
    reportingStartsOn: { ...date, nullable: true }, hold: { ...object({ reason: text, startedAt: dateTime, reviewDate: date }), nullable: true },
    submission: { ...object({ id: text, submittedAt: dateTime, note: text, imageIds: ids, version: integer }), nullable: true },
    verification: { ...object({ id: text, verifiedAt: dateTime, verifiedById: text, executionRound: integer }), nullable: true },
    evidenceExemption: { ...object({ reason: text, grantedById: text }), nullable: true }, imageIds: ids, daily: ref("ExecutionDailyStatus"), flags: ids,
    nextOwner: { ...text, enum: ["vendor", "site_manager", "program_manager", "client", "super_admin", "none"] }, allowedActions: { type: "array", items: { ...text, enum: actions } }, canSubmitToClient: { type: "boolean" }
  }),
  ExecutionPage: page("ExecutionWork", { project: { allOf: [ref("ExecutionProjectMetadata")], nullable: true }, projectCounts: { allOf: [ref("ExecutionCounts")], nullable: true }, counts: ref("ExecutionCounts"), policy: { allOf: [ref("ExecutionPolicy")], nullable: true }, canManagePolicy: { type: "boolean" } }),
  ExecutionProject: object({ id: text, name: text, status: text, counts: ref("ExecutionCounts") }),
  ExecutionDeliveryHealth: object({ schedulerEnabled: { type: "boolean" }, accessDeliveryEnabled: { type: "boolean" }, lastSchedulerSuccessAt: { ...dateTime, nullable: true }, lastSchedulerFailureCode: nullableText, pendingEmails: integer, failedEmails: integer }),
  ExecutionPortfolio: page("ExecutionProject", { deliveryHealth: { allOf: [ref("ExecutionDeliveryHealth")], nullable: true, description: "Super Admin only. Other roles receive null." } }),
  ExecutionHistoryEvent: object({ id: text, assignmentId: text, action: text, actorId: text, occurredAt: dateTime, executionRound: integer, localDate: date, note: text, reason: nullableText, nextAction: nullableText, startDate: { ...date, nullable: true }, finishDate: { ...date, nullable: true }, reviewDate: { ...date, nullable: true }, progress: { ...integer, nullable: true }, status: nullableText }),
  ExecutionHistoryPage: page("ExecutionHistoryEvent"),
  ExecutionNotification: object({ id: text, projectId: text, projectName: text, kind: { ...text, enum: ["daily_reminder", "daily_escalation", "access_blocked", "verification_pending"] }, title: text, assignmentIds: ids, createdAt: dateTime, readAt: { ...dateTime, nullable: true }, deliveryStatus: text }),
  ExecutionNotificationPage: page("ExecutionNotification", { unreadCount: integer }),
  ExecutionNotificationRead: object({ readAt: dateTime }),
  VendorAccessRetry: object({ expectedVersion: { type: "integer", minimum: 1 }, idempotencyKey: { ...text, minLength: 8, maxLength: 128 } }),
};
export const EXECUTION_REQUESTS = {
  "POST /vendor/work/:assignmentId/execution": json("ExecutionCommand"),
  "POST /projects/:projectId/execution/:assignmentId": json("ExecutionCommand"),
  "PUT /projects/:projectId/execution-policy": json("ExecutionPolicyUpdate"),
  "POST /projects/:projectId/vendor-access/:intentId/retry": json("VendorAccessRetry")
};
export const EXECUTION_RESPONSES = {
  "GET /vendor/work/execution": "ExecutionPage", "GET /execution/projects": "ExecutionPortfolio", "GET /projects/:projectId/execution": "ExecutionPage",
  "GET /execution/work/:assignmentId": "ExecutionWork", "GET /execution/work/:assignmentId/history": "ExecutionHistoryPage",
  "POST /vendor/work/:assignmentId/execution": "ExecutionWork", "POST /projects/:projectId/execution/:assignmentId": "ExecutionWork",
  "GET /projects/:projectId/execution-policy": "ExecutionPolicy", "PUT /projects/:projectId/execution-policy": "ExecutionPolicy",
  "GET /execution/notifications": "ExecutionNotificationPage", "POST /execution/notifications/:notificationId/read": "ExecutionNotificationRead",
  "GET /projects/:projectId/vendor-access": "VendorAccessPage", "POST /projects/:projectId/vendor-access/:intentId/retry": "VendorAccessPage"
};
const queries = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } },
  ...["q", "vendorId", "status", "flag"].map(name => ({ name, in: "query", required: false, schema: text }))
];
export const EXECUTION_QUERIES = Object.fromEntries(["GET /vendor/work/execution", "GET /execution/projects", "GET /projects/:projectId/execution", "GET /execution/work/:assignmentId/history", "GET /execution/notifications"].map(key => [key, key === "GET /execution/projects" ? [...queries, { name: "projectScope", in: "query", required: false, schema: { type: "string", enum: ["current", "all"], default: "all" } }] : queries]));
