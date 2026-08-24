import {
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  FolderKanban,
  House,
  KeyRound,
  LayoutDashboard,
  MailCheck,
  UsersRound,
  type LucideIcon
} from "lucide-react";

import {
  ROLE_CODES,
  WORKER_ROLES,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";

export interface NavigationItem {
  readonly label: string;
  readonly to: string;
  readonly end: boolean;
  readonly icon: LucideIcon;
}

export interface RegisteredFrontendRoute {
  readonly path: string;
  readonly permission: PermissionCode | null;
  readonly presentationRoles: readonly Role[];
  readonly navigation: {
    readonly roles: readonly Role[];
    readonly item: NavigationItem;
  } | null;
}

export const ROUTE_REGISTRY = [
  { path: "/designer", permission: "projects.list", presentationRoles: ["designer"], navigation: { roles: ["designer"], item: { label: "Workspace", to: "/designer", end: true, icon: LayoutDashboard } } },
  { path: "/designer/projects/:projectId", permission: "projects.read", presentationRoles: ["designer"], navigation: null },
  { path: "/manager", permission: "organization.team.read", presentationRoles: ["design_manager"], navigation: { roles: ["design_manager"], item: { label: "Team", to: "/manager", end: true, icon: UsersRound } } },
  { path: "/manager/designers/:designerId", permission: "organization.designer_summary.read", presentationRoles: ["design_manager"], navigation: null },
  { path: "/manager/projects/:projectId", permission: "projects.read", presentationRoles: ["design_manager"], navigation: null },
  { path: "/head", permission: "organization.tree.read", presentationRoles: ["design_head"], navigation: { roles: ["design_head"], item: { label: "Organization", to: "/head", end: true, icon: Building2 } } },
  { path: "/head/designers/:designerId", permission: "organization.designer_summary.read", presentationRoles: ["design_head"], navigation: null },
  { path: "/head/projects/:projectId", permission: "projects.read", presentationRoles: ["design_head"], navigation: null },
  { path: "/estimator-sales", permission: "estimation.lead.list", presentationRoles: ["estimator_sales"], navigation: { roles: ["estimator_sales"], item: { label: "Leads & estimates", to: "/estimator-sales", end: true, icon: BriefcaseBusiness } } },
  { path: "/estimator-sales/leads/:leadId", permission: "estimation.lead.read", presentationRoles: ["estimator_sales"], navigation: null },
  { path: "/estimator-sales/leads/:leadId/estimate", permission: "estimation.estimate.read", presentationRoles: ["estimator_sales"], navigation: null },
  { path: "/client", permission: "projects.client_summary.read", presentationRoles: ["client"], navigation: { roles: ["client"], item: { label: "My projects", to: "/client", end: true, icon: FolderKanban } } },
  { path: "/client/projects/:projectId", permission: "projects.read", presentationRoles: ["client"], navigation: null },
  { path: "/admin/projects", permission: "projects.list", presentationRoles: ["admin"], navigation: { roles: ["admin"], item: { label: "My Projects", to: "/admin/projects", end: true, icon: FolderKanban } } },
  { path: "/admin/projects/:projectId", permission: "projects.read", presentationRoles: ["admin"], navigation: null },
  { path: "/admin/users", permission: "identity.users.read", presentationRoles: ["super_admin"], navigation: { roles: ["super_admin"], item: { label: "Users", to: "/admin/users", end: true, icon: UsersRound } } },
  { path: "/admin/client-responses", permission: "estimation.client_response_tasks.read", presentationRoles: ["admin", "super_admin"], navigation: { roles: ["admin", "super_admin"], item: { label: "Client responses", to: "/admin/client-responses", end: true, icon: MailCheck } } },
  { path: "/admin/client-responses/:roundId", permission: "estimation.client_response_tasks.read", presentationRoles: ["admin", "super_admin"], navigation: null },
  { path: "/admin/access-requests", permission: "access_request.review.read", presentationRoles: ["admin", "super_admin"], navigation: { roles: ["admin", "super_admin"], item: { label: "Access requests", to: "/admin/access-requests", end: true, icon: ClipboardCheck } } },
  { path: "/access-requests/mine", permission: "access_request.self.read", presentationRoles: ["designer", "procurement", "finance_head", "site_manager", "super_admin"], navigation: { roles: ["designer", "procurement", "finance_head", "site_manager"], item: { label: "My access requests", to: "/access-requests/mine", end: true, icon: KeyRound } } },
  { path: "/home", permission: "identity.self.read", presentationRoles: ["procurement", "finance_head", "site_manager", ...WORKER_ROLES], navigation: { roles: ["procurement", "finance_head", "site_manager", ...WORKER_ROLES], item: { label: "Home", to: "/home", end: true, icon: House } } },
  { path: "/access-denied", permission: null, presentationRoles: ROLE_CODES, navigation: null }
] as const satisfies readonly RegisteredFrontendRoute[];

export type RegisteredFrontendPath = (typeof ROUTE_REGISTRY)[number]["path"];

export function registeredRoute(path: RegisteredFrontendPath) {
  const route = ROUTE_REGISTRY.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Unregistered frontend route: ${path}`);
  return route;
}
