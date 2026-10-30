import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { apiClient, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { pmDenied, pmPath } from "./projectManagerApi";
import type {
  PMApprovedSourceRef, PMEstimateView, PMVendorCandidatePage, PMVendorCandidateQuery,
  PMVendorSuggestionCommandResult, PMVendorSuggestionCreate, PMVendorSuggestionPage,
  PMVendorSuggestionQuery, PMVendorSuggestionUpdate
} from "./pmEstimateTypes";

export const pmEstimateKeys = {
  all: ["project-manager", "estimations"] as const,
  project: (actorId: string | undefined, projectId: string) => ["project-manager", "estimations", actorId, projectId] as const
};

export function pmSourceKey(source: PMApprovedSourceRef | null | undefined): string {
  return source ? JSON.stringify([source.estimateId, source.estimateVersion, source.estimateReviewRoundId,
    source.phase, source.designPlanVersion, source.sourceSnapshotId, source.sourceDigest]) : "unavailable";
}

const queryString = (value: Record<string, unknown>) => new URLSearchParams(Object.entries(value)
  .flatMap(([key, item]) => item === undefined ? [] : [[key, typeof item === "object" ? JSON.stringify(item) : String(item)]]));

/** Drop protected values, including inactive pages, after assignment or access denial. */
function clearProtectedData(client: QueryClient, prefix: QueryKey, currentKey?: QueryKey) {
  const current = JSON.stringify(currentKey);
  void client.cancelQueries({ queryKey: prefix, predicate: query => JSON.stringify(query.queryKey) !== current });
  for (const query of client.getQueryCache().findAll({ queryKey: prefix })) {
    query.setState({ data: undefined, dataUpdatedAt: 0 });
  }
}

function useProtectedPMQuery<T>(projectId: string, resource: string, suffix: QueryKey, enabled = true, validate?: (value: T) => void) {
  const auth = useAuth();
  const client = useQueryClient();
  const prefix = pmEstimateKeys.project(auth.user?.id, projectId);
  const key = [...prefix, ...suffix];
  const query = useQuery<T, Error>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = await apiClient.get<T>(pmPath(projectId, resource), { signal, showGlobalLoader: false });
      validate?.(result);
      return result;
    },
    enabled: enabled && Boolean(projectId) && auth.status === "authenticated" && auth.user?.role === "site_manager",
    staleTime: 10000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: (count, error) => !pmDenied(error) && count < 1
  });
  useEffect(() => {
    if (pmDenied(query.error)) clearProtectedData(client, prefix, key);
    // Keys are derived from primitives; react to the actual denial, not a recreated key array.
  }, [client, auth.user?.id, projectId, query.error]);
  return query;
}

export function usePMEstimate(projectId: string) {
  return useProtectedPMQuery<PMEstimateView>(projectId, "estimate", ["estimate"], true, value => {
    if (value.project.id !== projectId) throw new ApiError(409, "PM_ESTIMATE_PROJECT_CONFLICT", "The estimate does not match this project. Refresh your assigned project.");
  });
}

export function usePMVendorSuggestions(projectId: string, filters: PMVendorSuggestionQuery, source?: PMApprovedSourceRef | null) {
  return useProtectedPMQuery<PMVendorSuggestionPage>(projectId, `vendor-suggestions?${queryString({ ...filters })}`,
    ["suggestions", pmSourceKey(source), filters], true, value => {
      if (value.items.some(item => item.projectId !== projectId || filters.mainLineId && item.mainLine?.mainLineId !== filters.mainLineId)) {
        throw new ApiError(409, "PM_SUGGESTION_SCOPE_CONFLICT", "The suggestions do not match this project scope. Refresh the project.");
      }
    });
}

export function usePMVendorCandidates(projectId: string, query: PMVendorCandidateQuery | null, enabled = true) {
  return useProtectedPMQuery<PMVendorCandidatePage>(projectId,
    query ? `vendor-suggestion-candidates?${queryString({ ...query })}` : "vendor-suggestion-candidates",
    ["candidates", query ? pmSourceKey(query.expectedSource) : null, query?.mainLineId, query?.q, query?.limit, query?.offset],
    enabled && query !== null, value => {
      if (!query || value.mainLine.mainLineId !== query.mainLineId || pmSourceKey(value.source) !== pmSourceKey(query.expectedSource)) {
        throw new ApiError(409, "PM_CANDIDATE_SOURCE_CONFLICT", "The vendor lookup belongs to a different approved scope. Refresh and review the current scope.");
      }
    });
}

export type PMVendorSuggestionCommand =
  | { kind: "create"; body: PMVendorSuggestionCreate }
  | { kind: "update"; suggestionId: string; body: PMVendorSuggestionUpdate };

export function usePMVendorSuggestionCommand(projectId: string) {
  const client = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: (command: PMVendorSuggestionCommand) => command.kind === "create"
      ? apiClient.post<PMVendorSuggestionCommandResult>(pmPath(projectId, "vendor-suggestions"), command.body)
      : apiClient.patch<PMVendorSuggestionCommandResult>(pmPath(projectId, `vendor-suggestions/${encodeURIComponent(command.suggestionId)}`), command.body),
    onError: error => {
      if (pmDenied(error)) clearProtectedData(client, pmEstimateKeys.project(auth.user?.id, projectId));
    },
    onSettled: async (_data, error) => {
      if (pmDenied(error)) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: pmEstimateKeys.project(auth.user?.id, projectId) }),
        client.invalidateQueries({ queryKey: ["procurement"] })
      ]);
    }
  });
}

export function pmEstimateConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409;
}
