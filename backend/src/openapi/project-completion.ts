const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const id = { type: "string", minLength: 1 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const key = { type: "string", minLength: 8, maxLength: 128 };
const timestamp = { type: "string", format: "date-time" };
const nullableString = { type: "string", nullable: true };
const json = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });

export const PROJECT_COMPLETION_SCHEMAS = {
  ProjectScopeExceptionInput: object({ sourceLineItemKey: id, kind: { type: "string", enum: ["not_applicable", "externally_fulfilled"] },
    reason: { type: "string", minLength: 10, maxLength: 2_000 }, expectedAuthorityVersion: version, idempotencyKey: key }),
  ProjectCompletionInput: object({ expectedAuthorityVersion: version, idempotencyKey: key }),
  ProjectScopeException: object({ id, projectId: id, sourceLineItemKey: id,
    kind: { type: "string", enum: ["not_applicable", "externally_fulfilled"] }, reason: { type: "string" },
    resultingAuthorityVersion: version, recordedAt: timestamp }),
  ProjectCompletionDecision: object({ id, projectId: id, completedAt: timestamp, resultingAuthorityVersion: version }),
  ProjectScopeCoverage: object({ sourceLineItemKey: id, sourceSectionId: id, roomName: { type: "string" }, specification: { type: "string" },
    amountPaise: { type: "integer", minimum: 0 }, approvedOrderLineCount: { type: "integer", minimum: 0 },
    exception: { ...object({ id, kind: { type: "string", enum: ["not_applicable", "externally_fulfilled"] }, reason: { type: "string" } }), nullable: true },
    status: { type: "string", enum: ["approved_order", "exception", "not_required", "uncovered"] } }),
  ProjectCompletionBlocker: object({ code: { type: "string", enum: ["ORDER_PENDING", "NO_APPROVED_ORDER", "SCOPE_UNCOVERED", "VENDOR_WORK_PENDING", "CLIENT_REVIEW_PENDING", "SITE_COMPLETION_PENDING", "PROJECT_NOT_ACTIVE"] },
    message: { type: "string" }, sourceLineItemKey: id }, ["code", "message"]),
  ProjectCompletionSummary: object({ projectId: id, projectName: { type: "string" }, projectStatus: { type: "string" },
    completionAuthority: { type: "string", enum: ["vendor_client"] }, completionAuthorityVersion: version,
    estimateSource: object({ estimateId: id, estimateVersion: version, estimateReviewRoundId: nullableString }),
    scope: { type: "array", items: ref("ProjectScopeCoverage") },
    approvedOrders: { type: "array", items: object({ orderId: id, revisionId: id, revision: version,
      lineCount: { type: "integer", minimum: 1 }, netPaise: { type: "integer", minimum: 0 }, gstPaise: { type: "integer", minimum: 0 }, totalPaise: { type: "integer", minimum: 0 } }) },
    vendorWork: object({ totalAssignments: { type: "integer", minimum: 0 }, approvedAssignments: { type: "integer", minimum: 0 },
      pendingAssignments: { type: "integer", minimum: 0 }, openReviews: { type: "integer", minimum: 0 } }),
    siteCompletion: { ...object({ status: { type: "string", enum: ["draft", "pending_client", "changes_requested", "client_approved"] },
      progress: { type: "integer", minimum: 0, maximum: 100 }, round: { type: "integer", minimum: 0 }, reviewId: nullableString }), nullable: true },
    blockers: { type: "array", items: ref("ProjectCompletionBlocker") },
    pendingOwner: { type: "string", enum: ["procurement", "super_admin", "site_manager", "vendor", "client", "none"] },
    readyForCompletion: { type: "boolean" }, completedAt: { ...timestamp, nullable: true }, completionDecisionId: nullableString }),
  ProjectCompletionTaskPage: object({ items: { type: "array", items: ref("ProjectCompletionSummary") },
    total: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 } })
};

export const PROJECT_COMPLETION_QUERY_PARAMETERS = [
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
  { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } }
] as const;
export const PROJECT_COMPLETION_REQUESTS = {
  "POST /admin/projects/:projectId/scope-exceptions": json("ProjectScopeExceptionInput"),
  "POST /admin/projects/:projectId/complete": json("ProjectCompletionInput")
};
export const PROJECT_COMPLETION_RESPONSES = {
  "GET /admin/project-completion-tasks": "ProjectCompletionTaskPage",
  "GET /admin/projects/:projectId/completion": "ProjectCompletionSummary",
  "POST /admin/projects/:projectId/scope-exceptions": "ProjectScopeException",
  "POST /admin/projects/:projectId/complete": "ProjectCompletionDecision"
};
