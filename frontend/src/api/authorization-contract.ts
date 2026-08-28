export const ROLE_CODES = [
  "super_admin",
  "admin",
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other",
  "design_manager",
  "design_head",
  "client"
] as const;

export type Role = (typeof ROLE_CODES)[number];

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  estimator_sales: "Estimator/Sales",
  designer: "Designer",
  procurement: "Procurement",
  finance_head: "Finance Manager",
  site_manager: "Site Manager",
  worker_electrician: "Electrician",
  worker_plumber: "Plumber",
  worker_carpenter: "Carpenter",
  worker_painter: "Painter",
  worker_civil: "Civil Worker",
  worker_other: "Other Worker",
  design_manager: "Design Manager",
  design_head: "Design Head",
  client: "Client"
} as const satisfies Readonly<Record<Role, string>>;

export const WORKER_ROLES = [
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other"
] as const satisfies readonly Role[];

export type WorkerRole = (typeof WORKER_ROLES)[number];

export const OPERATIONAL_ROLES = [
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
] as const satisfies readonly Role[];

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

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
  "procurement.workspace.read",
  "procurement.expense.create",
  "procurement.document.read",
  "finance.bucket.read",
  "finance.entry.read",
  "finance.entry.create",
  "workflow.tasks.read",
  "workflow.tasks.update",
  "ai_estimator_knowledge.configuration.read",
  "ai_estimator_knowledge.configuration.create",
  "ai_estimator_knowledge.configuration.update",
  "ai_estimator_knowledge.configuration.lifecycle",
  "ai_estimator_knowledge.context.read"
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const AUTHORIZATION_POLICY_VERSION =
  "2026-08-28.ai-estimator-knowledge.v6" as const;

export interface AuthorizationSnapshot {
  readonly role: Role;
  readonly policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  readonly permissions: readonly PermissionCode[];
}

export function isFrontendRole(value: unknown): value is Role {
  return (
    typeof value === "string" &&
    (ROLE_CODES as readonly string[]).includes(value)
  );
}

export function isFrontendPermissionCode(
  value: unknown
): value is PermissionCode {
  return (
    typeof value === "string" &&
    (PERMISSION_CODES as readonly string[]).includes(value)
  );
}

export function roleMayRequestModule(
  role: Role,
  module: RequestableProjectModule
): boolean {
  return (
    REQUESTABLE_MODULES_BY_ROLE[role] as readonly RequestableProjectModule[]
  ).includes(module);
}
