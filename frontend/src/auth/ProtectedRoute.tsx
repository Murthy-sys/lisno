import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "../api/types";
import { roleHomePath } from "../app/routePaths";
import { AuthRouteState } from "./AuthRouteState";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({
  children,
  allowedRoles
}: {
  children: ReactNode;
  allowedRoles?: Role[];
}) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "restoring") {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="loading"
        message="Restoring your session…"
      />
    );
  }

  if (auth.status === "error") {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="error"
        message="We couldn't restore your session."
        action={{ label: "Try again", onAction: () => void auth.restore() }}
      />
    );
  }

  if (auth.status !== "authenticated" || !auth.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(auth.user.role)) {
    return <Navigate to={roleHomePath(auth.user.role)} replace />;
  }

  return children;
}
