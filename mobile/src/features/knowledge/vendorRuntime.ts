import { useMemo } from "react";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";

/** The vendor editor accepts only these capabilities, never general Configuration access. */
export type VendorMobileContext = Pick<KnowledgeMobileContext,
  "api" | "key" | "scopeKey" | "ready" | "canRead" | "canCreate" | "canUpdate" |
  "canLifecycle" | "canCreateClassification" | "canCorrectBaseline" | "refresh">;

export function useProcurementVendorContext(session: AuthenticatedSession): VendorMobileContext {
  const configured = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const environmentId = configured.environment.environment.id;
  const userId = session.user.id;
  const permissions = session.authorization.permissions;
  const procurement = session.user.role === "procurement";
  const api = useMemo(() => createKnowledgeApi(configured.runtime.api.authenticated), [configured.runtime.api.authenticated]);
  const key = useMemo(() => (...parts: readonly unknown[]) => privateQueryKey({ environmentId, userId }, "knowledge", ...parts), [environmentId, userId]);
  const has = (permission: typeof permissions[number]) => procurement && permissions.includes(permission);
  return {
    api, key,
    scopeKey: `${environmentId}:${userId}:${configured.environment.generation}:${configured.session.generation}`,
    ready: configured.environment.status === "ready",
    canRead: has("procurement.vendor_directory.read"),
    canCreate: has("procurement.vendor_directory.create"),
    canUpdate: has("procurement.vendor_directory.update"),
    canLifecycle: has("procurement.vendor_directory.lifecycle"),
    canCreateClassification: has("procurement.vendor_classification.create"),
    canCorrectBaseline: has("procurement.vendor_allocation_baseline.correct"),
    refresh: () => invalidate("knowledge-changed")
  };
}
