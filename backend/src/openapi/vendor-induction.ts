type Shape = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Shape, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const request = (name: string) => ({ required: true, "x-lisno-schema-completeness": "exact",
  content: { "application/json": { schema: ref(name) } } });
const id = { type: "string", minLength: 1 };
const dateTime = { type: "string", format: "date-time" };
const vendorType = { type: "string", enum: ["execution", "supplier"] };
const nullableText = { type: "string", nullable: true };
const nullableVersion = { type: "integer", minimum: 1, nullable: true };
const key = { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]{8,128}$" };
const questions = { type: "array", maxItems: 100, items: ref("VendorInductionQuestion") };
const answers = { type: "array", maxItems: 100, items: ref("VendorInductionAnswer") };

export const VENDOR_INDUCTION_SCHEMAS: Readonly<Record<string, Shape>> = {
  VendorActivation: object({ lifecycleStatus: { type: "string", enum: ["active", "inactive", "archived"] },
    effectiveStatus: { type: "string", enum: ["active", "under_review", "inactive", "archived"] },
    gates: object({ inductionApproved: { type: "boolean" }, vendorSelfKpiComplete: { type: "boolean" },
      procurementKpiComplete: { type: "boolean" }, profileComplete: { type: "boolean" }, physicalAddressVerified: { type: "boolean" } }) }),
  VendorInductionOption: object({ id, label: { type: "string", minLength: 1, maxLength: 120 } }),
  VendorInductionCondition: object({ questionId: id, optionIds: { type: "array", minItems: 1, maxItems: 12, items: id } }),
  VendorInductionQuestion: object({ id, key: { type: "string", minLength: 1, maxLength: 64 },
    section: { type: "string", minLength: 1, maxLength: 120 }, prompt: { type: "string", minLength: 1, maxLength: 500 },
    helpText: { type: "string", nullable: true, maxLength: 1000 },
    type: { type: "string", enum: ["short_text", "paragraph", "number", "yes_no", "single_choice", "multi_choice"] },
    required: { type: "boolean" }, enabled: { type: "boolean" },
    options: { type: "array", maxItems: 12, items: ref("VendorInductionOption") },
    unit: { type: "string", nullable: true, maxLength: 40 }, min: { type: "number", nullable: true, minimum: 0 },
    max: { type: "number", nullable: true, minimum: 0 }, showIf: { allOf: [ref("VendorInductionCondition")], nullable: true } }),
  VendorInductionDraft: object({ version: { type: "integer", minimum: 1 }, vendorType, questions, updatedAt: dateTime }),
  VendorInductionQuestionnaire: object({ id, version: { type: "integer", minimum: 1 }, vendorType, questions, publishedAt: dateTime }),
  VendorInductionAnswer: object({ questionId: id, value: { oneOf: [{ type: "string", maxLength: 4000 },
    { type: "number", minimum: 0 }, { type: "boolean" }, { type: "array", maxItems: 12, items: id }] } }),
  VendorInductionSubmission: object({ id, requestId: id, questionnaireVersion: { type: "integer", minimum: 1 },
    questionnaire: ref("VendorInductionQuestionnaire"), answers, submittedAt: dateTime }),
  VendorInductionReview: object({ id, submissionId: id, decision: { type: "string", enum: ["approved", "changes_requested", "reopened"] },
    reason: nullableText, actorId: id, reviewedAt: dateTime, version: { type: "integer", minimum: 1 } }),
  VendorInductionRequestView: object({ status: { type: "string", enum: ["pending", "sent", "failed", "expired", "superseded", "consumed"] },
    version: { type: "integer", minimum: 1 }, requestedAt: dateTime, expiresAt: dateTime,
    sentAt: { ...dateTime, nullable: true }, canResendAt: { ...dateTime, nullable: true } }),
  VendorInductionStaffVendor: object({ id, name: { type: "string" }, vendorType: { ...vendorType, nullable: true }, emailAvailable: { type: "boolean" } }),
  VendorInductionHistory: object({ submissions: { type: "array", items: ref("VendorInductionSubmission") },
    reviews: { type: "array", items: ref("VendorInductionReview") } }),
  VendorInductionStaffDetail: object({ vendor: ref("VendorInductionStaffVendor"), activation: ref("VendorActivation"),
    draft: { allOf: [ref("VendorInductionDraft")], nullable: true },
    published: { allOf: [ref("VendorInductionQuestionnaire")], nullable: true },
    request: { allOf: [ref("VendorInductionRequestView")], nullable: true },
    requestEligibility: { type: "string", enum: ["ready", "no_published_questionnaire", "missing_profile", "pending", "cooldown", "awaiting_review", "approved", "archived"] },
    submission: { allOf: [ref("VendorInductionSubmission")], nullable: true },
    review: { allOf: [ref("VendorInductionReview")], nullable: true }, history: ref("VendorInductionHistory") }),
  VendorInductionDraftSaveInput: object({ expectedVersion: nullableVersion, idempotencyKey: key, vendorType, questions }),
  VendorInductionPublishInput: object({ expectedDraftVersion: { type: "integer", minimum: 1 }, idempotencyKey: key }),
  VendorInductionRequestInput: object({ expectedRequestVersion: nullableVersion, idempotencyKey: key }),
  VendorInductionReviewInput: object({ submissionId: id, decision: { type: "string", enum: ["approved", "changes_requested"] },
    reason: nullableText, expectedReviewVersion: nullableVersion, idempotencyKey: key }),
  VendorInductionReopenInput: object({ reason: { type: "string", minLength: 1, maxLength: 2000 },
    expectedReviewVersion: { type: "integer", minimum: 1 }, idempotencyKey: key }),
  VendorInductionPublicInspection: object({ vendor: ref("VendorKpiPublicVendor"), questionnaire: ref("VendorInductionQuestionnaire"),
    changeNote: nullableText, expiresAt: dateTime }),
  VendorInductionPublicInspectInput: object({ token: { type: "string" } }),
  VendorInductionPublicSubmitInput: object({ token: { type: "string" }, idempotencyKey: key, answers }),
  VendorInductionSubmissionReceipt: object({ submittedAt: dateTime })
};

export const VENDOR_INDUCTION_REQUESTS = {
  "PUT /procurement/vendor-inductions/:vendorId/draft": request("VendorInductionDraftSaveInput"),
  "POST /procurement/vendor-inductions/:vendorId/publish": request("VendorInductionPublishInput"),
  "POST /procurement/vendor-inductions/:vendorId/requests": request("VendorInductionRequestInput"),
  "POST /procurement/vendor-inductions/:vendorId/reviews": request("VendorInductionReviewInput"),
  "POST /procurement/vendor-inductions/:vendorId/reopen": request("VendorInductionReopenInput"),
  "POST /vendor-induction/inspect": request("VendorInductionPublicInspectInput"),
  "POST /vendor-induction/submit": request("VendorInductionPublicSubmitInput")
};
export const VENDOR_INDUCTION_RESPONSES = {
  "GET /procurement/vendor-inductions/:vendorId": "VendorInductionStaffDetail",
  "PUT /procurement/vendor-inductions/:vendorId/draft": "VendorInductionStaffDetail",
  "POST /procurement/vendor-inductions/:vendorId/publish": "VendorInductionStaffDetail",
  "POST /procurement/vendor-inductions/:vendorId/requests": "VendorInductionStaffDetail",
  "POST /procurement/vendor-inductions/:vendorId/reviews": "VendorInductionStaffDetail",
  "POST /procurement/vendor-inductions/:vendorId/reopen": "VendorInductionStaffDetail"
};
