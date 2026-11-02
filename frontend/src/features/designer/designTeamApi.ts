import { apiClient } from "../../api/client";

export interface DesignTeamMember { id: string; name: string }
export interface DesignTeamDetail {
  projectId: string;
  version: number;
  primary: DesignTeamMember | null;
  secondaries: DesignTeamMember[];
  candidates: DesignTeamMember[];
  canManage: boolean;
  requiresReason: boolean;
}
export const designTeamKeys = { all: ["design-team"] as const, detail: (projectId: string, search: string) => ["design-team", projectId, search] as const };
export const getDesignTeam = (projectId: string, search: string) => apiClient.get<DesignTeamDetail>(`/projects/${encodeURIComponent(projectId)}/design-team?${new URLSearchParams({ search })}`);
export const saveSecondaryDesigners = (projectId: string, input: { expectedVersion: number; designerIds: string[]; reason?: string }) =>
  apiClient.put<DesignTeamDetail>(`/projects/${encodeURIComponent(projectId)}/secondary-designers`, input);
