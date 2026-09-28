type Shape = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Shape, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required
});
const request = (name: string) => ({
  required: true,
  "x-lisno-schema-completeness": "exact",
  content: { "application/json": { schema: ref(name) } }
});
const id = { type: "string", minLength: 1 };
const dateTime = { type: "string", format: "date-time" };
const vendorType = { type: "string", enum: ["execution", "supplier"] };
const scoreBps = { type: "integer", minimum: 0, maximum: 10_000, description: "Hundredths of a score point; 9050 means 90.50/100." };
const comment = { type: "string", nullable: true, maxLength: 2000 };
const categoryScore = ref("VendorKpiCategoryScore");
const scores = {
  type: "array", minItems: 4, maxItems: 5, items: categoryScore,
  description: "Exactly the four Execution or five Supplier rubric keys, once each. The server validates keys for the vendor type."
};
const idempotencyKey = { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_-]{8,128}$" };

export const VENDOR_KPI_SCHEMAS: Readonly<Record<string, Shape>> = {
  VendorKpiCategoryScore: object({
    key: { type: "string", enum: ["timeline", "quality", "budget", "site_discipline", "rates_offered", "service_communication", "delivery_coordination", "defect_liability_addressal", "commitment_to_timelines"] },
    score: { type: "integer", minimum: 0, maximum: 100 }
  }),
  VendorKpiAssessment: object({
    id, vendorId: id, source: { type: "string", enum: ["vendor_self", "procurement"] },
    vendorType, rubricVersion: { type: "integer", minimum: 1 }, scores,
    averageScoreBps: scoreBps, revision: { type: "integer", minimum: 1 },
    comment, submittedAt: dateTime
  }),
  VendorKpiRequestView: object({
    status: { type: "string", enum: ["pending", "sent", "failed", "expired", "superseded", "consumed"] },
    version: { type: "integer", minimum: 1 }, requestedAt: dateTime,
    expiresAt: dateTime, sentAt: { ...dateTime, nullable: true },
    canResendAt: { ...dateTime, nullable: true }
  }),
  VendorKpiDirectorySummary: object({
    status: { type: "string", enum: ["not_rated", "rated"] },
    officialScoreBps: { ...scoreBps, nullable: true },
    selfStatus: { type: "string", enum: ["not_submitted", "submitted"] }
  }),
  VendorKpiStaffVendor: object({
    id, code: { type: "string" }, name: { type: "string" },
    status: { type: "string", enum: ["active", "inactive", "archived"] },
    vendorType: { ...vendorType, nullable: true },
    workProfile: { type: "string", nullable: true },
    mainBasketNames: { type: "array", items: { type: "string" } },
    subBasketNames: { type: "array", items: { type: "string" } },
    emailAvailable: { type: "boolean" }
  }),
  VendorKpiStaffDetail: object({
    vendor: ref("VendorKpiStaffVendor"), rubricVersion: { type: "integer", minimum: 1 },
    selfAssessment: { allOf: [ref("VendorKpiAssessment")], nullable: true },
    procurementAssessment: { allOf: [ref("VendorKpiAssessment")], nullable: true },
    officialScoreBps: { ...scoreBps, nullable: true },
    request: { allOf: [ref("VendorKpiRequestView")], nullable: true },
    requestEligibility: { type: "string", enum: ["ready", "self_submitted", "pending", "cooldown", "missing_profile", "archived"] }
  }),
  VendorKpiSaveInput: object({
    rubricVersion: { type: "integer", enum: [1] },
    expectedRevision: { type: "integer", minimum: 1, nullable: true },
    idempotencyKey, scores, comment
  }, ["rubricVersion", "expectedRevision", "idempotencyKey", "scores"]),
  VendorKpiRequestInput: object({
    idempotencyKey, expectedRequestVersion: { type: "integer", minimum: 1, nullable: true }
  }),
  VendorKpiPublicVendor: object({
    name: { type: "string" }, vendorType,
    workProfile: { type: "string" },
    representativeName: { type: "string" },
    representativePosition: { type: "string" }
  }),
  VendorKpiPublicInspection: object({
    vendor: ref("VendorKpiPublicVendor"), rubricVersion: { type: "integer", minimum: 1 },
    expiresAt: dateTime
  }),
  VendorKpiPublicInspectInput: object({ token: { type: "string", minLength: 1 } }),
  VendorKpiPublicSubmitInput: object({
    token: { type: "string", minLength: 1 }, rubricVersion: { type: "integer", enum: [1] },
    idempotencyKey, scores, comment
  }, ["token", "rubricVersion", "idempotencyKey", "scores"]),
  VendorKpiSubmissionReceipt: object({ submittedAt: dateTime, averageScoreBps: scoreBps })
};

export const VENDOR_KPI_REQUESTS = {
  "PUT /procurement/vendor-kpis/:vendorId/procurement": request("VendorKpiSaveInput"),
  "POST /procurement/vendor-kpis/:vendorId/requests": request("VendorKpiRequestInput"),
  "POST /vendor-kpi/inspect": request("VendorKpiPublicInspectInput"),
  "POST /vendor-kpi/submit": request("VendorKpiPublicSubmitInput")
};

export const VENDOR_KPI_RESPONSES = {
  "GET /procurement/vendor-kpis/:vendorId": "VendorKpiStaffDetail",
  "PUT /procurement/vendor-kpis/:vendorId/procurement": "VendorKpiStaffDetail",
  "POST /procurement/vendor-kpis/:vendorId/requests": "VendorKpiStaffDetail"
};
