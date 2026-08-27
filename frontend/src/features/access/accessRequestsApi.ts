import { apiClient } from "../../api/client";
import type {
  AccessRequestDecisionResult,
  AccessRequestListFilters,
  OwnAccessRequest,
  PageData,
  PaginationInput,
  ProjectAccessGrant,
  ReviewAccessRequest
} from "../../api/types";
import type { RequestableProjectModule } from "../../api/authorization-contract";

export const ownAccessRequestKeys = {
  all: ["access-requests", "mine"] as const,
  page: (filters: AccessRequestListFilters, pagination: PaginationInput) =>
    ["access-requests", "mine", filters, pagination] as const
};

export const reviewAccessRequestKeys = {
  all: ["access-requests", "review"] as const,
  page: (filters: AccessRequestListFilters, pagination: PaginationInput) =>
    ["access-requests", "review", filters, pagination] as const
};

export function accessRequestsPath(
  kind: "mine" | "review",
  filters: AccessRequestListFilters,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.module) query.set("module", filters.module);
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/access-requests/${kind}?${query.toString()}`;
}

export function createAccessRequest(input: {
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
}): Promise<{ accepted: true }> {
  return apiClient.post("/access-requests", input);
}

export function cancelAccessRequest(
  id: string,
  version: number
): Promise<OwnAccessRequest> {
  return apiClient.post(
    `/access-requests/${encodeURIComponent(id)}/cancel`,
    { version }
  );
}

export function decideAccessRequest(
  id: string,
  input:
    | { version: number; decision: "approved" }
    | { version: number; decision: "rejected"; reason: string }
): Promise<AccessRequestDecisionResult> {
  return apiClient.post(
    `/access-requests/${encodeURIComponent(id)}/decision`,
    input
  );
}

export function revokeProjectAccessGrant(
  id: string,
  input: { version: number; reason: string }
): Promise<ProjectAccessGrant> {
  return apiClient.post(
    `/project-access-grants/${encodeURIComponent(id)}/revoke`,
    input
  );
}

export function getOwnAccessRequests(
  filters: AccessRequestListFilters,
  pagination: PaginationInput
): Promise<PageData<OwnAccessRequest>> {
  return apiClient.get(accessRequestsPath("mine", filters, pagination));
}

export function getAccessRequestsForReview(
  filters: AccessRequestListFilters,
  pagination: PaginationInput
): Promise<PageData<ReviewAccessRequest>> {
  return apiClient.get(accessRequestsPath("review", filters, pagination));
}
