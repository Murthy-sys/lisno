import type { Role } from "../contracts/domain.js";

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

const PROJECT_SCOPE_KIND_BY_ROLE = {
  design_head: "all",
  designer: "initiated-or-assigned-designer",
  design_manager: "accountable-manager",
  client: "linked-client",
  estimator_sales: "none"
} as const satisfies Record<Role, ProjectAccessScope["kind"]>;

export function projectAccessScopeForUser(
  user: ProjectAccessUser
): ProjectAccessScope {
  const kind = PROJECT_SCOPE_KIND_BY_ROLE[user.role] ?? "none";
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
