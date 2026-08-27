import { apiClient } from "../../api/client";
import type {
  AdminProjectPage,
  AdminProjectSummary,
  EstimatorOption,
  InitiateAdminProjectInput,
  PageData,
  PaginationInput
} from "../../api/types";

export const adminProjectKeys = {
  all: ["admin-projects"] as const,
  page: (pagination: PaginationInput) =>
    ["admin-projects", "page", pagination] as const,
  detail: (projectId: string) =>
    ["admin-projects", "detail", projectId] as const,
  estimators: (search: string, pagination: PaginationInput) =>
    ["admin-projects", "estimators", search, pagination] as const
};

export function adminProjectsPath(pagination: PaginationInput): string {
  const query = new URLSearchParams({
    limit: String(pagination.limit),
    offset: String(pagination.offset)
  });
  return `/admin/projects?${query.toString()}`;
}

export function estimatorOptionsPath(
  search: string,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/estimators?${query.toString()}`;
}

export const getAdminProjects = (pagination: PaginationInput) =>
  apiClient.get<AdminProjectPage>(adminProjectsPath(pagination));

export const getAdminProject = (projectId: string) =>
  apiClient.get<AdminProjectSummary>(
    `/admin/projects/${encodeURIComponent(projectId)}`
  );

export const getEstimatorOptions = (
  search: string,
  pagination: PaginationInput
) =>
  apiClient.get<PageData<EstimatorOption>>(
    estimatorOptionsPath(search, pagination)
  );

export const initiateAdminProject = (input: InitiateAdminProjectInput) =>
  apiClient.post<AdminProjectSummary>("/admin/projects", input);
