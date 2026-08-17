import { apiClient } from "../../api/client";
import type {
  ManagedUserMutationResult,
  PaginationInput,
  UpdateManagedUserInput,
  UserDirectoryFilters,
  UserDirectoryPage
} from "../../api/types";

export const adminUserKeys = {
  all: ["admin-users"] as const,
  page: (filters: UserDirectoryFilters, pagination: PaginationInput) =>
    ["admin-users", filters, pagination] as const
};

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
