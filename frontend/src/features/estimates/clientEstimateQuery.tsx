import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { estimateWorkflowKeys, getClientEstimates, type EstimateQueueItem } from "./estimateWorkflowApi";

const EstimateReadContext = createContext<ReturnType<typeof useEstimateRead> | null>(null);

/** One verified read shared by the table, deep link and nested review consumers. */
export function ClientEstimateQueryProvider({ children }: { children: ReactNode }) {
  const shared = useContext(EstimateReadContext);
  const { user, reviewSession } = useAuth();
  const identity = `${user?.id}:${user?.role}:${reviewSession?.id ?? ""}`;
  return shared ? <>{children}</> : <SessionEstimateProvider key={identity}>{children}</SessionEstimateProvider>;
}

function SessionEstimateProvider({ children }: { children: ReactNode }) {
  const read = useEstimateRead(true);
  return <EstimateReadContext.Provider value={read}>{children}</EstimateReadContext.Provider>;
}

export function useClientEstimates(enabled = true) {
  const shared = useContext(EstimateReadContext);
  const own = useEstimateRead(enabled && !shared);
  return shared ?? own;
}

function useEstimateRead(enabled: boolean) {
  const { user, status, reviewSession } = useAuth();
  const identity = `${user?.id}:${user?.role}:${reviewSession?.id ?? ""}`;
  const authenticated = Boolean(user && status === "authenticated");
  const client = useQueryClient();
  const [removedIdentity, setRemovedIdentity] = useState<string>();
  const [verified, setVerified] = useState<{ identity: string; data: EstimateQueueItem[] }>();
  const removed = removedIdentity === identity;
  const query = useQuery({
    queryKey: estimateWorkflowKeys.clientSession(identity),
    queryFn: async ({ signal }) => {
      const rows = await getClientEstimates(signal);
      if (!Array.isArray(rows)) throw new Error("Client estimates response is invalid.");
      return rows;
    },
    enabled: enabled && authenticated && !removed,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: enabled && !removed,
    refetchInterval: false, retry: false
  });
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  useEffect(() => {
    if (!enabled) return;
    if (denied) {
      setRemovedIdentity(identity);
      setVerified(undefined);
      client.removeQueries({ queryKey: estimateWorkflowKeys.clientSession(identity), exact: true });
    } else if (query.isError) {
      setVerified(undefined);
    } else if (authenticated && query.isSuccess && query.isFetchedAfterMount && !query.isFetching) {
      setVerified({ identity, data: query.data });
    }
  }, [authenticated, client, denied, enabled, identity, query.data, query.isError, query.isFetchedAfterMount, query.isFetching, query.isSuccess]);
  const data = authenticated && !denied && !removed && !query.isError && verified?.identity === identity &&
    (verified.data === query.data || query.isSuccess && query.isFetchedAfterMount)
    ? query.data : undefined;
  return {
    data, error: query.error, isFetching: query.isFetching,
    isError: !authenticated || removed || query.isError,
    isPending: authenticated && !removed && !query.isError && data === undefined,
    isSuccess: data !== undefined,
    refetch: async () => {
      setRemovedIdentity(undefined);
      return query.refetch();
    }
  };
}
