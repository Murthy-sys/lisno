import { Link } from "react-router-dom";

import type { RequestableProjectModule } from "../api/authorization-contract";
import { roleMayRequestModule } from "../api/authorization-contract";
import { hasFrontendPermission } from "./authorization";
import { useAuth } from "./AuthProvider";

export interface SafeAccessRequestContext {
  readonly projectId: string;
  readonly module: RequestableProjectModule;
}

export function AccessDeniedPage({
  requestContext
}: {
  requestContext?: SafeAccessRequestContext;
}) {
  const auth = useAuth();
  const mayRequest =
    requestContext !== undefined &&
    auth.user !== null &&
    roleMayRequestModule(auth.user.role, requestContext.module) &&
    hasFrontendPermission(auth.authorization, "access_request.create");
  const requestSearch = requestContext
    ? new URLSearchParams({
        projectId: requestContext.projectId,
        module: requestContext.module
      }).toString()
    : "";

  return (
    <section className="role-landing" aria-labelledby="access-denied-title">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Authorization required</p>
          <h1 id="access-denied-title" tabIndex={-1}>Access denied</h1>
          <p>You do not have access to this page.</p>
        </div>
      </header>
      {mayRequest ? (
        <div className="placeholder-card">
          <div>
            <p className="eyebrow">Project access</p>
            <h2>Need access for this work?</h2>
            <p>You can send a request for the known project module.</p>
            <Link to={`/access-requests/mine?${requestSearch}`}>Request access</Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
