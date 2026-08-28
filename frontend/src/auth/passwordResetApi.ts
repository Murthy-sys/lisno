import { apiClient } from "../api/client";

export interface PasswordResetRequestResult {
  accepted: true;
}

export interface PasswordResetInspection {
  available: true;
}

export interface PasswordResetCompletionResult {
  reset: true;
}

export interface CompletePasswordResetInput {
  token: string;
  password: string;
  passwordConfirmation: string;
}

const publicRequestOptions = {
  cache: "no-store" as const,
  referrerPolicy: "no-referrer" as const
};

export function requestPasswordReset(
  email: string
): Promise<PasswordResetRequestResult> {
  return apiClient.postPublic<PasswordResetRequestResult>(
    "/auth/password-reset/request",
    { email },
    publicRequestOptions
  );
}

export function inspectPasswordReset(
  token: string
): Promise<PasswordResetInspection> {
  return apiClient.postPublic<PasswordResetInspection>(
    "/auth/password-reset/inspect",
    { token },
    publicRequestOptions
  );
}

export function completePasswordReset({
  token,
  password,
  passwordConfirmation
}: CompletePasswordResetInput): Promise<PasswordResetCompletionResult> {
  return apiClient.postPublic<PasswordResetCompletionResult>(
    "/auth/password-reset/complete",
    { token, password, passwordConfirmation },
    publicRequestOptions
  );
}
