import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { projectReadDenied } from "../projects/projectReadQueries";
import { getDesignWorkflow, projectWorkflowKeys, type DesignWorkflowView } from "./projectWorkflowApi";

export const designWorkflowQueryKey = (projectId: string, userId: string | null, role: string | null, reviewSessionId?: string | null) =>
  [...projectWorkflowKeys.designWorkflow(projectId), userId, role, reviewSessionId ?? null] as const;

/** Shared by the always-visible project header and the collapsible workflow body. */
export function useDesignWorkflowQuery(projectId: string) {
  const { user, authorization, reviewSession } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = designWorkflowQueryKey(projectId, user?.id ?? null, user?.role ?? null, reviewSession?.id);
  const canRead = Boolean(user && projectId) && hasFrontendPermission(authorization, "projects.design_workflow.read");
  const query = useQuery<DesignWorkflowView | null>({
    queryKey,
    queryFn: async () => {
      try {
        const result = await getDesignWorkflow(projectId);
        if (result.projectId !== projectId) throw new ApiError(502, "WORKFLOW_IDENTITY_MISMATCH", "The workflow response did not match this project.");
        return result;
      } catch (error) {
        // Removing the payload prevents a later transport error or remount from restoring revoked data.
        if (projectReadDenied(error)) queryClient.setQueryData<DesignWorkflowView | null>(queryKey, null);
        throw error;
      }
    },
    enabled: canRead,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false
  });
  const data = canRead && !projectReadDenied(query.error) && query.data?.projectId === projectId ? query.data : undefined;
  return { query, data, canRead };
}
