import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { UpdateWorkflowTimelines, WorkflowTimelineConfiguration } from "../../../../shared/projects/workflowTimelines";

export const workflowTimelineKeys = {
  detail: (userId: string, sessionId: string, policyVersion: string) =>
    ["workflow-timelines", userId, sessionId, policyVersion] as const
};

export function getWorkflowTimelines(signal?: AbortSignal) {
  return apiClient.get<WorkflowTimelineConfiguration>("/admin/workflow-timelines", { signal, showGlobalLoader: false });
}

export function updateWorkflowTimelines(input: UpdateWorkflowTimelines) {
  return apiClient.put<WorkflowTimelineConfiguration>("/admin/workflow-timelines", input, { showGlobalLoader: false });
}

export function workflowTimelinesQuery(userId: string, sessionId: string, policyVersion: string) {
  return queryOptions({
    queryKey: workflowTimelineKeys.detail(userId, sessionId, policyVersion),
    queryFn: ({ signal }) => getWorkflowTimelines(signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false
  });
}
