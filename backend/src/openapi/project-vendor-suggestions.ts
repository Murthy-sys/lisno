const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const id = { type: "string", minLength: 1, maxLength: 500 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const text = { type: "string" };
const note = { type: "string", maxLength: 1000 };
const status = { type: "string", enum: ["suggested", "withdrawn"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const project = { projectId: id, projectName: text, estimateId: id, estimateVersion: version, designPlanVersion: version };
const person = object({ id, name: text });
const pagination = { total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } };
export const VENDOR_SUGGESTION_SCHEMAS = {
  VendorSuggestionProject: object(project),
  VendorSuggestionProjectPage: object({ items: { type: "array", items: ref("VendorSuggestionProject") }, ...pagination }),
  ProjectVendorSuggestion: object({ id, projectId: id, estimateId: id, estimateVersion: version, estimateReviewRoundId: { ...id, nullable: true }, designPlanVersion: version,
    vendor: object({ id, code: text, name: text, status: { type: "string", enum: ["active", "inactive", "archived", "unavailable"] } }),
    note, status, version, suggestedBy: person, updatedBy: person, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    kpi: object({ status: { type: "string", enum: ["not_rated"] }, score: { type: "number", nullable: true, enum: [null] } })
  }),
  VendorSuggestionPage: object({ project: ref("VendorSuggestionProject"), items: { type: "array", items: ref("ProjectVendorSuggestion") }, ...pagination,
    performance: object({ status: { type: "string", enum: ["not_available"] }, recommendations: { type: "array", maxItems: 0, items: { type: "object" } } })
  }),
  VendorSuggestionCreate: { ...object({ estimateId: id, estimateVersion: version, designPlanVersion: version, vendorId: id, note: { ...note, default: "" }, idempotencyKey: { type: "string", minLength: 8, maxLength: 120 } }, ["estimateId", "estimateVersion", "designPlanVersion", "vendorId", "idempotencyKey"]), description: "Assigned Sales Manager only. Exact canonical approved source, active vendor and immutable request identity. Same-key/same-payload retry returns 200; duplicate vendor or changed request returns 409." },
  VendorSuggestionUpdate: object({ expectedVersion: version, note, status })
};
const body = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
export const VENDOR_SUGGESTION_REQUESTS = {
  "POST /procurement/projects/:projectId/vendor-suggestions": body("VendorSuggestionCreate"),
  "PATCH /procurement/projects/:projectId/vendor-suggestions/:suggestionId": body("VendorSuggestionUpdate")
};
export const VENDOR_SUGGESTION_RESPONSES = {
  "GET /procurement/suggestion-projects": "VendorSuggestionProjectPage",
  "GET /procurement/projects/:projectId/vendor-suggestions": "VendorSuggestionPage",
  "POST /procurement/projects/:projectId/vendor-suggestions": "ProjectVendorSuggestion",
  "PATCH /procurement/projects/:projectId/vendor-suggestions/:suggestionId": "ProjectVendorSuggestion"
};
