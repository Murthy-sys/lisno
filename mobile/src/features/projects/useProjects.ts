import { useInfiniteQuery } from "@tanstack/react-query";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { FEATURE_DEFINITIONS } from "../workspace/featureDefinitions";
import { parseProjectPage } from "./projectsModel";

const PAGE_SIZE = 30;

export function useProjects(session: AuthenticatedSession) {
  const context = useConfiguredRuntime();
  const definition = FEATURE_DEFINITIONS.projects;
  const endpoint = typeof definition.endpoint === "function" ? definition.endpoint(session.user.role) : definition.endpoint;
  const baseEndpoint = endpoint.split("?", 1)[0]!;
  return useInfiniteQuery({
    queryKey: privateQueryKey({
      environmentId: context.environment.environment.id,
      userId: session.user.id
    }, "projects", "reference-list", session.user.role, baseEndpoint),
    initialPageParam: 0,
    enabled: context.environment.status === "ready",
    queryFn: async ({ pageParam, signal }) => {
      const page = parseProjectPage(await context.runtime.api.authenticated.get<unknown>(
        `${baseEndpoint}?limit=${PAGE_SIZE}&offset=${pageParam}`,
        { signal }
      ));
      if (page.pagination.offset !== pageParam) throw new ApiProtocolError();
      return page;
    },
    getNextPageParam: (page) => page.pagination.hasMore && page.items.length > 0
      ? page.pagination.offset + page.pagination.limit
      : undefined
  });
}
