import { useMemo } from "react";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";

export function useKnowledgeContext(session: AuthenticatedSession) {
  const context = useConfiguredRuntime();
  const refresh = useInvalidateEvent();
  const environmentId = context.environment.environment.id;
  const userId = session.user.id;
  const permissions = session.authorization.permissions;
  const api = useMemo(() => createKnowledgeApi(context.runtime.api.authenticated), [context.runtime.api.authenticated]);
  const key = useMemo(() => (...parts: readonly unknown[]) => privateQueryKey({ environmentId, userId }, "knowledge", ...parts), [environmentId, userId]);
  return {
    api, key,
    scopeKey: `${environmentId}:${userId}:${context.environment.generation}:${context.session.generation}`,
    ready: context.environment.status === "ready",
    canRead: session.user.role === "super_admin" && permissions.includes("ai_estimator_knowledge.configuration.read"),
    canCreate: permissions.includes("ai_estimator_knowledge.configuration.create"),
    canUpdate: permissions.includes("ai_estimator_knowledge.configuration.update"),
    canLifecycle: permissions.includes("ai_estimator_knowledge.configuration.lifecycle"),
    canCreateQualityOptions: permissions.includes("ai_estimator_knowledge.quality_control_options.create"),
    refresh: () => refresh("knowledge-changed")
  };
}

export type KnowledgeMobileContext = ReturnType<typeof useKnowledgeContext>;

/** Complete catalogs are required for stable-ID choices. A failed page fails the load. */
export async function allKnowledgePages<T>(load: (page: { limit: number; offset: number }) => Promise<{ items: readonly T[]; pagination: { total: number; hasMore: boolean; offset: number; limit: number } }>): Promise<readonly T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await load({ limit: 100, offset });
    items.push(...page.items);
    if (!page.pagination.hasMore) return items;
    if (!page.items.length || page.pagination.offset !== offset || !Number.isSafeInteger(page.pagination.limit) || page.pagination.limit <= 0) throw new Error("The catalog could not be loaded completely. Retry before editing references.");
    offset += page.pagination.limit;
  }
}
