/** Runtime Zod/service validation remains authoritative for role, source and transition checks. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 160 };
const sourceId = { ...text, minLength: 1, maxLength: 500 };
const nullableText = { ...text, nullable: true };
const integer = { type: "integer", minimum: 0 };
const version = { ...integer, maximum: Number.MAX_SAFE_INTEGER - 1 };
const date = { ...text, format: "date" };
const dateTime = { ...text, format: "date-time" };
const reason = { ...text, minLength: 3, maxLength: 2000 };
const reasonOptional = { ...text, maxLength: 2000, nullable: true };
const ids = { type: "array", items: id };
const evidenceIds = { ...ids, maxItems: 12, default: [] };
const bool = { type: "boolean" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const array = (name: string) => ({ type: "array", items: ref(name) });
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } }, "x-lisno-schema-completeness": "exact" });
const command = { expectedVersion: version, idempotencyKey: { ...text, minLength: 8, maxLength: 128 } };
const commandRequired = ["expectedVersion", "idempotencyKey"];
const token = { ...text, minLength: 1, maxLength: 160 };
const digest = { ...text, pattern: "^[a-f0-9]{64}$" };
const availability = { ...text, enum: ["available", "not_configured", "no_data", "source_unavailable"] };
const severity = { ...text, enum: ["critical", "warning", "neutral", "success"] };
const health = { ...text, enum: ["critical", "at_risk", "incomplete", "setup", "on_track", "completed"] };
const tab = { ...text, enum: ["site", "procurement", "selections", "supply", "vendors", "client", "snagging", "quality"] };
const paise = { ...integer, nullable: true, description: "Integer paise from the identified source. Null means unavailable. Certification is not payment." };
const percentage = { type: "number", minimum: 0, maximum: 100, nullable: true };
const history = object({ id, action: text, actorName: text, at: dateTime, reason: nullableText });
const noteCreate = { ...command, recordId: id, vendorId: id, sourceToken: token, reason, evidenceIds };
const noteRequired = [...commandRequired, "recordId", "vendorId", "sourceToken", "kind", "reason"];
const requestBase = { ...command, sourceToken: digest };
const qualityAnswerFields = { id, evidenceIds: { ...evidenceIds, uniqueItems: true }, sampleCount: { type: "integer", minimum: 1, maximum: 1000, default: 1 } };
const qualityAnswer = { oneOf: [
  object({ ...qualityAnswerFields, answer: { ...text, enum: ["pass"] }, reason: reasonOptional }, ["id", "answer"]),
  object({ ...qualityAnswerFields, answer: { ...text, enum: ["fail", "not_applicable"] }, reason }, ["id", "answer", "reason"])
] };

export const PROJECT_MANAGER_SCHEMAS = {
  PMFact: object({ label: text, value: text }),
  PMAction: object({ id, label: text, reasonRequired: bool, href: text }, ["id", "label"]),
  PMHistory: history,
  PMPerson: object({ id, name: text, role: text }),
  PMSource: object({ id: sourceId, label: text, sourceToken: text, lineItemKey: sourceId, sectionId: id, roomId: { ...id, nullable: true }, assignmentId: id, vendorId: id, ownerIds: ids, quantity: { type: "number", minimum: 0, exclusiveMinimum: true }, unit: text }, ["id", "label", "sourceToken"]),
  PMCheck: object({ id, label: text, answer: { ...text, nullable: true, enum: ["pass", "fail", "not_applicable", null] }, reason: nullableText, evidenceIds: ids, instructions: nullableText, sampleCount: { type: "integer", minimum: 1 },
    evidence: { ...object({ photos: bool, documents: bool, video: bool, minPhotosPerSample: { type: "integer", minimum: 1, nullable: true }, instructions: nullableText }, ["photos", "documents", "video"]), nullable: true }
  }, ["id", "label", "answer", "reason", "evidenceIds"]),
  PMItem: object({ id: sourceId, kind: text, title: text, status: text, severity, version: integer, sourceToken: nullableText,
    sourceId, assignmentId: id, vendorId: id, orderId: id, basketId: id, week: date, milestoneId: id, roomId: { ...id, nullable: true }, roomName: nullableText,
    tradeId: { ...id, nullable: true }, tradeName: nullableText, vendorName: nullableText, ownerId: { ...id, nullable: true }, ownerName: nullableText, description: nullableText, dueAt: { ...text, nullable: true, description: "Source deadline as a date or timestamp; null when unavailable." },
    amountPaise: paise, progress: percentage, facts: array("PMFact"), actions: array("PMAction"), history: array("PMHistory"), checks: array("PMCheck"), children: array("PMItem"), evidenceIds: ids, href: text, sourceAvailable: bool
  }, ["id", "kind", "title", "status", "severity", "version", "sourceToken", "facts", "actions"]),
  PMSnagFilterOptions: object({ rooms: { type: "array", items: object({ id, label: text }) }, trades: { type: "array", items: object({ id, label: text }) }, vendors: { type: "array", items: object({ id, label: text }) } }),
  PMPanel: { ...object({ snagFilters: ref("PMSnagFilterOptions"), tab, availability, calculatedAt: dateTime, items: array("PMItem"), total: integer, issues: { type: "array", items: text }, sources: array("PMSource"), people: array("PMPerson"), actions: array("PMAction") }, ["tab", "availability", "calculatedAt", "items", "total", "issues", "sources", "people", "actions"]),
    description: "Authorized operational view. Paginated tabs report the exact matching record total before offset/limit. Vendor records are flat (summary, notice, certification and milestone); quality includes current weekly candidates and historical audits. Reads do not create workflow records." },
  PMProgress: { ...object({ basis: { ...text, enum: ["approved_execution_scope_v1"] }, actual: percentage, planned: percentage, availability, sourceRevision: nullableText, issues: { type: "array", items: text }, requiredLines: integer, coveredLines: integer, zeroValueLines: integer, reportedComplete: integer, siteVerified: integer, clientAccepted: integer }),
    description: "Quantity-normalized executable progress weighted by frozen client-approved ex-GST line amounts. Missing/ambiguous required source returns null, never fabricated zero. Planned progress uses inclusive confirmed calendar dates. Reported progress, Site verification and Client acceptance are distinct." },
  PMProject: object({ id, name: text, clientName: text, location: text, status: { ...text, enum: ["planning", "active", "on_hold", "completed"] }, health, progress: ref("PMProgress"), plannedEndAt: { ...dateTime, nullable: true }, approvedNetPaise: paise, issues: { type: "array", items: text }, activeAlerts: integer }),
  PMAlert: object({ id: sourceId, projectId: id, projectName: text, tab, entityId: { ...sourceId, nullable: true }, offset: integer, title: text, detail: text, severity, dueAt: { ...text, nullable: true } }, ["id", "projectId", "projectName", "tab", "entityId", "title", "detail", "severity", "dueAt"]),
  PMPortfolio: object({ items: array("PMProject"), total: integer, counts: object({ active: integer, atRisk: integer, critical: integer, setup: integer, onTrack: integer, incomplete: integer }), alerts: { ...array("PMAlert"), maxItems: 8 }, alertTotal: integer, calculatedAt: dateTime }),
  PMAlertPage: object({ items: array("PMAlert"), total: integer }),
  PMOverview: object({ project: ref("PMProject"), capabilities: { type: "array", items: text }, calculatedAt: dateTime }),
  PMPerformance: { ...object({ availability, policy: nullableText, message: text, calculatedAt: dateTime, metrics: array("PMFact") }), description: "Self-only PM operational evidence. Until a PM KPI policy exists, availability is not_configured and no composite KPI is invented." },
  PMLeaderboard: { ...object({ availability, period: text, policy: nullableText, message: text, items: { type: "array", items: object({ id, name: text, role: text, score: { type: "number" }, rank: { type: "integer", minimum: 1 } }) } }), description: "Minimal staff ranking contract; no emails, project details, bonus/pay or manager evaluations. PMs are unranked while the comparable policy is not configured." },
  PMBonus: { ...object({ availability, policy: nullableText, message: text, statements: { type: "array", items: object({ id, period: text, amountPaise: { ...integer }, status: text }) } }), description: "Self-only bonus availability. Current PM policy is not_configured with an empty statement list; no rate, deduction or earnings are inferred from the reference UI." },
  PMNotification: object({ id, projectId: id, entityId: sourceId, family: text, action: text, title: text, description: nullableText, at: dateTime, read: bool }),
  PMNotificationPage: object({ items: array("PMNotification"), total: integer, unreadTotal: integer }),
  PMNotificationRead: object({ read: { ...bool, enum: [true] } }),
  PMRequestCreate: { ...object({ ...requestBase, sourceId, quantity: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 1000000000 }, unit: { ...text, maxLength: 60 }, title: { ...text, minLength: 1, maxLength: 300 }, reason, dueAt: dateTime, ownerId: sourceId }, [...commandRequired, "sourceToken", "sourceId", "reason"]), description: "Creates an operational request tied to an authorized current source token. Procurement receives and fulfills a procurement request; PM acknowledgement of a selection cannot decide a Designer/Client requirement." },
  PMRequestAction: { oneOf: [
    object({ ...requestBase, action: { ...text, enum: ["acknowledge", "reject", "remind", "escalate"] }, reason }, [...commandRequired, "sourceToken", "action", "reason"]),
    object({ ...requestBase, action: { ...text, enum: ["fulfill"] }, reason, artifact: object({ kind: { ...text, enum: ["procurement_item", "purchase_order_request", "purchase_order"] }, id: sourceId, lineId: sourceId }, ["kind", "id"]) }, [...commandRequired, "sourceToken", "action", "reason", "artifact"])
  ], description: "Current assigned Procurement alone acknowledges/fulfills/rejects procurement requests, with a validated linked source artifact. PM may remind/escalate or acknowledge selection awareness. Replays revalidate access before returning a receipt." },
  PMSupplyAction: object({ ...requestBase, action: { ...text, enum: ["sign_off", "remind", "reopen"] }, reason, evidenceIds: { type: "array", items: sourceId, maxItems: 12, default: [] } }, [...commandRequired, "sourceToken", "action", "reason"]),
  PMNoticeCreate: { oneOf: [
    object({ ...noteCreate, expectedVersion: { ...integer, enum: [0] }, kind: { ...text, enum: ["quality", "absenteeism", "misbehaviour", "ppe", "cleaning"] }, assignments: { type: "array", maxItems: 0, items: object({ assignmentId: id, expectedVersion: { type: "integer", minimum: 1 } }), default: [] } }, noteRequired),
    object({ ...noteCreate, expectedVersion: { ...integer, enum: [0] }, kind: { ...text, enum: ["stop_work"] }, reviewDate: date, assignments: { type: "array", minItems: 1, maxItems: 100, items: object({ assignmentId: id, expectedVersion: { type: "integer", minimum: 1 } }) } }, [...noteRequired, "reviewDate", "assignments"])
  ], description: "PM-only reasoned notice. Stop Work requires a future local review date and distinct eligible tracked assignments. All selected holds and the notice commit atomically; any stale/ineligible assignment rolls everything back. No legacy work is auto-initialized." },
  PMNoticeAction: object({ ...command, action: { ...text, enum: ["resolve", "acknowledge"] }, reason, evidenceIds }, [...commandRequired, "action", "reason"]),
  PMCertificationCreate: { ...object({ ...command, expectedVersion: { ...integer, enum: [0] }, recordId: id, orderId: id, milestoneId: id, sourceToken: token, reason, evidenceIds }, [...commandRequired, "recordId", "orderId", "milestoneId", "sourceToken", "reason"]), description: "Assigned Procurement requests certification against an exact issued payment milestone and frozen reviewer identities. The legacy program_manager slot names the consolidated Project Manager reviewer. Decisions require the exact current and frozen issued actor identity." },
  PMCertificationAction: { ...object({ ...command, action: { ...text, enum: ["certify", "reject"] }, sourceToken: token, reason, evidenceIds }, [...commandRequired, "action", "sourceToken", "reason"]), description: "Only the current configured reviewer with the frozen issued identity may decide its own slot. Reassignment/source changes require reconciliation. Certification never posts a payment or changes Finance invoice review. Ledger direct-spend values are recorded costs, not proof of payout." },
  PMQualityAnswer: qualityAnswer,
  PMQualitySave: { oneOf: [
    object({ ...command, action: { ...text, enum: ["save"] }, orderId: id, basketId: id, sourceToken: token, week: date, answers: { ...array("PMQualityAnswer"), maxItems: 200 } }, [...commandRequired, "action", "orderId", "basketId", "sourceToken", "week", "answers"]),
    object({ ...command, action: { ...text, enum: ["correct"] }, reason }, [...commandRequired, "action", "reason"])
  ], description: "PM draft answers use the current issued order and verified Main Basket Configuration revision. week is Monday in Asia/Kolkata. Signed audits are immutable; correct creates a linked new draft with its own ID. New drafts use the deterministic audit ID supplied in PMPanel." },
  PMQualitySign: { ...object({ ...command, sourceToken: token, reason }, [...commandRequired, "sourceToken", "reason"]), description: "Requires every snapshotted check answered; failure/NA reasons; project/record-bound evidence including required photos per sample, documents and video. Revalidates the current checklist and issued source. Signing retains failed findings and does not assert every check passed." },
  PMEscalationCreate: object({ ...command, expectedVersion: { ...integer, enum: [0] }, recordId: id, title: { ...text, minLength: 3, maxLength: 180 }, description: reason, ownerId: id, followUpAt: { ...dateTime, nullable: true }, evidenceIds }, [...commandRequired, "title", "description"]),
  PMEscalationAction: object({ ...command, action: { ...text, enum: ["pending", "resolve", "reopen", "follow_up", "escalate"] }, reason, ownerId: id, followUpAt: { ...dateTime, nullable: true }, evidenceIds }, [...commandRequired, "action", "reason"]),
  PMSnagCreate: object({ ...command, expectedVersion: { ...integer, enum: [0] }, recordId: id, title: { ...text, minLength: 3, maxLength: 180 }, description: reason, assignmentId: id, ownerId: id, severity: { ...text, enum: ["critical", "warning", "neutral"] }, dueAt: { ...dateTime, nullable: true }, evidenceIds }, [...commandRequired, "title", "description", "severity"]),
  PMSnagAction: { ...object({ ...command, ownerId: id, action: { ...text, enum: ["start", "resolve", "verify", "reopen", "assign"] }, reason, evidenceIds }, [...commandRequired, "action", "reason"]), description: "A resolved snag still blocks handover until separately verified. Logging/reopening coordinates transactionally with completion; Client request-changes remains available." },
  PMSnagVisit: { ...object({ ...command, expectedVersion: { ...integer, enum: [0] }, recordId: id, visitedAt: dateTime, reason, snagIds: { ...ids, minItems: 1, maxItems: 100 }, evidenceIds }, [...commandRequired, "visitedAt", "reason", "snagIds"]), description: "Records an actual dated visit against authorized project snags. It does not calculate a bonus deduction." },
  PMEvidenceUpload: { oneOf: [
    object({ mediaFiles: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", format: "binary" } } }),
    object({ file: { type: "string", format: "binary" }, mediaFiles: { type: "array", minItems: 1, maxItems: 11, items: { type: "string", format: "binary" } } }, ["file"])
  ], description: "Send photos/videos using mediaFiles and at most one supporting document using file. One to twelve validated files in total. Entity ID is the stable parent record/draft ID used by the later command; opaque evidence IDs are returned. Signature/type checks, authenticated reads and compensating cleanup apply." },
  PMEvidenceFile: object({ id, name: text, mimeType: text, kind: { ...text, enum: ["image", "video", "document"] } }),
  PMEvidenceFiles: array("PMEvidenceFile")
};

const project = "/projects/:projectId/pm";
export const PROJECT_MANAGER_REQUESTS = {
  [`POST ${project}/procurement-requests`]: json("PMRequestCreate"),
  [`POST ${project}/procurement-requests/:requestId/actions`]: json("PMRequestAction"),
  [`POST ${project}/selection-requests`]: json("PMRequestCreate"),
  [`POST ${project}/selection-requests/:requestId/actions`]: json("PMRequestAction"),
  [`POST ${project}/supply-milestones/:milestoneId/actions`]: json("PMSupplyAction"),
  [`POST ${project}/vendor-notices`]: json("PMNoticeCreate"),
  [`POST ${project}/vendor-notices/:noticeId/actions`]: json("PMNoticeAction"),
  [`POST ${project}/certifications`]: json("PMCertificationCreate"),
  [`POST ${project}/certifications/:certificationId/actions`]: json("PMCertificationAction"),
  [`PUT ${project}/quality-audits/:auditId`]: json("PMQualitySave"),
  [`POST ${project}/quality-audits/:auditId/sign`]: json("PMQualitySign"),
  [`POST ${project}/escalations`]: json("PMEscalationCreate"),
  [`POST ${project}/escalations/:escalationId/actions`]: json("PMEscalationAction"),
  [`POST ${project}/snags`]: json("PMSnagCreate"),
  [`POST ${project}/snags/:snagId/actions`]: json("PMSnagAction"),
  [`POST ${project}/snag-visits`]: json("PMSnagVisit"),
  [`POST ${project}/evidence/:entityId`]: { required: true, content: { "multipart/form-data": { schema: ref("PMEvidenceUpload") } }, "x-lisno-schema-completeness": "exact" }
};
export const PROJECT_MANAGER_RESPONSES = {
  "GET /project-manager/projects": "PMPortfolio", "GET /project-manager/alerts": "PMAlertPage", [`GET ${project}/overview`]: "PMOverview",
  ...Object.fromEntries(["site", "procurement", "selections", "supply", "vendors", "client", "snagging", "quality"].map(name => [`GET ${project}/${name}`, "PMPanel"])),
  ...Object.fromEntries(Object.keys(PROJECT_MANAGER_REQUESTS).filter(key => !key.includes("/evidence/")).map(key => [key, "PMItem"])),
  "GET /project-manager/performance": "PMPerformance", "GET /project-manager/leaderboard": "PMLeaderboard", "GET /project-manager/bonus": "PMBonus",
  "GET /project-manager/notifications": "PMNotificationPage", "POST /project-manager/notifications/:notificationId/read": "PMNotificationRead",
  [`POST ${project}/evidence/:entityId`]: "PMEvidenceFiles"
};
const query = (name: string, schema: Record<string, unknown>, description?: string) => ({ name, in: "query", required: false, schema, ...(description ? { description } : {}) });
const pagination = [query("limit", { type: "integer", minimum: 1, maximum: 100, default: 50 }), query("offset", { ...integer, maximum: 100000, default: 0 })];
const portfolioQueries = [query("q", { ...text, maxLength: 160 }), query("status", { ...text, enum: ["current", "all", "planning", "active", "on_hold", "completed"], default: "current" }),
  query("health", { ...text, enum: ["all", "critical", "at_risk", "incomplete", "setup", "on_track", "completed"], default: "all" }, "At risk includes critical projects. Counts are calculated after search/lifecycle filtering and before health filtering/pagination."),
  query("limit", { type: "integer", minimum: 1, maximum: 50, default: 20 }), query("offset", { ...integer, default: 0 })];
export const PROJECT_MANAGER_QUERIES = {
  "GET /project-manager/projects": portfolioQueries, "GET /project-manager/alerts": portfolioQueries,
  "GET /project-manager/notifications": pagination,
  ...Object.fromEntries(["procurement", "selections", "supply", "client", "quality"].map(name => [`GET ${project}/${name}`, pagination])),
  [`GET ${project}/vendors`]: [...pagination, query("kind", { ...text, enum: ["vendor", "vendor_notice", "certification", "payment_milestone"] }), query("vendorId", id)],
  [`GET ${project}/snagging`]: [...pagination, query("kind", { ...text, enum: ["snags", "visits"], default: "snags" }), query("roomId", id), query("tradeId", id), query("vendorId", id), query("status", { ...text, enum: ["open", "in_progress", "resolved", "verified"] })]
};
export const PROJECT_MANAGER_SUMMARIES = {
  "GET /project-manager/projects": "Read assigned Project Manager dashboard and complete health counts",
  "GET /project-manager/alerts": "Read authorized project alerts with tab/entity targets",
  [`GET ${project}/overview`]: "Read assigned project overview and source-backed progress",
  ...Object.fromEntries(["site", "procurement", "selections", "supply", "vendors", "client", "snagging", "quality"].map(name => [`GET ${project}/${name}`, `Read project ${name} operational view`])),
  "GET /project-manager/performance": "Read own PM operational evidence and KPI availability",
  "GET /project-manager/leaderboard": "Read privacy-limited comparable staff ranking availability",
  "GET /project-manager/bonus": "Read own bonus policy availability and statements",
  "GET /project-manager/notifications": "Read recipient-only operational notifications",
  "POST /project-manager/notifications/:notificationId/read": "Mark an authorized notification read",
  [`POST ${project}/evidence/:entityId`]: "Upload authenticated evidence bound to a project record",
  [`GET ${project}/evidence/:evidenceId`]: "Download an authorized opaque evidence file",
  [`POST ${project}/vendor-notices`]: "Issue a vendor notice and atomically hold selected work when required",
  [`POST ${project}/certifications`]: "Request certification for an issued payment milestone",
  [`POST ${project}/certifications/:certificationId/actions`]: "Record the configured reviewer's milestone decision",
  [`PUT ${project}/quality-audits/:auditId`]: "Save a weekly audit draft or create a correction",
  [`POST ${project}/quality-audits/:auditId/sign`]: "Sign a complete source-validated weekly audit"
};
export const PROJECT_MANAGER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [`GET ${project}/vendors`]: "Flat independently pageable vendor summaries, notices, certifications and issued milestone records. The legacy program_manager reviewer slot names the consolidated Project Manager; the current actor must still match the frozen issued identity. Recorded Procurement ledger costs never prove payment. All reads recheck current role and project/vendor assignment.",
  [`GET ${project}/quality`]: "Exact paginated total includes current weekly candidates and all retained audit history. Checklist data comes from verified Main Basket Configuration revisions; signed audit snapshots remain immutable even when Configuration changes.",
  "GET /project-manager/leaderboard": "Only minimal comparable identity/role/score data belongs here. No client/vendor ranking, personal pay, private evaluations or project details. Current PM policy is unavailable so the list is empty.",
  "GET /project-manager/bonus": "Self-only. Policy is not configured: no inferred earnings, reference percentages or penalties and no fabricated statements.",
  [`POST ${project}/vendor-notices/:noticeId/actions`]: "Assigned PM resolves notices. Only the uniquely active linked vendor for current issued work may acknowledge its own notice. Resolving a Stop Work notice does not resume assignments; review and resume through the existing execution workflow."
};
