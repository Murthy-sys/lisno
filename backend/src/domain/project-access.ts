import type { Role } from "../contracts/domain.js";
import {
  REQUESTABLE_MODULES_BY_ROLE,
  type ProjectModule
} from "./authorization.js";
import type { ProjectAccessGrantRecord } from "../repositories/types.js";

export type ProjectAccessScope =
  | { kind: "all" }
  | { kind: "linked-client"; clientId: string }
  | { kind: "initiated-or-assigned-designer"; designerId: string }
  | { kind: "accountable-manager"; managerId: string }
  | { kind: "none" };

type ProjectAccessUser = {
  id: string;
  role: Role;
};

type ProjectAccessRecord = {
  clientId: string | null;
  initiatingDesignerId: string;
  assignedDesignerIds: string[];
  managerId: string;
};

export function grantCanSupplyProjectModuleScope(
  role: Role,
  grant: Pick<ProjectAccessGrantRecord, "module" | "source" | "active">
): boolean {
  if (!grant.active) return false;

  if (grant.source === "access_request") {
    return REQUESTABLE_MODULES_BY_ROLE[role].some(
      (module) => module === grant.module
    );
  }
  if (grant.source === "admin_initiator") {
    return role === "admin" && grant.module === "projects";
  }
  return false;
}

const PROJECT_SCOPE_KIND_BY_ROLE = {
  super_admin: "none",
  admin: "none",
  estimator_sales: "none",
  procurement: "none",
  finance_head: "none",
  site_manager: "none",
  worker_electrician: "none",
  worker_plumber: "none",
  worker_carpenter: "none",
  worker_painter: "none",
  worker_civil: "none",
  worker_other: "none",
  design_head: "all",
  designer: "initiated-or-assigned-designer",
  design_manager: "accountable-manager",
  client: "linked-client"
} as const satisfies Record<Role, ProjectAccessScope["kind"]>;

export function projectAccessScopeForUser(
  user: ProjectAccessUser
): ProjectAccessScope {
  const kind = PROJECT_SCOPE_KIND_BY_ROLE[user.role];
  switch (kind) {
    case "all":
      return { kind };
    case "linked-client":
      return { kind, clientId: user.id };
    case "initiated-or-assigned-designer":
      return { kind, designerId: user.id };
    case "accountable-manager":
      return { kind, managerId: user.id };
    case "none":
      return { kind };
  }
}

export function projectIsInAccessScope(
  scope: ProjectAccessScope,
  project: ProjectAccessRecord
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "linked-client":
      return project.clientId === scope.clientId;
    case "initiated-or-assigned-designer":
      return (
        project.initiatingDesignerId === scope.designerId ||
        project.assignedDesignerIds.includes(scope.designerId)
      );
    case "accountable-manager":
      return project.managerId === scope.managerId;
    case "none":
      return false;
  }
}

export function legacyRelationshipAllows(
  user: ProjectAccessUser,
  project: ProjectAccessRecord,
  module: ProjectModule
): boolean {
  if (module !== "projects" && module !== "design") return false;
  return projectIsInAccessScope(projectAccessScopeForUser(user), project);
}
