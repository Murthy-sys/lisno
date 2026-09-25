import { apiClient } from "../../api/client";
import type {
  AdminProjectPage,
  AdminProjectListInput,
  AdminProjectSummary,
  EstimatorOption,
  InitiateAdminProjectInput,
  InitiatedAdminProjectSummary,
  PageData,
  PaginationInput,
  SalesManagerOption
} from "../../api/types";

export const adminProjectKeys = {
  all: ["admin-projects"] as const,
  page: (input: AdminProjectListInput) =>
    ["admin-projects", "page", input] as const,
  detail: (projectId: string) =>
    ["admin-projects", "detail", projectId] as const,
  estimators: (search: string, pagination: PaginationInput) =>
    ["admin-projects", "estimators", search, pagination] as const,
  salesManagers: (search: string, pagination: PaginationInput) =>
    ["admin-projects", "sales-managers", search, pagination] as const
};

export function adminProjectsPath(input: AdminProjectListInput): string {
  const query = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset)
  });
  if (input.status) query.set("status", input.status);
  if (input.search?.trim()) query.set("search", input.search.trim());
  if (input.sort) query.set("sort", input.sort);
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

export const getAdminProjects = (input: AdminProjectListInput) =>
  apiClient.get<AdminProjectPage>(adminProjectsPath(input));

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

export function salesManagerOptionsPath(
  search: string,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/sales-managers?${query.toString()}`;
}

export const getSalesManagerOptions = (
  search: string,
  pagination: PaginationInput
) =>
  apiClient.get<PageData<SalesManagerOption>>(
    salesManagerOptionsPath(search, pagination)
  );

export const initiateAdminProject = (input: InitiateAdminProjectInput) =>
  apiClient.post<InitiatedAdminProjectSummary>("/admin/projects", input);
