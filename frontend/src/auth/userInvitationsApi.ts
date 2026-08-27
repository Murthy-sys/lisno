import { apiClient } from "../api/client";
import type {
  AcceptUserInvitationInput,
  AcceptUserInvitationResult,
  UserInvitationInspection
} from "../api/types";

const publicRequestOptions = {
  cache: "no-store" as const,
  referrerPolicy: "no-referrer" as const
};

export function inspectUserInvitation(
  token: string
): Promise<UserInvitationInspection> {
  return apiClient.postPublic<UserInvitationInspection>(
    "/auth/user-invitations/inspect",
    { token },
    publicRequestOptions
  );
}

export function acceptUserInvitation(
  input: AcceptUserInvitationInput
): Promise<AcceptUserInvitationResult> {
  return apiClient.postPublic<AcceptUserInvitationResult>(
    "/auth/user-invitations/accept",
    {
      token: input.token,
      password: input.password,
      passwordConfirmation: input.passwordConfirmation
    },
    publicRequestOptions
  );
}
