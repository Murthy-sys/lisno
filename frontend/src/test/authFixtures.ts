import {
  AUTHORIZATION_POLICY_VERSION,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";

const BASE_SESSION_PERMISSIONS = [
  "identity.self.read",
  "identity.authorization.read"
] as const satisfies readonly PermissionCode[];

const DEFAULT_PERMISSIONS_BY_ROLE = {
  super_admin: [
    ...BASE_SESSION_PERMISSIONS,
    "identity.users.read",
    "access_request.review.read",
    "access_request.self.read"
  ],
  admin: [
    ...BASE_SESSION_PERMISSIONS,
    "identity.users.read",
    "access_request.review.read"
  ],
  estimator_sales: [
    ...BASE_SESSION_PERMISSIONS,
    "estimation.lead.list",
    "estimation.lead.read",
    "estimation.estimate.read"
  ],
  designer: [
    ...BASE_SESSION_PERMISSIONS,
    "projects.list",
    "projects.read",
    "access_request.self.read"
  ],
  procurement: [
    ...BASE_SESSION_PERMISSIONS,
    "access_request.self.read"
  ],
  finance_head: [
    ...BASE_SESSION_PERMISSIONS,
    "access_request.self.read"
  ],
  site_manager: [
    ...BASE_SESSION_PERMISSIONS,
    "access_request.self.read"
  ],
  worker_electrician: BASE_SESSION_PERMISSIONS,
  worker_plumber: BASE_SESSION_PERMISSIONS,
  worker_carpenter: BASE_SESSION_PERMISSIONS,
  worker_painter: BASE_SESSION_PERMISSIONS,
  worker_civil: BASE_SESSION_PERMISSIONS,
  worker_other: BASE_SESSION_PERMISSIONS,
  design_manager: [
    ...BASE_SESSION_PERMISSIONS,
    "organization.team.read",
    "organization.designer_summary.read",
    "projects.read"
  ],
  design_head: [
    ...BASE_SESSION_PERMISSIONS,
    "organization.tree.read",
    "organization.designer_summary.read",
    "projects.read"
  ],
  client: [
    ...BASE_SESSION_PERMISSIONS,
    "projects.client_summary.read",
    "projects.read"
  ]
} as const satisfies Readonly<Record<Role, readonly PermissionCode[]>>;

export function authorizationFor(
  role: Role,
  permissions: readonly PermissionCode[] = DEFAULT_PERMISSIONS_BY_ROLE[role]
): AuthorizationSnapshot {
  return Object.freeze({
    role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze([...permissions])
  });
}
