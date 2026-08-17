import type { AuthorizationSnapshot, Role } from "../../api/authorization-contract";
import { ROUTE_REGISTRY, type NavigationItem } from "../../app/routeRegistry";
import { hasFrontendPermission } from "../../auth/authorization";

export type { NavigationItem } from "../../app/routeRegistry";

export function navigationForAuthorization(
  role: Role,
  authorization: AuthorizationSnapshot
): readonly NavigationItem[] {
  if (authorization.role !== role) return Object.freeze([]);

  return Object.freeze(
    ROUTE_REGISTRY
      .filter((entry) => entry.navigation !== null)
      .filter((entry) =>
        (entry.navigation!.roles as readonly Role[]).includes(role)
      )
      .filter(
        (entry) =>
          entry.permission === null ||
          hasFrontendPermission(authorization, entry.permission)
      )
      .map((entry) => Object.freeze({ ...entry.navigation!.item }))
  );
}
