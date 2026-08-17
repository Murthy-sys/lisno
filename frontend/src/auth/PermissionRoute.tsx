import type { ReactNode } from "react";

import type {
  PermissionCode,
  Role
} from "../api/authorization-contract";
import { AuthRouteState } from "./AuthRouteState";
import { AccessDeniedPage, type SafeAccessRequestContext } from "./AccessDeniedPage";
import { hasFrontendPermission } from "./authorization";
import { useAuth } from "./AuthProvider";

export function PermissionRoute({
  permission,
  presentationRoles,
  requestContext,
  children
}: {
  permission: PermissionCode;
  presentationRoles: readonly Role[];
  requestContext?: SafeAccessRequestContext;
  children: ReactNode;
}) {
  const auth = useAuth();
  if (
    auth.status !== "authenticated" ||
    !auth.user ||
    !auth.authorization ||
    auth.authorization.role !== auth.user.role
  ) {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="error"
        message="Authorization could not be established."
      />
    );
  }

  return presentationRoles.includes(auth.user.role) &&
    hasFrontendPermission(auth.authorization, permission)
    ? children
    : <AccessDeniedPage requestContext={requestContext} />;
}
