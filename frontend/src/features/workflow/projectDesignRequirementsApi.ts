import { apiClient } from "../../api/client";
import type { DesignRuleKey } from "../../../../shared/knowledge/designRules";
export type DesignRequirementAction = "complete" | "approve" | "defer" | "reopen";
export interface ProjectDesignRequirement {
  id: string; lineItemId: string; mainLineId: string; lineName: string; ruleKey: DesignRuleKey;
  label: string; category: "selection" | "critical" | "stock" | "po_approval";
  status: "pending" | "approved" | "completed" | "deferred";
  note: string | null; details: string | null; checklist: Array<{ id: string; text: string }>;
  checkedPointIds: string[]; completedAt: string | null; completedById: string | null;
  deferredReason: string | null; dueAt: string | null; availableActions: DesignRequirementAction[];
}
export interface ProjectDesignRequirements {
  version: number; sourceToken: string; entries: ProjectDesignRequirement[]; blockers: string[]; canReadInternal: boolean;
}
export interface DesignRequirementCommand {
  expectedVersion: number; sourceToken: string; entryId: string; action: DesignRequirementAction;
  note: string; checkedPointIds?: string[]; idempotencyKey: string;
}
export const projectDesignRequirementsKeys = {
  all: ["project-design-requirements"] as const,
  detail: (projectId: string, identity: string) => ["project-design-requirements", projectId, identity] as const
};
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/design-requirements`;
export const getProjectDesignRequirements = (projectId: string) => apiClient.get<ProjectDesignRequirements>(path(projectId), { showGlobalLoader: false });
export const actOnProjectDesignRequirement = (projectId: string, input: DesignRequirementCommand) => apiClient.post<ProjectDesignRequirements>(`${path(projectId)}/actions`, input);
