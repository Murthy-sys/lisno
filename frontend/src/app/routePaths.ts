import type { Role } from "../api/types";

const roleHomePaths: Record<Role, string> = {
  designer: "/designer",
  design_manager: "/manager",
  design_head: "/head",
  estimator_sales: "/estimator-sales",
  client: "/client"
};

export function roleHomePath(role: Role): string {
  return roleHomePaths[role];
}
