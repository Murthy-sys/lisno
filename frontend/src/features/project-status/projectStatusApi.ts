import { apiClient } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";

export const projectStatusKeys = {
  all: ["project-workflow", "project-status"] as const,
  project: (projectId: string) => ["project-workflow", "project-status", projectId] as const,
  detail: (projectId: string, identity: string) => ["project-workflow", "project-status", projectId, identity] as const
};

export const getProjectStatus = (projectId: string, signal?: AbortSignal) =>
  apiClient.get<ProjectStatusSummary>(`/projects/${encodeURIComponent(projectId)}/status`, { signal, showGlobalLoader: false });
