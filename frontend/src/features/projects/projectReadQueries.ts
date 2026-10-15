import { useQuery } from "@tanstack/react-query";
import { ApiError, apiClient } from "../../api/client";
import type { Project, ProjectHierarchy } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { getAllProjects } from "../designer/designerApi";

export const projectReadKeys = {
  all: ["assigned-projects"] as const,
  list: (actorId: string | null, role: string | null) => ["assigned-projects", "list", actorId, role] as const,
  detail: (projectId: string, actorId: string | null, role: string | null) => ["assigned-projects", "detail", projectId, actorId, role] as const
};

export function projectReadDenied(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export function useAssignedProjects(enabled = true) {
  const { user, authorization } = useAuth();
  const canRead = enabled && Boolean(user) && hasFrontendPermission(authorization, "projects.list");
  const query = useQuery({
    queryKey: projectReadKeys.list(user?.id ?? null, user?.role ?? null),
    queryFn: getAllProjects,
    enabled: canRead
  });
  return { query, canRead, projects: canRead && !query.isError ? query.data : undefined };
}

export function useAssignedProject(projectId: string, enabled = true) {
  const { user, authorization } = useAuth();
  const canRead = enabled && Boolean(user && projectId) && hasFrontendPermission(authorization, "projects.read");
  const query = useQuery({
    queryKey: projectReadKeys.detail(projectId, user?.id ?? null, user?.role ?? null),
    queryFn: async ({ signal }) => {
      const project = await apiClient.get<ProjectHierarchy>(`/projects/${encodeURIComponent(projectId)}`, { signal, showGlobalLoader: false });
      if (project.id !== projectId) throw new ApiError(409, "PROJECT_IDENTITY_MISMATCH", "The project response did not match this project. Refresh to try again.");
      return project;
    },
    enabled: canRead
  });
  const project: Project | undefined = canRead && !query.isError && query.data?.id === projectId ? query.data : undefined;
  return { query, canRead, project };
}
