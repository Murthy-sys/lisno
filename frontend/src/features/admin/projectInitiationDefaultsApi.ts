import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { ProjectInitiationDefaults } from "../../api/types";

export const projectInitiationDefaultsKeys = {
  all: ["project-initiation-defaults"] as const,
  detail: (actorId: string) => ["project-initiation-defaults", actorId] as const
};

export function getProjectInitiationDefaults(signal?: AbortSignal) {
  return apiClient.get<ProjectInitiationDefaults>("/admin/project-initiation-defaults", { signal, showGlobalLoader: false });
}

export function updateProjectInitiationDefaults(input: { expectedVersion: number; projectManagerId: string }) {
  return apiClient.put<ProjectInitiationDefaults>("/admin/project-initiation-defaults", input);
}

export function projectInitiationDefaultsQuery(actorId: string) {
  return queryOptions({
    queryKey: projectInitiationDefaultsKeys.detail(actorId),
    queryFn: ({ signal }) => getProjectInitiationDefaults(signal),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false
  });
}
