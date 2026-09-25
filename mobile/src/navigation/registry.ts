import {
  AUTHORIZATION_POLICY_VERSION,
  ROLE_CODES,
  WORKER_ROLES,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../contracts/authorization";

export type FeatureId =
  | "dashboard"
  | "projects"
  | "estimates"
  | "work"
  | "design-plans"
  | "leads"
  | "team"
  | "organization"
  | "procurement"
  | "finance"
  | "messages"
  | "users"
  | "configuration"
  | "client-responses"
  | "design-approvals"
  | "access-review"
  | "access-self"
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
    "designer"
  ]),
  destination("projects", "My projects", "projects.client_summary.read", ["client"]),
  destination("estimates", "Estimates & design review", "estimation.client_estimate.list", ["client"]),
  destination("work", "Work", "workflow.tasks.read", WORK_ROLES),
  destination("design-plans", "Design plans", "design.plan_task.read", ["designer"]),
  destination("leads", "Leads & estimates", "estimation.lead.list", ["estimator_sales"]),
  destination("team", "Team", "organization.team.read", ["design_manager"]),
  destination("organization", "Organization", "organization.tree.read", ["design_head"]),
  destination("procurement", "Procurement", "procurement.workspace.read", ["procurement"]),
  destination("procurement", "Procurement", "procurement.vendor_suggestions.read", [
    "admin",
    "super_admin"
  ]),
  destination("finance", "Finance", "finance.bucket.read", ["finance_head", "super_admin"]),
  destination("messages", "Messages", "chat.read", ROLE_CODES),
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
  destination("notifications", "Notifications", "chat.read", ROLE_CODES)
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
  finance_head: "work",
  site_manager: "work",
  worker_electrician: "work",
  worker_plumber: "work",
  worker_carpenter: "work",
  worker_painter: "work",
  worker_civil: "work",
  worker_other: "work",
  design_manager: "team",
  design_head: "organization",
  client: "projects"
} as const satisfies Readonly<Record<Role, FeatureId>>);

const DOMAIN_BY_ROLE = Object.freeze({
  super_admin: "projects",
  admin: null,
  estimator_sales: null,
  designer: "design-plans",
  procurement: "procurement",
  finance_head: "finance",
  site_manager: null,
  worker_electrician: null,
  worker_plumber: null,
  worker_carpenter: null,
  worker_painter: null,
  worker_civil: null,
  worker_other: null,
  design_manager: null,
  design_head: null,
  client: null
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
    FEATURE_DESTINATIONS.filter(
      (candidate) =>
        candidate.roles.includes(role) &&
        authorization.permissions.includes(candidate.permission)
    )
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
    ? permittedDestination(role, authorization, domainId)
    : null;
  const messages = permittedDestination(role, authorization, "messages");

  return Object.freeze([
    Object.freeze({ id: "landing", label: landing.label, destination: landing }),
    ...(domain
      ? [Object.freeze({ id: "domain" as const, label: domain.label, destination: domain })]
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
