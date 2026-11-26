import { PROJECT_LANGUAGES } from "../contracts/project-initiation.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, required, properties
});
const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const nullableText = { ...text, nullable: true };
const date = { type: "string", format: "date-time" };
const nullableDate = { ...date, nullable: true };
const bool = { type: "boolean" };
const version = { type: "integer", minimum: 1 };
const idempotencyKey = { type: "string", minLength: 1, maxLength: 200 };
const language = { type: "string", enum: [...PROJECT_LANGUAGES] };
const status = { type: "string", enum: ["pending", "accepted", "declined", "cancelled"] };
const closureReason = { type: "string", enum: ["assigned_elsewhere", "cancelled_by_admin", null], nullable: true };
const person = object({ id, name: text });
const pagination = object({ limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 }, total: { type: "integer", minimum: 0 }, hasMore: bool });
const page = (schema: string) => object({ items: { type: "array", items: ref(schema) }, pagination });
const json = (schema: string) => ({ required: true, content: { "application/json": { schema: ref(schema) } } });
const pageQuery = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } }
];

export const DESIGNER_ASSIGNMENT_REQUESTS = {
  "POST /admin/projects/:projectId/designer-assignment-requests": json("CreateDesignerAssignmentRequest"),
  "POST /admin/projects/:projectId/designer-assignment-requests/:requestId/cancel": json("CancelDesignerAssignmentRequest"),
  "POST /designer/assignment-requests/:requestId/decision": json("DecideDesignerAssignmentRequest")
};
export const DESIGNER_ASSIGNMENT_RESPONSES = {
  "GET /designer/key-collection-reminders": "DesignerKeyCollectionReminderPage",
  "GET /admin/projects/:projectId/designer-suggestions": "DesignerSuggestionsPage",
  "GET /admin/projects/:projectId/designer-assignment-requests": "DesignerAssignmentRequestPage",
  "POST /admin/projects/:projectId/designer-assignment-requests": "DesignerAssignmentRequestSummary",
  "POST /admin/projects/:projectId/designer-assignment-requests/:requestId/cancel": "DesignerAssignmentRequestSummary",
  "GET /designer/assignment-requests": "DesignerAssignmentInboxPage",
  "POST /designer/assignment-requests/:requestId/decision": "DesignerAssignmentInboxItem"
};
export const DESIGNER_ASSIGNMENT_QUERIES = {
  "GET /designer/key-collection-reminders": [...pageQuery, { name: "status", in: "query", schema: { type: "string", enum: ["urgent", "pending"], default: "urgent" } }],
  "GET /admin/projects/:projectId/designer-suggestions": [...pageQuery, { name: "search", in: "query", schema: { ...text, maxLength: 200 } }],
  "GET /admin/projects/:projectId/designer-assignment-requests": pageQuery,
  "GET /designer/assignment-requests": [...pageQuery, { name: "status", in: "query", schema: status }]
};
export const DESIGNER_ASSIGNMENT_SCHEMAS = {
  CreateDesignerAssignmentRequest: object({ designerId: id, expectedSourceRevision: { ...id, pattern: "^[a-f0-9]{64}$" }, idempotencyKey }),
  CancelDesignerAssignmentRequest: object({ expectedVersion: version, idempotencyKey }),
  DecideDesignerAssignmentRequest: object({ expectedVersion: version, decision: { type: "string", enum: ["accept", "decline"] }, idempotencyKey, note: { ...text, maxLength: 1000, description: "Optional decline note; not accepted with an acceptance decision." } }, ["expectedVersion", "decision", "idempotencyKey"]),
  DesignerSuggestion: object({
    id, name: text, activeProjectCount: { type: "integer", minimum: 0 },
    languagesKnown: { type: "array", items: language }, preferredLanguage: { ...language, nullable: true },
    location: nullableText,
    languageMatch: { type: "string", enum: ["preferred", "known", "none", "unknown"] },
    locationMatch: { type: "string", enum: ["same_location", "city_text", "none", "unknown"] },
    eligible: bool, blockedReason: nullableText
  }),
  DesignerAssignmentRequestSummary: object({
    id, projectId: id, projectName: text, designer: person, status, version,
    createdAt: date, decidedAt: nullableDate, note: nullableText, closureReason
  }),
  DesignerSuggestionsPage: object({
    projectId: id, serverNow: date, sourceRevision: nullableText,
    projectPreferredLanguage: { ...language, nullable: true }, projectLocation: nullableText,
    projectCity: nullableText, currentDesigner: { ...person, nullable: true },
    pendingRequests: { type: "array", items: ref("DesignerAssignmentRequestSummary") },
    pendingRequest: { allOf: [ref("DesignerAssignmentRequestSummary")], nullable: true, deprecated: true,
      description: "The sole pending request when exactly one exists; otherwise null. Use pendingRequests." },
    canRequest: bool, blockedReason: nullableText,
    items: { type: "array", items: ref("DesignerSuggestion") }, pagination
  }),
  DesignerAssignmentRequestPage: page("DesignerAssignmentRequestSummary"),
  DesignerAssignmentInboxItem: object({
    id, projectId: id, projectName: text, projectLocation: nullableText,
    preferredLanguage: { ...language, nullable: true },
    scopeSummary: object({ itemCount: { type: "integer", minimum: 0 }, sectionCount: { type: "integer", minimum: 0 }, roomCount: { type: "integer", minimum: 0 } }),
    status, version, createdAt: date, decidedAt: nullableDate, canDecide: bool, blockedReason: nullableText, closureReason
  }),
  DesignerAssignmentInboxPage: page("DesignerAssignmentInboxItem"),
  KeyCollectionTiming: object({
    appointmentId: id, zone: { type: "string", enum: ["green", "orange", "red"] },
    orangeAt: date, redAt: date, orangeWarningAt: date, redWarningAt: date
  }),
  DesignerKeyCollectionReminderItem: object({
    projectId: id, projectName: text, stageId: id,
    appointment: ref("KeyCollectionAppointmentView"), blockers: { type: "array", items: text }
  }),
  DesignerKeyCollectionReminderPage: object({
    serverNow: date, urgentCount: { type: "integer", minimum: 0 }, nextRedAt: nullableDate,
    items: { type: "array", items: ref("DesignerKeyCollectionReminderItem") }, pagination
  }),
  KeyCollectionScheduleData: {
    oneOf: [
      object({ mode: { type: "string", enum: ["within_48_hours"] }, expectedAssignmentRevision: id }),
      object({ mode: { type: "string", enum: ["chosen_datetime"] }, scheduledAt: date, expectedAssignmentRevision: id })
    ],
    description: "Personal linked-Client confirmation. The 48-hour clock starts at server confirmation. Chosen time must be a future explicit UTC instant. The original deadline is immutable, including across reassignment. Both kickoffs still gate actual key handover/receipt."
  },
  KeyCollectionAppointmentView: object({
    mode: { type: "string", enum: ["within_48_hours", "chosen_datetime"] },
    confirmedAt: date, originalDeadlineAt: date, deadlineAt: date,
    receivedAt: nullableDate, handedOverAt: nullableDate, completedAt: nullableDate,
    remainingMs: { type: "number", minimum: 0 }, overdue: bool,
    timing: { allOf: [ref("KeyCollectionTiming")], nullable: true }
  }, ["mode", "confirmedAt", "originalDeadlineAt", "deadlineAt", "receivedAt", "handedOverAt", "completedAt", "remainingMs", "overdue"]),
  DesignerHandoffView: object({
    initialEstimateApproved: bool, executionAvailable: bool,
    state: { type: "string", enum: ["awaiting_approval", "awaiting_designer", "awaiting_client_schedule", "scheduled", "received", "completed", "source_issue"] },
    designer: { ...person, nullable: true }, assignmentRevision: nullableText,
    appointment: { allOf: [ref("KeyCollectionAppointmentView")], nullable: true },
    canSchedule: bool, blockers: { type: "array", items: text }
  })
};
