import { createHash, randomBytes } from "node:crypto";

import { isReservedDevelopmentDemoIdentity } from "./demo-identities.js";
import type {
  PasswordResetRequestRecord,
  UserRecord
} from "../repositories/types.js";

export type PasswordResetStoredStatus = "pending" | "superseded" | "completed";
export type PasswordResetDeliveryStatus = "queued" | "sent" | "failed";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1_000;
export const PASSWORD_RESET_RECIPIENT_COOLDOWN_MS = 5 * 60 * 1_000;
export const PASSWORD_RESET_RECIPIENT_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const PASSWORD_RESET_RECIPIENT_MAX_PER_WINDOW = 5;
export const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PASSWORD_RESET_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
export const PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  if (!PASSWORD_RESET_TOKEN_PATTERN.test(token)) {
    throw new Error("Password reset token has an invalid shape.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function expiresAtForPasswordReset(issuedAt: string): string {
  return new Date(Date.parse(issuedAt) + PASSWORD_RESET_TTL_MS).toISOString();
}

export function passwordResetSessionVersion(
  user: Pick<UserRecord, "sessionVersion">
): number {
  return user.sessionVersion ?? 1;
}

export function isPasswordResetEligible(
  user: Pick<
    UserRecord,
    "id" | "emailNormalized" | "active" | "accountKind"
  >
): boolean {
  return (
    user.active &&
    user.accountKind === "standard" &&
    !isReservedDevelopmentDemoIdentity(user)
  );
}

export function isPasswordResetAvailable(input: {
  reset: PasswordResetRequestRecord;
  user: UserRecord | null;
  now: string;
}): boolean {
  const { reset, user } = input;
  return Boolean(
    user &&
      reset.status === "pending" &&
      reset.tokenHash &&
      Date.parse(reset.expiresAt) > Date.parse(input.now) &&
      reset.userId === user.id &&
      reset.userVersion === user.version &&
      reset.sessionVersion === passwordResetSessionVersion(user) &&
      isPasswordResetEligible(user)
  );
}

export function isPasswordResetRecipientSuppressed(input: {
  latestIssuedAt: string | null;
  issuedCountInWindow: number;
  now: string;
}): boolean {
  const nowMs = Date.parse(input.now);
  if (
    input.latestIssuedAt !== null &&
    nowMs - Date.parse(input.latestIssuedAt) < PASSWORD_RESET_RECIPIENT_COOLDOWN_MS
  ) {
    return true;
  }
  return input.issuedCountInWindow >= PASSWORD_RESET_RECIPIENT_MAX_PER_WINDOW;
}
