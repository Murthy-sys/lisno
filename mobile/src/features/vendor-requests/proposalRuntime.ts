import { useMemo } from "react";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ApiError } from "../../core/http/apiClient";
import { createProposalApi } from "./proposalApi";
import type { ProposalScope } from "./proposalTypes";

export function useProposalContext(session: AuthenticatedSession, scope: ProposalScope) {
  const runtime = useConfiguredRuntime();
  const api = useMemo(() => createProposalApi(runtime.runtime.api.authenticated), [runtime.runtime.api.authenticated]);
  const key = (...parts: readonly unknown[]) => privateQueryKey({ environmentId: runtime.environment.environment.id, userId: session.user.id }, "knowledge", "vendor-basket-proposals", scope, ...parts);
  const admin = scope === "admin";
  const roleAllowed = session.user.role === (admin ? "super_admin" : "procurement");
  const has = (name: typeof session.authorization.permissions[number]) => roleAllowed && session.authorization.permissions.includes(name);
  return { api, key, scope, actorId: session.user.id, transport: runtime.runtime.api.authenticated,
    scopeKey: `${runtime.environment.environment.id}:${session.user.id}:${runtime.environment.generation}:${runtime.session.generation}:${scope}`,
    ready: runtime.environment.status === "ready", canRead: has(admin ? "ai_estimator_knowledge.configuration.read" : "procurement.vendor_basket_proposal.read"),
    canCreate: !admin && has("procurement.vendor_basket_proposal.create"),
    canUpdate: has(admin ? "ai_estimator_knowledge.configuration.update" : "procurement.vendor_basket_proposal.update"),
    canSubmit: has(admin ? "ai_estimator_knowledge.configuration.lifecycle" : "procurement.vendor_basket_proposal.submit") };
}
export type ProposalContext = ReturnType<typeof useProposalContext>;
export const proposalDenied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
export const proposalUncertain = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status === 408;
export const proposalError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed. Your entries are preserved.";
export const proposalStatus = { draft: "Draft", pending: "Awaiting Super Admin", fulfilled: "Approved", rejected: "Sent back" };
