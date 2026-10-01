import { apiClient } from "../../api/client";

export interface SiteCompletionSection {
  assignmentId: string;
  sourceSectionId: string;
  sectionLabel: string;
  roomName: string;
  itemName: string;
  scopeType: string;
  imageIds: string[];
}

export interface SiteCompletionReview {
  id: string;
  projectId: string;
  round: number;
  version: number;
  status: "pending" | "approved" | "changes_requested";
  progress: number;
  note: string;
  submittedAt: string;
  sections: SiteCompletionSection[];
  decision: { decision: "approve" | "request_changes"; reason: string | null; decidedAt: string } | null;
}

export interface SiteCompletion {
  projectId: string;
  projectStatus: string;
  version: number;
  progress: number;
  note: string;
  status: "draft" | "pending_client" | "changes_requested" | "client_approved";
  currentRound: number;
  canSubmit: boolean;
  needsReverification: boolean;
  blockers: string[];
  review: SiteCompletionReview | null;
}

export const siteCompletionKeys = { project: (projectId: string) => ["site-completion", projectId] as const };
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/site-completion`;
const clientPath = (projectId: string) => `/clients/projects/${encodeURIComponent(projectId)}/site-completion`;

export const getSiteCompletion = (projectId: string) => apiClient.get<SiteCompletion>(path(projectId), { showGlobalLoader: false });
export const getClientSiteCompletion = (projectId: string) => apiClient.get<SiteCompletion>(clientPath(projectId), { showGlobalLoader: false });
export const updateSiteCompletion = (projectId: string, value: { expectedVersion: number; idempotencyKey: string; progress: number; note: string }) =>
  apiClient.patch<SiteCompletion>(`${path(projectId)}/progress`, value);
export const submitSiteCompletion = (projectId: string, value: { expectedVersion: number; idempotencyKey: string; note: string }) =>
  apiClient.post<SiteCompletion>(`${path(projectId)}/submit`, value);
export const decideSiteCompletion = (projectId: string, value: { expectedVersion: number; idempotencyKey: string; decision: "approve" | "request_changes"; reason: string | null }) =>
  apiClient.post<SiteCompletion>(`${clientPath(projectId)}/decision`, value);
