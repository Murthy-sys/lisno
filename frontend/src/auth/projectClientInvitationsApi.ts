import { apiClient } from "../api/client";
import type { AuthPayload } from "../api/types";

export interface ProjectInvitationInspection {
  projectId: string;
  projectName: string;
  clientName: string;
  email: string;
  expiresAt: string;
  requiresSignIn: boolean;
}

export interface AcceptProjectInvitationInput {
  token: string;
  password: string;
  passwordConfirmation: string;
}

export type AcceptedProjectInvitation = AuthPayload & { projectId: string };

export interface ProjectClientInvitationStatus {
  projectId: string;
  status: "not_issued" | "pending" | "delivery_failed" | "expired" | "revoked" | "accepted";
  deliveryAvailable: boolean;
  expectedVersion: number;
  expiresAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  availableActions: Array<"send" | "resend" | "revoke">;
}

const privateOptions = { cache: "no-store", referrerPolicy: "no-referrer" } as const;

export const projectClientInvitationKeys = {
  all: ["project-client-invitations"] as const,
  detail: (projectId: string) => ["project-client-invitations", projectId] as const
};

export const inspectProjectInvitation = (token: string) =>
  apiClient.postPublic<ProjectInvitationInspection>("/auth/project-invitations/inspect", { token }, privateOptions);

export const acceptProjectInvitation = (input: AcceptProjectInvitationInput) =>
  apiClient.postPublic<AcceptedProjectInvitation>("/auth/project-invitations/accept", {
    token: input.token,
    password: input.password,
    passwordConfirmation: input.passwordConfirmation
  }, privateOptions);

export const acceptExistingProjectInvitation = (token: string) =>
  apiClient.post<{ projectId: string }>("/auth/project-invitations/accept-existing", { token }, privateOptions);

const invitationPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/client-invitation`;

export const getProjectClientInvitation = (projectId: string) =>
  apiClient.get<ProjectClientInvitationStatus>(invitationPath(projectId), privateOptions);

export const sendProjectClientInvitation = (projectId: string) =>
  apiClient.post<ProjectClientInvitationStatus>(invitationPath(projectId), {}, privateOptions);

export const resendProjectClientInvitation = (projectId: string, expectedVersion: number) =>
  apiClient.post<ProjectClientInvitationStatus>(`${invitationPath(projectId)}/resend`, { expectedVersion }, privateOptions);

export const revokeProjectClientInvitation = (projectId: string, expectedVersion: number) =>
  apiClient.post<ProjectClientInvitationStatus>(`${invitationPath(projectId)}/revoke`, { expectedVersion }, privateOptions);
