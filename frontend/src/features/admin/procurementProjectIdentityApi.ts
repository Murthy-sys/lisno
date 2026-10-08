import { apiClient } from "../../api/client";

export interface ProcurementProjectIdentity {
  projectId: string;
  city: { name: string; key: string } | null;
  programManagerId: string | null;
  version: number;
}

export interface ProgramManagerOption { id: string; name: string; email: string }

export const procurementProjectIdentityKeys = {
  detail: (projectId: string) => ["admin-projects", "procurement-identity", projectId] as const,
  managers: (search: string) => ["admin-projects", "program-managers", search] as const
};

export function getProcurementProjectIdentity(projectId: string, signal?: AbortSignal) {
  return apiClient.get<ProcurementProjectIdentity>(
    `/admin/projects/${encodeURIComponent(projectId)}/procurement-identity`,
    { signal, showGlobalLoader: false }
  );
}

export function getProgramManagerOptions(search: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ q: search, limit: "50", offset: "0" });
  return apiClient.get<{ items: ProgramManagerOption[]; total: number; limit: number; offset: number }>(
    `/admin/program-managers?${query}`, { signal, showGlobalLoader: false }
  );
}

export function updateProcurementProjectIdentity(projectId: string, input: {
  expectedVersion: number; cityName: string | null; programManagerId: string | null;
}) {
  return apiClient.patch<ProcurementProjectIdentity>(
    `/admin/projects/${encodeURIComponent(projectId)}/procurement-identity`, input
  );
}
