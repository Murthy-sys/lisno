import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { Role } from "../api/types";
import { AsyncState } from "../components/ui/AsyncState";
import { useAuth } from "./AuthProvider";

export function roleHomePath(role: Role): string {
  const paths: Record<Role, string> = {
    designer: "/designer",
    design_manager: "/manager",
    design_head: "/head",
    client: "/client"
  };
  return paths[role];
}

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
    return <AsyncState state="loading" message="Restoring your session…" />;
  }

  if (auth.status === "error") {
    return (
      <AsyncState
        state="error"
        message="We couldn't restore your session."
        actionLabel="Try again"
        onAction={() => void auth.restore()}
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
