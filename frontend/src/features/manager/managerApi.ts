import { apiClient } from "../../api/client";
import type { AuditEvent, DesignerSummary, Evaluation, PageData } from "../../api/types";

const page = "limit=100&offset=0";

export const managementKeys = {
  team: ["management", "team"] as const,
  designer: (designerId: string) => ["management", "designer", designerId] as const,
  evaluations: (subjectId: string) => ["management", "evaluations", subjectId] as const,
  audit: (designerId: string) => ["management", "audit", designerId] as const,
  organization: ["management", "organization"] as const
};

export const getManagerTeam = () => apiClient.get<DesignerSummary[]>("/organization/team");
export const getDesignerSummary = (id: string) => apiClient.get<DesignerSummary>(`/designers/${encodeURIComponent(id)}/summary`);
export const getEvaluations = (id: string) => apiClient.get<PageData<Evaluation>>(`/evaluations/${encodeURIComponent(id)}?${page}`);
export const getDesignerAudit = (id: string) => apiClient.get<PageData<AuditEvent>>(`/designers/${encodeURIComponent(id)}/audit?${page}`);
export const getOrganization = () => apiClient.get<import("../../api/types").OrganizationManager[]>("/organization/tree");
