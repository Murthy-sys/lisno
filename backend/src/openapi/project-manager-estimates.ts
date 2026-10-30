const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 500 };
const integer = { type: "integer", minimum: 0 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const nullableText = { ...text, nullable: true };
const time = { ...text, format: "date-time", nullable: true };
const paise = { ...integer, nullable: true, description: "Integer paise; null means unavailable." };
const bool = { type: "boolean" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullableRef = (name: string) => ({ allOf: [ref(name)], nullable: true });
const array = (name: string) => ({ type: "array", items: ref(name) });
const strings = { type: "array", items: text };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const withItemType = (schema: ReturnType<typeof object>) => ({ ...schema,
  properties: { ...schema.properties, itemType: { ...text, enum: ["main_line", "temporary"] } } });
const withReinstatementAvailability = (schema: ReturnType<typeof object>) => ({ ...schema,
  properties: { ...schema.properties, reinstatementAvailability: {
    allOf: [ref("PMWriteAvailability")],
    description: "Present for Main Line suggestions. Reinstatement requires an owned, current withdrawn suggestion, current Configuration vendor membership and effective vendor activation. Independent of note editing and dispatch readiness."
  } } });
const actor = object({ id, name: text });
const note = { ...text, maxLength: 1000 };
const status = { ...text, enum: ["suggested", "withdrawn"] };
const commandKey = { ...text, minLength: 8, maxLength: 120 };
const page = { total: integer, limit: { type: "integer", minimum: 1, maximum: 50 }, offset: integer };
const source = object({ estimateId: id, estimateVersion: version, estimateReviewRoundId: id,
  phase: { ...text, enum: ["pre", "post", "legacy"] }, designPlanVersion: integer,
  sourceSnapshotId: { ...id, nullable: true }, sourceDigest: { ...text, pattern: "^[a-f0-9]{64}$", nullable: true } });

export const PM_ESTIMATE_SCHEMAS = {
  PMApprovedSourceRef: { ...source, description: "Verified immutable approval source. Zero Design version is allowed only for approved collaborative pre/post sources; legacy requires positive Design version." },
  PMLineOccurrence: object({ sourceLineItemKey: id, sectionId: id, roomId: { ...id, nullable: true }, roomName: text }),
  PMEstimateDimension: object({ label: text, value: text, unit: nullableText }),
  PMEstimateLine: withItemType(object({ sourceLineItemKey: id, sectionId: id, roomId: { ...id, nullable: true }, roomName: text,
    mainLineId: { ...id, nullable: true }, mainLineName: text, mainBasketId: { ...id, nullable: true }, mainBasketName: nullableText,
    specification: text, included: bool, quantity: { type: "number", nullable: true }, unit: text, ratePaise: paise, amountPaise: paise,
    dimensions: array("PMEstimateDimension") })),
  PMMainLineScope: withItemType(object({ mainLineId: id, mainLineName: text, mainBasketId: { ...id, nullable: true }, mainBasketName: nullableText,
    occurrences: array("PMLineOccurrence"), scopeDigest: text, canSuggest: bool, unavailableReason: nullableText })),
  PMWriteAvailability: object({ available: bool, reason: nullableText }),
  PMEstimateView: object({ project: actor, availability: { ...text, enum: ["available", "unavailable"] }, reason: nullableText,
    source: nullableRef("PMApprovedSourceRef"), approvedAt: time, lines: array("PMEstimateLine"), mainLines: array("PMMainLineScope"),
    totals: object({ subtotalPaise: paise, gstPaise: paise, totalPaise: paise }), writeAvailability: ref("PMWriteAvailability") }),
  PMVendorCandidate: object({ id, code: text, name: text, classification: strings, canSuggest: bool, bidEligible: bool, reasons: strings }),
  PMVendorCandidatePage: { ...object({ source: ref("PMApprovedSourceRef"), mainLine: ref("PMMainLineScope"), items: array("PMVendorCandidate"), ...page }),
    description: "Distinct vendors linked by retained budget references in the Main Line's saved draft, otherwise active Configuration revision. A valid empty linked set returns an empty page; unverifiable Configuration returns HTTP 409 PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE." },
  PMVendorBidActivity: object({ enquiryId: id, basketId: id, revisionId: id, revision: version, invitationId: id,
    requestedAt: { ...text, format: "date-time" }, deliveryStatus: { ...text, enum: ["pending", "sent", "failed", "stalled", "expired", "revoked", "superseded", "consumed"] },
    deliveredAt: time, bidReceivedAt: time, lineResponded: bool, respondedSourceLineItemKeys: strings, coveredSourceLineItemKeys: strings,
    coverage: { ...text, enum: ["full", "partial"] }, sourceRelation: { ...text, enum: ["exact", "reconciled_history"] } }),
  PMVendorSuggestion: withReinstatementAvailability(object({ id, projectId: id, source: nullableRef("PMApprovedSourceRef"),
    storedSource: object({ estimateId: id, estimateVersion: version, estimateReviewRoundId: { ...id, nullable: true }, designPlanVersion: integer }),
    scope: { ...text, enum: ["project", "main_line"] }, mainLine: nullableRef("PMMainLineScope"), vendor: object({ id, code: text, name: text }),
    note, status, version, suggestedBy: actor, updatedBy: actor, createdAt: { ...text, format: "date-time" }, updatedAt: { ...text, format: "date-time" },
    sourceState: { ...text, enum: ["current", "historical", "unverified"] }, canEdit: bool, editUnavailableReason: nullableText,
    bidEligible: bool, readinessReasons: strings, activity: object({ availability: { ...text, enum: ["available", "unavailable"] }, items: array("PMVendorBidActivity"), truncated: bool }) })),
  PMVendorSuggestionPage: object({ source: nullableRef("PMApprovedSourceRef"), items: array("PMVendorSuggestion"), ...page, writeAvailability: ref("PMWriteAvailability") }),
  ProcurementMainLineSuggestionPage: object({ items: array("PMVendorSuggestion"), ...page, mainLines: { type: "array", items: actor } }),
  PMVendorSuggestionCreate: { ...object({ expectedSource: ref("PMApprovedSourceRef"), mainLineId: id, vendorId: id, note: { ...note, default: "" }, idempotencyKey: commandKey }, ["expectedSource", "mainLineId", "vendorId", "idempotencyKey"]),
    description: "Revalidates current Configuration membership transactionally. HTTP 409 VENDOR_SUGGESTION_VENDOR_NOT_LINKED means the selected vendor is no longer linked; PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE means current membership cannot be verified. Committed idempotent retries retain their original receipt." },
  PMVendorSuggestionUpdate: { ...object({ expectedSource: ref("PMApprovedSourceRef"), expectedVersion: version, idempotencyKey: commandKey, note, status }),
    description: "Reinstating a withdrawn suggestion revalidates current membership and may return HTTP 409 VENDOR_SUGGESTION_VENDOR_NOT_LINKED or PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE. Membership removal alone does not block owned note edits or withdrawal." },
  PMVendorSuggestionCommandResult: object({ id, version, status })
};
const base = "/projects/:projectId/pm";
const suggestions = `${base}/vendor-suggestions`;
const basket = "/procurement/projects/:projectId/baskets/:basketId/vendor-suggestions";
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } }, "x-lisno-schema-completeness": "exact" });
export const PM_ESTIMATE_REQUESTS = {
  [`POST ${suggestions}`]: json("PMVendorSuggestionCreate"),
  [`PATCH ${suggestions}/:suggestionId`]: json("PMVendorSuggestionUpdate")
};
export const PM_ESTIMATE_RESPONSES = {
  [`GET ${base}/estimate`]: "PMEstimateView", [`GET ${base}/vendor-suggestion-candidates`]: "PMVendorCandidatePage",
  [`GET ${suggestions}`]: "PMVendorSuggestionPage", [`POST ${suggestions}`]: "PMVendorSuggestionCommandResult",
  [`PATCH ${suggestions}/:suggestionId`]: "PMVendorSuggestionCommandResult", [`GET ${basket}`]: "ProcurementMainLineSuggestionPage"
};
const query = (name: string, schema: Record<string, unknown>, required = false) => ({ name, in: "query", required, schema });
const pagination = [query("q", { ...text, maxLength: 160 }), query("limit", { ...version, maximum: 50, default: 20 }), query("offset", { ...integer, maximum: 100000, default: 0 })];
const filters = [...pagination, query("mainLineId", id), query("source", { ...text, enum: ["current", "history", "all"], default: "current" })];
export const PM_ESTIMATE_QUERIES = {
  [`GET ${suggestions}`]: filters, [`GET ${basket}`]: filters,
  [`GET ${base}/vendor-suggestion-candidates`]: [...pagination, query("mainLineId", id, true),
    query("expectedSource", { ...text, maxLength: 2500, description: "JSON-encoded PMApprovedSourceRef. Exact immutable approved source is required." }, true)]
};
export const PM_ESTIMATE_SUMMARIES = {
  [`GET ${base}/estimate`]: "Read the assigned project's immutable approved commercial estimate",
  [`GET ${base}/vendor-suggestion-candidates`]: "Search current Configuration-linked vendors for an approved Main Line",
  [`GET ${suggestions}`]: "Read scoped vendor suggestions and actual Main Line bid activity",
  [`POST ${suggestions}`]: "Suggest a saved vendor for an approved Main Line without dispatching",
  [`PATCH ${suggestions}/:suggestionId`]: "Update an owned Main Line suggestion with source and version checks",
  [`GET ${basket}`]: "Read Main Line recommendations for the existing basket bid picker"
};
