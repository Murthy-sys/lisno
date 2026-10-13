const id = { type: "string", minLength: 1, maxLength: 160 };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 };
const requirementsVersion = { ...version, minimum: 0 };
const nullableId = { ...id, nullable: true };
const text = { type: "string", minLength: 1, maxLength: 4000 };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const request = (name: string) => ({ required: true, content: { "application/json": { schema: ref(name) } } });
const token = { type: "string", minLength: 1, maxLength: 1024, writeOnly: true };
const nullableDate = { type: "string", format: "date-time", nullable: true };
export const ESTIMATE_COLLABORATION_SCHEMAS = {
  ProjectInvitationCommand: object({ expectedVersion: requirementsVersion }, ["expectedVersion"]),
  ProjectInvitationToken: object({ token }, ["token"]),
  ProjectInvitationAccept: object({ token, password: { type: "string", writeOnly: true }, passwordConfirmation: { type: "string", writeOnly: true } }, ["token", "password", "passwordConfirmation"]),
  ProjectInvitationStatus: object({ projectId: id, status: { type: "string", enum: ["not_issued", "pending", "delivery_failed", "expired", "revoked", "accepted"] },
    deliveryAvailable: { type: "boolean" }, expectedVersion: requirementsVersion, expiresAt: nullableDate, sentAt: nullableDate, acceptedAt: nullableDate,
    availableActions: { type: "array", items: { type: "string", enum: ["send", "resend", "revoke"] } } },
    ["projectId", "status", "deliveryAvailable", "expectedVersion", "availableActions"]),
  ProjectInvitationJoined: object({ projectId: id }, ["projectId"]),
  EstimateRequirementCreate: object({ mainBasketId: id, roomId: nullableId, text, expectedRequirementsVersion: requirementsVersion,
    idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" } }, ["mainBasketId", "text", "expectedRequirementsVersion", "idempotencyKey"]),
  EstimateRequirementUpdate: { ...object({ mainBasketId: id, roomId: nullableId, text, expectedRequirementsVersion: requirementsVersion,
    expectedVersion: version, withdraw: { type: "boolean" } }, ["expectedRequirementsVersion", "expectedVersion"]), description: "Supply a changed field or withdraw=true. Only the author may change an open request." },
  EstimateRequirementResolve: { ...object({ expectedRequirementsVersion: requirementsVersion, expectedVersion: version,
    status: { type: "string", enum: ["included", "declined", "superseded"] }, lineItemIds: { type: "array", maxItems: 200, items: id },
    reason: { type: "string", maxLength: 2000 }, supersededById: id }, ["expectedRequirementsVersion", "expectedVersion", "status"]),
    description: "Included requests require matching included line IDs. Declined/superseded requests require a reason; superseded requests also require a same-project replacement." },
  EstimateRequirement: object({ id, projectId: id, phase: { type: "string", enum: ["pre", "post"] }, mainBasketId: id, roomId: nullableId, text,
    authorId: id, version, status: { type: "string", enum: ["open", "included", "declined", "withdrawn", "superseded"] },
    lineItemIds: { type: "array", items: id }, reason: { type: "string" }, supersededById: nullableId,
    createdAt: nullableDate, updatedAt: nullableDate, resolvedAt: nullableDate, canEdit: { type: "boolean" } }),
  EstimateRequirements: object({ projectId: id, requirementsVersion, estimateVersion: { ...version, nullable: true },
    phase: { type: "string", enum: ["pre", "post"] }, editingAllowed: { type: "boolean" }, canResolve: { type: "boolean" },
    editingBlockReason: { type: "string", enum: ["review_pending", "closed"], nullable: true },
    requirements: { type: "array", items: ref("EstimateRequirement") },
    mainBaskets: { type: "array", items: object({ id, name: { type: "string" } }, ["id", "name"]) },
    rooms: { type: "array", items: object({ id, label: { type: "string" } }, ["id", "label"]) },
    indicativeTotalPaise: { type: "integer", minimum: 0, nullable: true, description: "Read-only current working estimate total in paise, not an approval." }, pricingComplete: { type: "boolean" } }),
  EstimateVersionCommand: object({ expectedVersion: version }, ["expectedVersion"]),
  EstimateReviewWithdrawal: object({ expectedVersion: version, reviewRoundId: id, reviewRoundVersion: version,
    reason: { type: "string", minLength: 1, maxLength: 1000 } }, ["expectedVersion", "reviewRoundId", "reviewRoundVersion", "reason"]),
  DesignScopeReconciliation: object({ expectedDesignPlanVersion: requirementsVersion, expectedScopeRevision: version }, ["expectedDesignPlanVersion", "expectedScopeRevision"])
};
export const ESTIMATE_COLLABORATION_REQUESTS = {
  "POST /projects/:projectId/client-invitation": request("ProjectInvitationCommand"),
  "POST /projects/:projectId/client-invitation/resend": request("ProjectInvitationCommand"),
  "POST /projects/:projectId/client-invitation/revoke": request("ProjectInvitationCommand"),
  "POST /auth/project-invitations/inspect": request("ProjectInvitationToken"),
  "POST /auth/project-invitations/accept": request("ProjectInvitationAccept"),
  "POST /auth/project-invitations/accept-existing": request("ProjectInvitationToken"),
  "POST /projects/:projectId/estimate-requirements": request("EstimateRequirementCreate"),
  "PATCH /projects/:projectId/estimate-requirements/:requirementId": request("EstimateRequirementUpdate"),
  "POST /projects/:projectId/estimate-requirements/:requirementId/resolve": request("EstimateRequirementResolve"),
  "POST /estimates/:estimateId/withdraw-review": request("EstimateReviewWithdrawal"),
  "POST /estimates/:estimateId/preparation-snapshots": request("EstimateVersionCommand"),
  "POST /estimates/:estimateId/enable-collaboration": request("EstimateVersionCommand"),
  "POST /projects/:projectId/design-plan/reconcile-scope": request("DesignScopeReconciliation")
};
export const ESTIMATE_COLLABORATION_RESPONSES = {
  "GET /projects/:projectId/client-invitation": "ProjectInvitationStatus",
  "POST /projects/:projectId/client-invitation": "ProjectInvitationStatus",
  "POST /projects/:projectId/client-invitation/resend": "ProjectInvitationStatus",
  "POST /projects/:projectId/client-invitation/revoke": "ProjectInvitationStatus",
  "POST /auth/project-invitations/accept-existing": "ProjectInvitationJoined",
  "GET /projects/:projectId/estimate-requirements": "EstimateRequirements",
  "POST /projects/:projectId/estimate-requirements": "EstimateRequirements",
  "PATCH /projects/:projectId/estimate-requirements/:requirementId": "EstimateRequirements",
  "POST /projects/:projectId/estimate-requirements/:requirementId/resolve": "EstimateRequirements"
};
