import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AuthRouteState } from "./AuthRouteState";
import { useAuth } from "./AuthProvider";

export function ProtectedRoute({
  children
}: {
  children: ReactNode;
}) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "signing_out") {
    return (
      <AuthRouteState
        title="Signing out"
        state="loading"
        message="Signing out…"
      />
    );
  }

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

  if (auth.status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!auth.user || !auth.authorization) {
    return (
      <AuthRouteState
        title="Opening your workspace"
        state="error"
        message="Authorization could not be established."
      />
    );
  }

  return children;
}
