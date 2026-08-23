import { apiClient } from "../../api/client";
import type {
  CreateUserInvitationInput,
  InvitationVersionInput,
  PaginationInput,
  UserInvitationFilters,
  UserInvitationItem,
  UserInvitationPage
} from "../../api/types";

export const userInvitationKeys = {
  all: ["user-invitations"] as const,
  page: (filters: UserInvitationFilters, pagination: PaginationInput) =>
    ["user-invitations", filters, pagination] as const
};

export function userInvitationsPath(
  filters: UserInvitationFilters,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (filters.search !== undefined) query.set("search", filters.search);
  if (filters.role !== undefined) query.set("role", filters.role);
  if (filters.status !== undefined) query.set("status", filters.status);
  if (filters.deliveryStatus !== undefined) {
    query.set("deliveryStatus", filters.deliveryStatus);
  }
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/user-invitations?${query.toString()}`;
}

export function getUserInvitations(
  filters: UserInvitationFilters,
  pagination: PaginationInput
): Promise<UserInvitationPage> {
  return apiClient.get<UserInvitationPage>(
    userInvitationsPath(filters, pagination)
  );
}

export function createUserInvitation(
  input: CreateUserInvitationInput
): Promise<UserInvitationItem> {
  return apiClient.post<UserInvitationItem>("/admin/user-invitations", {
    name: input.name,
    email: input.email,
    role: input.role,
    mobile: input.mobile
  });
}

export function resendUserInvitation(
  invitationId: string,
  input: InvitationVersionInput
): Promise<UserInvitationItem> {
  return apiClient.post<UserInvitationItem>(
    `/admin/user-invitations/${encodeURIComponent(invitationId)}/resend`,
    { version: input.version }
  );
}

export function revokeUserInvitation(
  invitationId: string,
  input: InvitationVersionInput
): Promise<UserInvitationItem> {
  return apiClient.post<UserInvitationItem>(
    `/admin/user-invitations/${encodeURIComponent(invitationId)}/revoke`,
    { version: input.version }
  );
}
