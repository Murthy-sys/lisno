import type { Role } from "../contracts/domain.js";
import {
  REQUESTABLE_MODULES_BY_ROLE,
  type ProjectModule
} from "./authorization.js";
import type { ProjectAccessGrantRecord } from "../repositories/types.js";

type ProjectAccessUser = {
  id: string;
  role: Role;
};

type ProjectAccessRecord = {
  clientId: string | null;
  initiatingDesignerId: string | null;
  assignedDesignerIds: string[];
  managerId: string | null;
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

export function legacyRelationshipAllows(
  user: ProjectAccessUser,
  project: ProjectAccessRecord,
  module: ProjectModule
): boolean {
  if (module !== "projects" && module !== "design") return false;
  switch (user.role) {
    case "design_head":
      return true;
    case "client":
      return project.clientId === user.id;
    case "designer":
      return (
        project.initiatingDesignerId === user.id ||
        project.assignedDesignerIds.includes(user.id)
      );
    case "design_manager":
      return project.managerId === user.id;
    default:
      return false;
  }
}
