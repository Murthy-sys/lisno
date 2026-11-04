import type { Role } from "./roles.js";
import type { UserResponsibilityCategory } from "../contracts/user-responsibilities.js";
import type { UserResponsibilityCounts } from "../repositories/types.js";

export const responsibilityRole: Readonly<Record<UserResponsibilityCategory, Role | null>> = {
  ownedActiveLeads: "estimator_sales", ownedActiveEstimates: "estimator_sales",
  initiatedActiveProjects: "designer", assignedActiveProjects: "designer",
  managedActiveProjects: "design_manager", ownedActiveTasks: "designer",
  directReports: "design_manager", linkedClientProjects: "client",
  adminInitiatorGrants: "admin", assignedExecutionProjects: "site_manager",
  assignedWorkflowTasks: null
};

export const responsibilityCategories = Object.keys(responsibilityRole).sort() as UserResponsibilityCategory[];

export function responsibilityBlocksRole(category: UserResponsibilityCategory, destinationRole: Role) {
  return responsibilityRole[category] !== destinationRole;
}

export function hasIncompatibleResponsibility(counts: UserResponsibilityCounts, destinationRole: Role) {
  return responsibilityCategories.some(category => counts[category] > 0 && responsibilityBlocksRole(category, destinationRole));
}

export function responsibilityPageOrder(currentRole: Role, destinationRole?: Role) {
  const blocks = (category: UserResponsibilityCategory) => Boolean(destinationRole && destinationRole !== currentRole && responsibilityBlocksRole(category, destinationRole));
  return { blocks, categories: [...responsibilityCategories].sort((a, b) => Number(blocks(b)) - Number(blocks(a)) || (a < b ? -1 : a > b ? 1 : 0)) };
}
