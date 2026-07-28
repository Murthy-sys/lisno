import { apiClient } from "../../api/client";
import type { ClientDesignVersion, ClientProjectSummary, DesignSectionDecisionResult, DesignSectionReviewData, PageData, Project, ProjectHierarchy } from "../../api/types";

const PAGE_SIZE = 100;

export const clientKeys = {
  projects: ["client", "projects"] as const,
  project: (projectId: string) => ["client", "projects", projectId] as const,
  versions: (projectId: string) => ["client", "projects", projectId, "versions"] as const,
  latestVersions: ["client", "latest-approved-versions"] as const,
  designSections: (projectId: string) => ["client", "projects", projectId, "design-sections"] as const
};

export async function getClientProjects(): Promise<Project[]> {
  return getAllPages((offset) => apiClient.get<PageData<Project>>(`/projects?limit=${PAGE_SIZE}&offset=${offset}`));
}

export async function getClientProjectSummaries(): Promise<ClientProjectSummary[]> {
  return getAllPages((offset) =>
    apiClient.get<PageData<ClientProjectSummary>>(
      `/client/project-summaries?limit=${PAGE_SIZE}&offset=${offset}`
    )
  );
}

export const getClientProject = (projectId: string) => apiClient.get<ProjectHierarchy>(`/projects/${encodeURIComponent(projectId)}`);
export const getClientVersions = (projectId: string) => getAllPages((offset) => apiClient.get<PageData<ClientDesignVersion>>(`/projects/${encodeURIComponent(projectId)}/design-versions?limit=${PAGE_SIZE}&offset=${offset}`));
export const getClientLatestApprovedVersions = () => apiClient.get<ClientDesignVersion[]>("/client/latest-approved-versions");
export const getDesignSectionReview = (projectId: string) =>
  apiClient.get<DesignSectionReviewData>(`/client/projects/${encodeURIComponent(projectId)}/design-sections`);
export const decideDesignSection = (
  revisionId: string,
  version: number,
  decision: "approved" | "rejected",
  comment?: string
) => apiClient.post<DesignSectionDecisionResult>(
  `/design-section-revisions/${encodeURIComponent(revisionId)}/decision`,
  { version, decision, ...(comment === undefined ? {} : { comment }) }
);

async function getAllPages<T>(pageAt: (offset: number) => Promise<PageData<T>>): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await pageAt(offset);
    items.push(...page.items);
    hasMore = page.pagination.hasMore;
    offset = page.pagination.offset + page.pagination.limit;
  }
  return items;
}
