const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const id = { type: "string", minLength: 1 };
const key = { type: "string", minLength: 8, maxLength: 128 };
const version = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 };
const note = { type: "string", maxLength: 2_000 };
const nullableString = { type: "string", nullable: true };
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });

export const SITE_COMPLETION_SCHEMAS = {
  SiteCompletionProgressInput: object({ expectedVersion: version, idempotencyKey: key,
    progress: { type: "integer", minimum: 0, maximum: 100 }, note }),
  SiteCompletionSubmitInput: object({ expectedVersion: version, idempotencyKey: key,
    note }),
  SiteCompletionDecisionInput: object({ expectedVersion: { ...version, minimum: 1 }, idempotencyKey: key,
    decision: { type: "string", enum: ["approve", "request_changes"] }, reason: nullableString }),
  SiteCompletionSection: object({ assignmentId: id, sourceSectionId: id, sectionLabel: { type: "string" },
    roomName: { type: "string" }, itemName: { type: "string" }, scopeType: { type: "string" },
    imageIds: { type: "array", items: id } }),
  SiteCompletionReview: object({ id, projectId: id, round: { type: "integer", minimum: 1 },
    version: { ...version, minimum: 1 }, status: { type: "string", enum: ["pending", "approved", "changes_requested"] },
    progress: { type: "integer", minimum: 0, maximum: 100 }, note,
    submittedAt: { type: "string", format: "date-time" }, sections: { type: "array", items: ref("SiteCompletionSection") },
    decision: { ...object({ decision: { type: "string", enum: ["approve", "request_changes"] },
      reason: nullableString, decidedAt: { type: "string", format: "date-time" } }), nullable: true } }),
  SiteCompletion: object({ projectId: id, projectStatus: { type: "string" }, version,
    progress: { type: "integer", minimum: 0, maximum: 100 }, note,
    status: { type: "string", enum: ["draft", "pending_client", "changes_requested", "client_approved"] },
    currentRound: { type: "integer", minimum: 0 }, canSubmit: { type: "boolean" },
    needsReverification: { type: "boolean" },
    blockers: { type: "array", items: { type: "string" } }, review: { ...ref("SiteCompletionReview"), nullable: true } })
};

export const SITE_COMPLETION_REQUESTS = {
  "PATCH /projects/:projectId/site-completion/progress": json("SiteCompletionProgressInput"),
  "POST /projects/:projectId/site-completion/submit": json("SiteCompletionSubmitInput"),
  "POST /clients/projects/:projectId/site-completion/decision": json("SiteCompletionDecisionInput")
};

export const SITE_COMPLETION_RESPONSES = {
  "GET /projects/:projectId/site-completion": "SiteCompletion",
  "GET /admin/projects/:projectId/site-completion": "SiteCompletion",
  "PATCH /projects/:projectId/site-completion/progress": "SiteCompletion",
  "POST /projects/:projectId/site-completion/submit": "SiteCompletion",
  "GET /clients/projects/:projectId/site-completion": "SiteCompletion",
  "POST /clients/projects/:projectId/site-completion/decision": "SiteCompletion"
};
