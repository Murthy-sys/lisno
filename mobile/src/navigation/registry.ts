import {
  AUTHORIZATION_POLICY_VERSION,
  ACTIVE_ROLE_CODES,
  isActiveFrontendRole,
  WORKER_ROLES,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../contracts/authorization";

export type FeatureId =
  | "dashboard"
  | "projects"
  | "estimates"
  | "staff-estimates"
  | "performance"
  | "work"
  | "design-plans"
  | "leads"
  | "team"
  | "organization"
  | "procurement"
  | "procurement-vendors"
  | "finance"
  | "messages"
  | "ask-lisno"
  | "users"
  | "configuration"
  | "client-responses"
  | "design-approvals"
  | "access-review"
  | "access-self"
  | "execution"
  | "vendor-work"
  | "work-order-approvals"
  | "purchase-orders"
  | "project-completion"
  | "my-requests"
  | "payment-confirmations"
  | "notifications";

export interface FeatureDestination {
  readonly id: FeatureId;
  readonly label: string;
  readonly path: `/feature/${FeatureId}`;
  readonly permission: PermissionCode;
  readonly roles: readonly Role[];
}

const WORK_ROLES = [
  "procurement",
  "finance_head",
  "site_manager",
  ...WORKER_ROLES
] as const satisfies readonly Role[];

export const FEATURE_DESTINATIONS = Object.freeze([
  destination("dashboard", "Dashboard", "admin.dashboard.read", ["super_admin"]),
  destination("projects", "Projects", "projects.list", [
    "super_admin",
    "admin",
    "designer",
    "procurement",
    "site_manager",
    "design_manager",
    "design_head"
  ]),
  destination("projects", "My projects", "projects.client_summary.read", ["client"]),
  destination("staff-estimates", "Estimate review", "estimation.estimate.list", ["super_admin", "admin", "estimator_sales", "designer", "design_manager", "design_head"]),
  destination("staff-estimates", "Estimate review", "estimation.review_queue.read", ["super_admin", "admin", "design_manager", "design_head"]),
  destination("estimates", "Estimates & design review", "estimation.client_estimate.list", ["client"]),
  destination("performance", "My performance", "organization.user_kpi.read", ["designer", ...WORK_ROLES]),
  destination("work", "Work", "workflow.tasks.read", WORK_ROLES),
  destination("execution", "Execution", "execution.tracker.read", ["super_admin", "procurement", "site_manager"]),
  destination("vendor-work", "My work", "procurement.vendor_work.read", ["vendor"]),
  destination("work-order-approvals", "Work order approvals", "procurement.work_order_approval.read", ["site_manager", "designer", "procurement", "finance_head", "super_admin"]),
  destination("purchase-orders", "Purchase orders", "procurement.purchase_orders.approve", ["super_admin"]),
  destination("project-completion", "Project completion", "procurement.project_completion.decide", ["super_admin"]),
  destination("my-requests", "All my requests", "procurement.vendor_directory.read", ["procurement"]),
  destination("payment-confirmations", "Payment confirmations", "projects.design_workflow.payments.read", ["super_admin"]),
  destination("design-plans", "Design plans", "design.plan_task.read", ["designer"]),
  destination("leads", "Leads & estimates", "estimation.lead.list", ["estimator_sales"]),
  destination("team", "Team", "organization.team.read", ["design_manager"]),
  destination("organization", "Organization", "organization.tree.read", ["design_head"]),
  destination("procurement", "Procurement", "procurement.workspace.read", ["procurement"]),
  destination("procurement-vendors", "Vendors", "procurement.vendor_directory.read", ["procurement", "super_admin"]),
  destination("procurement", "Procurement", "procurement.vendor_suggestions.read", [
    "admin",
    "super_admin"
  ]),
  destination("finance", "Finance", "finance.bucket.read", ["finance_head", "super_admin"]),
  destination("messages", "Messages", "chat.read", ACTIVE_ROLE_CODES),
  destination("ask-lisno", "Ask Lisno", "ask_lisno.request", ["client"]),
  destination("users", "Users", "identity.users.read", ["super_admin"]),
  destination(
    "configuration",
    "Configuration",
    "ai_estimator_knowledge.configuration.read",
    ["super_admin"]
  ),
  destination(
    "client-responses",
    "Client responses",
    "estimation.client_response_tasks.read",
    ["admin", "super_admin"]
  ),
  destination(
    "design-approvals",
    "Design approvals",
    "design.plan_response_tasks.read",
    ["admin", "super_admin"]
  ),
  destination("access-review", "Access requests", "access_request.review.read", [
    "admin",
    "super_admin"
  ]),
  destination("access-self", "My access requests", "access_request.self.read", [
    "designer",
    "procurement",
    "finance_head",
    "site_manager"
  ]),
  destination("notifications", "Notifications", "chat.read", ACTIVE_ROLE_CODES),
  destination("notifications", "Notifications", "execution.notifications.read", ACTIVE_ROLE_CODES),
  destination("notifications", "Notifications", "ai_estimator_knowledge.configuration.read", ["super_admin"])
] satisfies readonly FeatureDestination[]);

function destination(
  id: FeatureId,
  label: string,
  permission: PermissionCode,
  roles: readonly Role[]
): FeatureDestination {
  return Object.freeze({ id, label, path: `/feature/${id}`, permission, roles });
}

const LANDING_BY_ROLE = Object.freeze({
  super_admin: "dashboard",
  admin: "projects",
  estimator_sales: "leads",
  designer: "projects",
  procurement: "work",
  program_manager: "execution",
  finance_head: "work",
  site_manager: "execution",
  worker_electrician: "work",
  worker_plumber: "work",
  worker_carpenter: "work",
  worker_painter: "work",
  worker_civil: "work",
  worker_other: "work",
  design_manager: "team",
  design_head: "organization",
  client: "projects",
  vendor: "vendor-work"
} as const satisfies Readonly<Record<Role, FeatureId>>);

const DOMAIN_BY_ROLE = Object.freeze({
  super_admin: "projects",
  admin: null,
  estimator_sales: null,
  designer: "design-plans",
  procurement: "procurement",
  program_manager: "projects",
  finance_head: "finance",
  site_manager: "projects",
  worker_electrician: null,
  worker_plumber: null,
  worker_carpenter: null,
  worker_painter: null,
  worker_civil: null,
  worker_other: null,
  design_manager: null,
  design_head: null,
  client: null,
  vendor: null
} as const satisfies Readonly<Record<Role, FeatureId | null>>);

export type RootTabId = "landing" | "domain" | "messages" | "profile" | "more";

export interface RootTab {
  readonly id: RootTabId;
  readonly label: string;
  readonly destination: FeatureDestination | null;
}

function isCompatibleSnapshot(
  role: Role,
  authorization: AuthorizationSnapshot | null
): authorization is AuthorizationSnapshot {
  return (
    isActiveFrontendRole(role) &&
    authorization !== null &&
    authorization.role === role &&
    authorization.policyVersion === AUTHORIZATION_POLICY_VERSION
  );
}

function permittedDestination(
  role: Role,
  authorization: AuthorizationSnapshot,
  id: FeatureId
): FeatureDestination | null {
  return (
    FEATURE_DESTINATIONS.find(
      (candidate) =>
        candidate.id === id &&
        candidate.roles.includes(role) &&
        authorization.permissions.includes(candidate.permission)
    ) ?? null
  );
}

export function destinationsForAuthorization(
  role: Role,
  authorization: AuthorizationSnapshot | null
): readonly FeatureDestination[] {
  if (!isCompatibleSnapshot(role, authorization)) return Object.freeze([]);

  return Object.freeze(
    [...new Map(FEATURE_DESTINATIONS.filter(
      (candidate) => candidate.roles.includes(role) && authorization.permissions.includes(candidate.permission)
    ).map(candidate => [candidate.id, candidate])).values()]
  );
}

export function rootTabsForAuthorization(
  role: Role,
  authorization: AuthorizationSnapshot | null
): readonly RootTab[] {
  if (!isCompatibleSnapshot(role, authorization)) return Object.freeze([]);

  const landing = permittedDestination(role, authorization, LANDING_BY_ROLE[role]);
  if (!landing) return Object.freeze([]);

  const domainId = DOMAIN_BY_ROLE[role];
  const domain = domainId
    ? permittedDestination(role, authorization, domainId) ??
      (role === "procurement"
        ? permittedDestination(role, authorization, "procurement-vendors")
        : null)
    : null;
  const messages = permittedDestination(role, authorization, "messages");

  return Object.freeze([
    Object.freeze({ id: "landing", label: landing.label, destination: landing }),
    ...(domain
      ? [Object.freeze({ id: "domain" as const, label: role === "procurement" ? "Procurement" : domain.label, destination: domain })]
      : []),
    ...(messages
      ? [Object.freeze({ id: "messages" as const, label: "Messages", destination: messages })]
      : []),
    Object.freeze({ id: "profile", label: "Profile", destination: null }),
    Object.freeze({ id: "more", label: "More", destination: null })
  ]);
}

export function landingDestination(
  role: Role,
  authorization: AuthorizationSnapshot | null
): FeatureDestination | null {
  return rootTabsForAuthorization(role, authorization)[0]?.destination ?? null;
}

export function resolveAuthorizedFeature(
  featureId: string,
  role: Role,
  authorization: AuthorizationSnapshot | null
): FeatureDestination | null {
  if (!isCompatibleSnapshot(role, authorization)) return null;
  return destinationsForAuthorization(role, authorization).find(
    (candidate) => candidate.id === featureId
  ) ?? null;
}
