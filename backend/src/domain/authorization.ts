import {
  ROLE_CODES,
  isRole,
  type Role
} from "./roles.js";

export const PROJECT_MODULES = [
  "projects",
  "design",
  "estimation",
  "procurement",
  "finance",
  "execution"
] as const;

export type ProjectModule = (typeof PROJECT_MODULES)[number];

export const REQUESTABLE_PROJECT_MODULES = [
  "design",
  "procurement",
  "finance",
  "execution"
] as const;

export type RequestableProjectModule =
  (typeof REQUESTABLE_PROJECT_MODULES)[number];

export const REQUESTABLE_MODULES_BY_ROLE = {
  super_admin: [],
  admin: [],
  estimator_sales: [],
  designer: ["design"],
  procurement: ["procurement"],
  finance_head: ["finance"],
  site_manager: ["execution"],
  worker_electrician: [],
  worker_plumber: [],
  worker_carpenter: [],
  worker_painter: [],
  worker_civil: [],
  worker_other: [],
  design_manager: [],
  design_head: [],
  client: []
} as const satisfies Record<Role, readonly RequestableProjectModule[]>;

export const PERMISSION_CODES = [
  "identity.self.read",
  "projects.list",
  "projects.client_summary.read",
  "projects.create",
  "projects.read",
  "projects.initiate",
  "projects.floor.create",
  "projects.stage.create",
  "projects.task.create",
  "design.task_events.read",
  "design.task.self.update",
  "design.task_deadline.update",
  "organization.managers.read",
  "organization.estimators.read",
  "organization.team.read",
  "organization.tree.read",
  "organization.manager_designers.read",
  "organization.designer_summary.read",
  "organization.user_tasks.read",
  "organization.user_kpi.read",
  "organization.evaluation.create",
  "organization.evaluation.read",
  "audit.project_activity.read",
  "audit.designer.read",
  "audit.read",
  "design.client_latest_approved.read",
  "design.version.upload",
  "design.version.read",
  "design.version_extraction.read",
  "design.version.approve",
  "design.version.download",
  "design.section_draft.read",
  "design.section.create",
  "design.section.update",
  "design.section.delete",
  "design.section_extraction.retry",
  "design.section.submit",
  "design.client_sections.read",
  "design.client_section_decision",
  "design.source_page_image.read",
  "design.section_revision_image.read",
  "design.plan_assignment.manage",
  "design.plan_task.read",
  "design.plan_response_tasks.read",
  "design.plan_response_tasks.decide",
  "estimation.design_upload.create",
  "estimation.design_upload.read",
  "estimation.design_upload.retry",
  "estimation.source_page_image.read",
  "estimation.drawing.create",
  "estimation.design_revision_image.read",
  "estimation.client_drawings.read",
  "estimation.client_annotation_draft.save",
  "estimation.client_drawing_decision",
  "estimation.drawing.update",
  "estimation.drawing.estimate_item.assign",
  "estimation.drawing.delete",
  "estimation.drawing.replace",
  "estimation.drawing.submit",
  "estimation.client_plan_review.read",
  "estimation.client_plan_annotation_draft.save",
  "estimation.client_plan_target_preview",
  "estimation.client_plan_change_request.create",
  "estimation.client_plan_change_request.update",
  "estimation.plan_change_request.read",
  "estimation.plan_change_request.targets.update",
  "estimation.plan_change_request.resolve_page",
  "estimation.plan_page_image.read",
  "estimation.lead.list",
  "estimation.lead.create",
  "estimation.lead.read",
  "estimation.lead.update",
  "estimation.lead_activity.read",
  "estimation.lead_activity.create",
  "estimation.estimate.read",
  "estimation.estimate.list",
  "estimation.estimate.save",
  "estimation.estimate.submit",
  "estimation.estimate_pdf.download",
  "estimation.review_queue.read",
  "estimation.assignable_designers.read",
  "estimation.designer_assignment.create",
  "estimation.designer_assignment.decision",
  "estimation.estimate.send_client",
  "estimation.client_estimate.list",
  "estimation.client_estimate_pdf.download",
  "estimation.client_estimate.decision",
  "estimation.client_response_tasks.read",
  "estimation.client_response_tasks.decide",
  "estimation.client_response_proof.read",
  "estimation.estimate_email.retry",
  "identity.authorization.read",
  "identity.users.read",
  "identity.users.update",
  "identity.user_invitations.read",
  "identity.user_invitations.create",
  "identity.user_invitations.resend",
  "identity.user_invitations.revoke",
  "access_request.create",
  "access_request.self.read",
  "access_request.self.cancel",
  "access_request.review.read",
  "access_request.review.decide",
  "project_access_grant.revoke",
  "execution.worker_assignment.override",
  "workflow.tasks.read"
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const ROLE_PERMISSIONS = {
  super_admin: [
    "identity.self.read", "projects.list", "projects.client_summary.read", "projects.create", "projects.read", "projects.initiate", "projects.floor.create", "projects.stage.create", "projects.task.create", "design.task_events.read", "design.task.self.update", "design.task_deadline.update", "organization.managers.read", "organization.estimators.read", "organization.team.read", "organization.tree.read", "organization.manager_designers.read", "organization.designer_summary.read", "organization.user_tasks.read", "organization.user_kpi.read", "organization.evaluation.create", "organization.evaluation.read", "audit.project_activity.read", "audit.designer.read", "audit.read", "design.client_latest_approved.read", "design.version.upload", "design.version.read", "design.version_extraction.read", "design.version.approve", "design.version.download", "design.section_draft.read", "design.section.create", "design.section.update", "design.section.delete", "design.section_extraction.retry", "design.section.submit", "design.client_sections.read", "design.client_section_decision", "design.source_page_image.read", "design.section_revision_image.read", "design.plan_assignment.manage", "design.plan_task.read", "design.plan_response_tasks.read", "design.plan_response_tasks.decide", "estimation.design_upload.create", "estimation.design_upload.read", "estimation.design_upload.retry", "estimation.source_page_image.read", "estimation.drawing.create", "estimation.design_revision_image.read", "estimation.client_drawings.read", "estimation.client_annotation_draft.save", "estimation.client_drawing_decision", "estimation.drawing.update", "estimation.drawing.estimate_item.assign", "estimation.drawing.delete", "estimation.drawing.replace", "estimation.drawing.submit", "estimation.client_plan_review.read", "estimation.client_plan_annotation_draft.save", "estimation.client_plan_target_preview", "estimation.client_plan_change_request.create", "estimation.client_plan_change_request.update", "estimation.plan_change_request.read", "estimation.plan_change_request.targets.update", "estimation.plan_change_request.resolve_page", "estimation.plan_page_image.read", "estimation.lead.list", "estimation.lead.create", "estimation.lead.read", "estimation.lead.update", "estimation.lead_activity.read", "estimation.lead_activity.create", "estimation.estimate.read", "estimation.estimate.list", "estimation.estimate.save", "estimation.estimate.submit", "estimation.estimate_pdf.download", "estimation.review_queue.read", "estimation.assignable_designers.read", "estimation.designer_assignment.create", "estimation.designer_assignment.decision", "estimation.estimate.send_client", "estimation.client_estimate.list", "estimation.client_estimate_pdf.download", "estimation.client_estimate.decision", "estimation.client_response_tasks.read", "estimation.client_response_tasks.decide", "estimation.client_response_proof.read", "estimation.estimate_email.retry", "identity.authorization.read", "identity.users.read", "identity.users.update", "identity.user_invitations.read", "identity.user_invitations.create", "identity.user_invitations.resend", "identity.user_invitations.revoke", "access_request.create", "access_request.self.read", "access_request.self.cancel", "access_request.review.read", "access_request.review.decide", "project_access_grant.revoke", "execution.worker_assignment.override", "workflow.tasks.read"
  ],
  admin: ["identity.self.read", "projects.list", "projects.read", "projects.initiate", "organization.estimators.read", "design.plan_assignment.manage", "design.plan_response_tasks.read", "design.plan_response_tasks.decide", "estimation.client_response_tasks.read", "estimation.client_response_tasks.decide", "estimation.client_response_proof.read", "identity.authorization.read", "access_request.review.read", "access_request.review.decide", "project_access_grant.revoke"],
  estimator_sales: ["identity.self.read", "projects.list", "projects.read", "estimation.design_upload.read", "estimation.design_upload.retry", "estimation.source_page_image.read", "estimation.drawing.create", "estimation.design_revision_image.read", "estimation.drawing.update", "estimation.drawing.estimate_item.assign", "estimation.drawing.delete", "estimation.drawing.replace", "estimation.drawing.submit", "estimation.plan_change_request.read", "estimation.plan_change_request.targets.update", "estimation.plan_change_request.resolve_page", "estimation.plan_page_image.read", "estimation.lead.list", "estimation.lead.create", "estimation.lead.read", "estimation.lead.update", "estimation.lead_activity.read", "estimation.lead_activity.create", "estimation.estimate.read", "estimation.estimate.list", "estimation.estimate.save", "estimation.estimate.submit", "estimation.estimate_pdf.download", "estimation.estimate.send_client", "estimation.client_response_proof.read", "estimation.estimate_email.retry", "identity.authorization.read"],
  designer: ["identity.self.read", "projects.list", "projects.read", "projects.floor.create", "projects.stage.create", "projects.task.create", "design.task_events.read", "design.task.self.update", "organization.managers.read", "organization.designer_summary.read", "organization.user_tasks.read", "organization.user_kpi.read", "organization.evaluation.read", "audit.designer.read", "audit.read", "design.version.upload", "design.version.read", "design.version_extraction.read", "design.version.download", "design.section_draft.read", "design.section.create", "design.section.update", "design.section.delete", "design.section_extraction.retry", "design.section.submit", "design.source_page_image.read", "design.section_revision_image.read", "design.plan_task.read", "estimation.design_upload.create", "estimation.design_upload.read", "estimation.design_upload.retry", "estimation.source_page_image.read", "estimation.drawing.create", "estimation.design_revision_image.read", "estimation.drawing.update", "estimation.drawing.estimate_item.assign", "estimation.drawing.delete", "estimation.drawing.replace", "estimation.drawing.submit", "estimation.plan_change_request.read", "estimation.plan_change_request.targets.update", "estimation.plan_change_request.resolve_page", "estimation.plan_page_image.read", "identity.authorization.read", "access_request.create", "access_request.self.read", "access_request.self.cancel"],
  procurement: ["identity.self.read", "identity.authorization.read", "access_request.create", "access_request.self.read", "access_request.self.cancel", "workflow.tasks.read"],
  finance_head: ["identity.self.read", "identity.authorization.read", "access_request.create", "access_request.self.read", "access_request.self.cancel", "workflow.tasks.read"],
  site_manager: ["identity.self.read", "identity.authorization.read", "access_request.create", "access_request.self.read", "access_request.self.cancel", "workflow.tasks.read"],
  worker_electrician: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  worker_plumber: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  worker_carpenter: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  worker_painter: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  worker_civil: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  worker_other: ["identity.self.read", "identity.authorization.read", "workflow.tasks.read"],
  design_manager: ["identity.self.read", "projects.list", "projects.read", "design.task_events.read", "design.task_deadline.update", "organization.team.read", "organization.designer_summary.read", "organization.user_tasks.read", "organization.user_kpi.read", "organization.evaluation.create", "organization.evaluation.read", "audit.project_activity.read", "audit.designer.read", "audit.read", "design.version.read", "design.version_extraction.read", "design.version.approve", "design.version.download", "design.source_page_image.read", "design.section_revision_image.read", "estimation.plan_change_request.read", "estimation.plan_change_request.targets.update", "estimation.plan_change_request.resolve_page", "estimation.plan_page_image.read", "estimation.review_queue.read", "estimation.assignable_designers.read", "estimation.designer_assignment.create", "identity.authorization.read"],
  design_head: ["identity.self.read", "projects.list", "projects.read", "design.task_events.read", "design.task_deadline.update", "organization.tree.read", "organization.manager_designers.read", "organization.designer_summary.read", "organization.user_tasks.read", "organization.user_kpi.read", "organization.evaluation.create", "organization.evaluation.read", "audit.project_activity.read", "audit.designer.read", "audit.read", "design.version.read", "design.version_extraction.read", "design.version.approve", "design.version.download", "design.source_page_image.read", "design.section_revision_image.read", "estimation.plan_change_request.read", "estimation.plan_change_request.targets.update", "estimation.plan_change_request.resolve_page", "estimation.plan_page_image.read", "identity.authorization.read"],
  client: ["identity.self.read", "projects.list", "projects.client_summary.read", "projects.read", "design.client_latest_approved.read", "design.version.read", "design.version_extraction.read", "design.version.download", "design.client_sections.read", "design.client_section_decision", "design.source_page_image.read", "design.section_revision_image.read", "estimation.design_revision_image.read", "estimation.client_drawings.read", "estimation.client_annotation_draft.save", "estimation.client_drawing_decision", "estimation.client_plan_review.read", "estimation.client_plan_annotation_draft.save", "estimation.client_plan_target_preview", "estimation.client_plan_change_request.create", "estimation.client_plan_change_request.update", "estimation.client_estimate.list", "estimation.client_estimate_pdf.download", "estimation.client_estimate.decision", "identity.authorization.read"]
} as const satisfies Record<Role, readonly PermissionCode[]>;

export class AuthorizationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationConfigurationError";
  }
}

export function isProjectModule(value: unknown): value is ProjectModule {
  return typeof value === "string" && PROJECT_MODULES.some((module) => module === value);
}

export function isRequestableProjectModule(
  value: unknown
): value is RequestableProjectModule {
  return typeof value === "string" &&
    REQUESTABLE_PROJECT_MODULES.some((module) => module === value);
}

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === "string" &&
    PERMISSION_CODES.some((permission) => permission === value);
}

export function roleMayRequestModule(role: unknown, module: unknown): boolean {
  return isRole(role) &&
    isRequestableProjectModule(module) &&
    REQUESTABLE_MODULES_BY_ROLE[role].some(
      (candidate: RequestableProjectModule) => candidate === module
    );
}

export function hasPermission(role: unknown, permission: unknown): boolean {
  return isRole(role) &&
    isPermissionCode(permission) &&
    ROLE_PERMISSIONS[role].some((candidate) => candidate === permission);
}

if (Object.keys(ROLE_PERMISSIONS).length !== ROLE_CODES.length) {
  throw new AuthorizationConfigurationError("Role permission policy is incomplete.");
}
