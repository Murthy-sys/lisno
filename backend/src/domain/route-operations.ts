import type { RequestHandler } from "express";

import type { PermissionCode } from "./authorization.js";

export type HumanJwtMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HumanJwtOperationKeyShape = `${HumanJwtMethod} /${string}`;

export interface HumanJwtOperation {
  key: HumanJwtOperationKeyShape;
  permission: PermissionCode;
  scope:
    | { kind: "project"; module: "projects" | "design" }
    | {
        kind: "non_project";
        namespace:
          | "identity"
          | "organization"
          | "audit"
          | "estimation_ownership"
          | "access_administration";
        projectReviewScope?: boolean;
      };
  operationClass: "read" | "admin" | "personal";
  superAdminBehavior:
    | "self"
    | "global_read"
    | "admin_override"
    | "deny_personal";
  availability: "baseline" | "prompt_1" | "prompt_2";
}

export const HUMAN_JWT_OPERATION_LIST = [
  { key: "GET /auth/me", permission: "identity.self.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "self", availability: "baseline" },
  { key: "GET /projects", permission: "projects.list", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/project-summaries", permission: "projects.client_summary.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /projects", permission: "projects.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /projects/:projectId", permission: "projects.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /projects/:projectId/floors", permission: "projects.floor.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /floors/:floorId/stages", permission: "projects.stage.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /stages/:stageId/tasks", permission: "projects.task.create", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /tasks/:taskId/events", permission: "design.task_events.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /tasks/:taskId", permission: "design.task.self.update", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /tasks/:taskId/deadline", permission: "design.task_deadline.update", scope: { kind: "project", module: "design" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /organization/managers", permission: "organization.managers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/team", permission: "organization.team.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/tree", permission: "organization.tree.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /organization/managers/:managerId/designers", permission: "organization.manager_designers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /designers/:designerId/summary", permission: "organization.designer_summary.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /kpis/users/:userId/tasks", permission: "organization.user_tasks.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /kpis/users/:userId", permission: "organization.user_kpi.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /evaluations", permission: "organization.evaluation.create", scope: { kind: "non_project", namespace: "organization" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /evaluations/:subjectId", permission: "organization.evaluation.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /projects/:projectId/activity", permission: "audit.project_activity.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /designers/:designerId/audit", permission: "audit.designer.read", scope: { kind: "non_project", namespace: "audit" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /audit", permission: "audit.read", scope: { kind: "non_project", namespace: "audit" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/latest-approved-versions", permission: "design.client_latest_approved.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /tasks/:taskId/design-versions", permission: "design.version.upload", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /projects/:projectId/design-versions", permission: "design.version.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-versions/:versionId/extraction", permission: "design.version_extraction.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /design-versions/:versionId/approval", permission: "design.version.approve", scope: { kind: "project", module: "design" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /design-versions/:versionId/download", permission: "design.version.download", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-versions/:versionId/sections", permission: "design.section_draft.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /design-versions/:versionId/sections", permission: "design.section.create", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /design-sections/:sectionId", permission: "design.section.update", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "DELETE /design-sections/:sectionId", permission: "design.section.delete", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /design-versions/:versionId/retry-extraction", permission: "design.section_extraction.retry", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /design-versions/:versionId/submit-sections", permission: "design.section.submit", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/projects/:projectId/design-sections", permission: "design.client_sections.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /design-section-revisions/:revisionId/decision", permission: "design.client_section_decision", scope: { kind: "project", module: "design" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /design-source-pages/:pageId/image", permission: "design.source_page_image.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /design-section-revisions/:revisionId/image", permission: "design.section_revision_image.read", scope: { kind: "project", module: "design" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimates/:estimateId/design-uploads", permission: "estimation.design_upload.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimates/:estimateId/design-uploads", permission: "estimation.design_upload.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimate-design-uploads/:uploadId/retry", permission: "estimation.design_upload.retry", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-design-source-pages/:pageId/image", permission: "estimation.source_page_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimate-design-source-pages/:pageId/drawings", permission: "estimation.drawing.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-design-revisions/:revisionId/image", permission: "estimation.design_revision_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/design-drawings", permission: "estimation.client_drawings.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /client/estimate-design-revisions/:revisionId/annotation-draft", permission: "estimation.client_annotation_draft.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /client/estimate-design-revisions/:revisionId/decision", permission: "estimation.client_drawing_decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PATCH /estimate-design-drawings/:drawingId", permission: "estimation.drawing.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PUT /estimate-design-drawings/:drawingId/estimate-item", permission: "estimation.drawing.estimate_item.assign", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "DELETE /estimate-design-drawings/:drawingId", permission: "estimation.drawing.delete", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimate-design-drawings/:drawingId/replacement", permission: "estimation.drawing.replace", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimates/:estimateId/design-drawings/submit", permission: "estimation.drawing.submit", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/plan-review", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimate-plan-pages/:pageId/thumbnail", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimate-plan-pages/:pageId/current-image", permission: "estimation.client_plan_review.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /client/estimate-plan-pages/:pageId/annotation-draft", permission: "estimation.client_plan_annotation_draft.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /client/estimate-plan-pages/:pageId/target-preview", permission: "estimation.client_plan_target_preview", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /client/estimate-plan-pages/:pageId/change-requests", permission: "estimation.client_plan_change_request.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "PUT /client/estimate-plan-change-requests/:requestId", permission: "estimation.client_plan_change_request.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimate-plan-change-requests", permission: "estimation.plan_change_request.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimate-plan-change-requests/:requestId", permission: "estimation.plan_change_request.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /estimate-plan-change-requests/:requestId/targets", permission: "estimation.plan_change_request.targets.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "POST /estimate-plan-change-requests/:requestId/resolve-page", permission: "estimation.plan_change_request.resolve_page", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "GET /estimate-plan-pages/:pageId/current-image", permission: "estimation.plan_page_image.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /leads", permission: "estimation.lead.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /leads", permission: "estimation.lead.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId", permission: "estimation.lead.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PATCH /leads/:leadId", permission: "estimation.lead.update", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId/activities", permission: "estimation.lead_activity.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /leads/:leadId/activities", permission: "estimation.lead_activity.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /leads/:leadId/estimate", permission: "estimation.estimate.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates", permission: "estimation.estimate.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "PUT /leads/:leadId/estimate", permission: "estimation.estimate.save", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /leads/:leadId/estimate/submit", permission: "estimation.estimate.submit", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /estimates/:estimateId/pdf", permission: "estimation.estimate_pdf.download", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates/review-queue", permission: "estimation.review_queue.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /estimates/designers", permission: "estimation.assignable_designers.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /estimates/:estimateId/assign", permission: "estimation.designer_assignment.create", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "baseline" },
  { key: "POST /estimates/:estimateId/designer-decision", permission: "estimation.designer_assignment.decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "POST /estimates/:estimateId/send-client", permission: "estimation.estimate.send_client", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /client/estimates", permission: "estimation.client_estimate.list", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "GET /client/estimates/:estimateId/pdf", permission: "estimation.client_estimate_pdf.download", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "read", superAdminBehavior: "global_read", availability: "baseline" },
  { key: "POST /client/estimates/:estimateId/decision", permission: "estimation.client_estimate.decision", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "baseline" },
  { key: "GET /auth/authorization", permission: "identity.authorization.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "self", availability: "prompt_1" },
  { key: "GET /admin/users", permission: "identity.users.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_1" },
  { key: "PATCH /admin/users/:userId", permission: "identity.users.update", scope: { kind: "non_project", namespace: "identity" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
  { key: "POST /access-requests", permission: "access_request.create", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_1" },
  { key: "GET /access-requests/mine", permission: "access_request.self.read", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "read", superAdminBehavior: "self", availability: "prompt_1" },
  { key: "POST /access-requests/:requestId/cancel", permission: "access_request.self.cancel", scope: { kind: "non_project", namespace: "access_administration" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_1" },
  { key: "GET /access-requests/review", permission: "access_request.review.read", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_1" },
  { key: "POST /access-requests/:requestId/decision", permission: "access_request.review.decide", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
  { key: "POST /project-access-grants/:grantId/revoke", permission: "project_access_grant.revoke", scope: { kind: "non_project", namespace: "access_administration", projectReviewScope: true }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "prompt_1" },
  { key: "GET /admin/projects", permission: "projects.list", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "GET /admin/projects/:projectId", permission: "projects.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "POST /admin/projects", permission: "projects.initiate", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_2" },
  { key: "GET /admin/estimators", permission: "organization.estimators.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" }
] as const satisfies readonly HumanJwtOperation[];

export type HumanJwtOperationKey =
  (typeof HUMAN_JWT_OPERATION_LIST)[number]["key"];

export const HUMAN_JWT_OPERATIONS = Object.freeze(
  Object.fromEntries(
    HUMAN_JWT_OPERATION_LIST.map((operation) => [operation.key, operation])
  )
) as unknown as Readonly<Record<HumanJwtOperationKey, HumanJwtOperation>>;

const humanOperationMarker = Symbol("humanJwtOperation");
type MarkedHumanOperationHandler = RequestHandler & {
  readonly [humanOperationMarker]: HumanJwtOperationKey;
};

export function markHumanOperation(
  handler: RequestHandler,
  key: HumanJwtOperationKey
): RequestHandler {
  Object.defineProperty(handler, humanOperationMarker, {
    value: key,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return handler;
}

export function isHumanOperationHandler(
  handler: RequestHandler
): handler is MarkedHumanOperationHandler {
  const descriptor = Object.getOwnPropertyDescriptor(
    handler,
    humanOperationMarker
  );
  return descriptor !== undefined &&
    descriptor.enumerable === false &&
    descriptor.writable === false &&
    descriptor.configurable === false &&
    typeof descriptor.value === "string" &&
    Object.hasOwn(HUMAN_JWT_OPERATIONS, descriptor.value);
}

export function operationKeyForHandler(
  handler: RequestHandler
): HumanJwtOperationKey | undefined {
  return isHumanOperationHandler(handler) ? handler[humanOperationMarker] : undefined;
}

export function splitHumanOperationKey(key: HumanJwtOperationKeyShape): {
  method: HumanJwtMethod;
  path: `/${string}`;
} {
  const separator = key.indexOf(" ");
  return {
    method: key.slice(0, separator) as HumanJwtMethod,
    path: key.slice(separator + 1) as `/${string}`
  };
}
