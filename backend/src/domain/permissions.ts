import type { Role } from "../contracts/domain.js";

export function isRoleAuthorized(
  role: Role,
  allowedRoles: readonly Role[]
): boolean {
  return allowedRoles.includes(role);
}
