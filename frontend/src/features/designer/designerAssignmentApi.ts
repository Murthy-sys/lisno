import { keyCollectionReminderKeys } from "./keyCollectionRemindersApi";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../../api/client";
import type {
  CancelDesignerAssignmentRequestInput, CreateDesignerAssignmentRequestInput,
  DecideDesignerAssignmentRequestInput, DesignerAssignmentInboxItem, DesignerAssignmentInboxPage,
  DesignerAssignmentRequestSummary, DesignerSuggestionsPage
} from "../../../../shared/projects/designerAssignment";
import { adminProjectKeys } from "../admin/adminProjectsApi";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { clientKeys } from "../client/clientApi";
import { quotationKeys } from "../client/quotationApi";
import { leadKeys } from "../leads/leadsApi";
import { projectReadKeys } from "../projects/projectReadQueries";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { designerKeys } from "./designerApi";
import { designTeamKeys } from "./designTeamApi";

export const designerAssignmentKeys = {
  all: ["designer-assignment"] as const,
  suggestions: (projectId: string, actor: string, search: string, offset: number) =>
    ["designer-assignment", "suggestions", projectId, actor, search, offset] as const,
  inbox: (actor: string, offset: number) => ["designer-assignment", "inbox", actor, offset] as const
};
export const assignmentPageSize = 20;
export const getDesignerSuggestions = async (projectId: string, search: string, offset: number) => {
  const data = await apiClient.get<DesignerSuggestionsPage>(`/admin/projects/${encodeURIComponent(projectId)}/designer-suggestions?${new URLSearchParams({ search, limit: String(assignmentPageSize), offset: String(offset) })}`, { showGlobalLoader: false });
  if (data.projectId !== projectId || !Array.isArray(data.pendingRequests)) {
    throw new ApiError(502, "DESIGNER_ASSIGNMENT_RESPONSE_INVALID", "Assignment request details are unavailable. Refresh to try again.");
  }
  return data;
};
export const createDesignerAssignmentRequest = (projectId: string, input: CreateDesignerAssignmentRequestInput) =>
  apiClient.post<DesignerAssignmentRequestSummary>(`/admin/projects/${encodeURIComponent(projectId)}/designer-assignment-requests`, input, { showGlobalLoader: false });
export const cancelDesignerAssignmentRequest = (projectId: string, requestId: string, input: CancelDesignerAssignmentRequestInput) =>
  apiClient.post<DesignerAssignmentRequestSummary>(`/admin/projects/${encodeURIComponent(projectId)}/designer-assignment-requests/${encodeURIComponent(requestId)}/cancel`, input, { showGlobalLoader: false });
export const getDesignerAssignmentInbox = (offset: number) =>
  apiClient.get<DesignerAssignmentInboxPage>(`/designer/assignment-requests?${new URLSearchParams({ status: "pending", limit: String(assignmentPageSize), offset: String(offset) })}`, { showGlobalLoader: false });
export const decideDesignerAssignment = (requestId: string, input: DecideDesignerAssignmentRequestInput) =>
  apiClient.post<DesignerAssignmentInboxItem>(`/designer/assignment-requests/${encodeURIComponent(requestId)}/decision`, input, { showGlobalLoader: false });

export async function refreshDesignerAssignment(client: QueryClient, projectId?: string) {
  await Promise.all([
    keyCollectionReminderKeys.all, designerAssignmentKeys.all, adminProjectKeys.all, projectWorkflowKeys.all, dashboardKeys.all,
    designTeamKeys.all, designerKeys.all, projectReadKeys.all, leadKeys.all, clientKeys.projects,
    ...(projectId ? [quotationKeys.detail(projectId), quotationKeys.revision(projectId)] : [])
  ].map(queryKey => client.invalidateQueries({ queryKey })));
}
