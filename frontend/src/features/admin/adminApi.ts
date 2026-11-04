import { apiClient } from "../../api/client";
import type {
  DeleteManagedUserInput,
  ManagedUserDeletionResult,
  ManagedUserMutationResult,
  PaginationInput,
  UpdateManagedUserInput,
  UserDirectoryFilters,
  UserDirectoryPage,
  UserResponsibilitiesPage,
  UserResponsibilityQuery
} from "../../api/types";

export const adminUserKeys = {
  all: ["admin-users"] as const,
  page: (filters: UserDirectoryFilters, pagination: PaginationInput) =>
    ["admin-users", filters, pagination] as const,
  responsibilities: (userId: string) => ["admin-users", "responsibilities", userId] as const,
  responsibilityPage: (userId: string, version: number, query: UserResponsibilityQuery) =>
    ["admin-users", "responsibilities", userId, version, query] as const
};

export function getUserResponsibilities(userId: string, input: UserResponsibilityQuery, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(input.limit), offset: String(input.offset) });
  if (input.destinationRole) query.set("destinationRole", input.destinationRole);
  return apiClient.get<UserResponsibilitiesPage>(
    `/admin/users/${encodeURIComponent(userId)}/responsibilities?${query}`,
    { signal, showGlobalLoader: false }
  );
}

export function managedUsersPath(
  filters: UserDirectoryFilters,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.role) query.set("role", filters.role);
  if (filters.active !== undefined) query.set("active", String(filters.active));
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/users?${query.toString()}`;
}

export function getManagedUsers(
  filters: UserDirectoryFilters,
  pagination: PaginationInput
): Promise<UserDirectoryPage> {
  return apiClient.get<UserDirectoryPage>(managedUsersPath(filters, pagination));
}

export function updateManagedUser(
  userId: string,
  input: UpdateManagedUserInput
): Promise<ManagedUserMutationResult> {
  return apiClient.patch<ManagedUserMutationResult>(
    `/admin/users/${encodeURIComponent(userId)}`,
    input
  );
}

export function deleteManagedUser(
  userId: string,
  input: DeleteManagedUserInput
): Promise<ManagedUserDeletionResult> {
  return apiClient.delete<ManagedUserDeletionResult>(
    `/admin/users/${encodeURIComponent(userId)}`,
    input
  );
}
