import { QueryClient } from "@tanstack/react-query";

import type { RequestScope } from "../../contracts/http";
import type { CleanupRegistry } from "../config/cleanupRegistry";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "../http/apiClient";
import type { QueryFamily } from "./invalidationRegistry";

export type PrivateQueryKey = readonly [
  environmentId: string,
  userId: string,
  family: QueryFamily,
  ...parts: readonly unknown[]
];

export type PublicQueryKey = readonly [
  environmentId: string,
  visibility: "public",
  ...parts: readonly unknown[]
];

export function privateQueryKey(
  scope: Pick<RequestScope, "environmentId" | "userId">,
  family: QueryFamily,
  ...parts: readonly unknown[]
): PrivateQueryKey {
  if (!scope.environmentId) throw new Error("Query keys require an environment.");
  if (!scope.userId) {
    throw new Error("Private query keys require an authenticated user.");
  }
  return Object.freeze([scope.environmentId, scope.userId, family, ...parts]);
}

export function publicQueryKey(
  environmentId: string,
  ...parts: readonly unknown[]
): PublicQueryKey {
  if (!environmentId) throw new Error("Query keys require an environment.");
  return Object.freeze([environmentId, "public", ...parts]);
}

export function isQueryRetryable(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) return true;
  return error instanceof ApiError && (error.status === 408 || error.status === 429 || error.status >= 500);
}

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: isQueryRetryable,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false
      },
      mutations: {
        retry: false
      }
    }
  });
}

export function registerQueryCleanup(
  queryClient: QueryClient,
  cleanups: CleanupRegistry,
  name = "query-cache"
): () => void {
  return cleanups.register(
    name,
    async () => {
      try {
        await queryClient.cancelQueries();
      } finally {
        queryClient.clear();
      }
    },
    30
  );
}
