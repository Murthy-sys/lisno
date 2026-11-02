import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQuotationRevision, quotationKeys } from "../client/quotationApi";
import { refreshEstimateCollaboration } from "./estimateCollaborationQueries";

/** Poll only the small authorized token. Each tab retains ownership of its unsaved form. */
export function useQuotationRevision(projectId: string | null | undefined, enabled: boolean, estimateVersion: number | null | undefined) {
  const queryClient = useQueryClient();
  const revision = useQuery({
    queryKey: quotationKeys.revision(projectId ?? ""),
    queryFn: () => getQuotationRevision(projectId!),
    enabled: enabled && Boolean(projectId),
    // Leave time for the request and render within the five-second refresh target.
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false
  });
  useEffect(() => {
    if (revision.data && estimateVersion != null && revision.data.estimateVersion !== estimateVersion) {
      void refreshEstimateCollaboration(queryClient, { includeRevision: false });
    }
  }, [revision.data, estimateVersion, queryClient]);
  return revision;
}
