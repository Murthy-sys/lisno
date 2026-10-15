import { useInfiniteQuery } from "@tanstack/react-query";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { parseProjectPage } from "../projects/projectsModel";

/** Reuses the project-list contract and cache while enforcing this surface's read capability. */
export function useProcurementAssignedProjects(session: AuthenticatedSession, enabled: boolean) {
  const context = useConfiguredRuntime();
  const canRead = enabled && canPerformOperation(session, "GET /projects");
  const query = useInfiniteQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id },
      "projects", "reference-list", session.user.role, "/projects"),
    initialPageParam: 0,
    enabled: canRead && context.environment.status === "ready",
    queryFn: async ({ pageParam, signal }) => {
      const page = parseProjectPage(await context.runtime.api.authenticated.get<unknown>(`/projects?limit=30&offset=${pageParam}`, { signal }));
      if (page.pagination.offset !== pageParam) throw new ApiProtocolError();
      return page;
    },
    getNextPageParam: (page) => page.pagination.hasMore && page.items.length > 0
      ? page.pagination.offset + page.pagination.limit : undefined
  });
  return { canRead, query };
}
