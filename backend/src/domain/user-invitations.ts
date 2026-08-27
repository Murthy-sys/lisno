import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { ROLE_CODES, type Role } from "./roles.js";

export type InvitableRole = Exclude<Role, "client" | "super_admin">;
export type UserInvitationStoredStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationTokenValidity =
  | "current"
  | "expired"
  | "invalidated"
  | "unavailable";
export type UserInvitationPresentationStatus =
  | "pending"
  | "delivery_failed"
  | "expired"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationDeliveryStatus = "queued" | "sent" | "failed";
export type UserInvitationAction = "resend" | "revoke";

export const USER_INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;
export const USER_INVITATION_RECIPIENT_COOLDOWN_MS = 60_000;
export const USER_INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const USER_INVITATION_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
export const USER_INVITATION_NAME_MAX = 120;
export const USER_INVITATION_EMAIL_MAX = 254;
export const USER_INVITATION_MOBILE_MAX = 30;
export const USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN =
  /^[A-Z0-9_]{1,64}$/;
export const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

function isInvitableRole(role: Role): role is InvitableRole {
  return role !== "client" && role !== "super_admin";
}

export const INVITABLE_ROLE_CODES = ROLE_CODES.filter(isInvitableRole);

const controlFreeStringSchema = z.string().refine(
  (value) => !CONTROL_CHARACTERS.test(value),
  "Control characters are not allowed."
);

export const invitationNameSchema = controlFreeStringSchema
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(USER_INVITATION_NAME_MAX));

export const invitationEmailSchema = controlFreeStringSchema
  .transform((value) => value.trim())
  .pipe(z.string().max(USER_INVITATION_EMAIL_MAX).email("Enter a valid email address."));

export const invitationMobileSchema = controlFreeStringSchema
  .transform((value) => value.trim().replace(/ +/gu, " "))
  .pipe(
    z
      .string()
      .min(1)
      .max(USER_INVITATION_MOBILE_MAX)
      .regex(/^\+?[0-9 ()-]+$/)
      .refine((value) => {
        const digitCount = value.replace(/[^0-9]/gu, "").length;
        return digitCount >= 7 && digitCount <= 15;
      }, "Mobile must contain 7 to 15 ASCII digits.")
  );

export function normalizeInvitationEmail(value: string): string {
  return invitationEmailSchema.parse(value).toLowerCase();
}

export function normalizeInvitationMobile(value: string): string {
  return invitationMobileSchema.parse(value);
}

export function generateUserInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUserInvitationToken(token: string): string {
  if (!USER_INVITATION_TOKEN_PATTERN.test(token)) {
    throw new Error("Invitation token has an invalid shape.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function expiresAtForInvitation(issuedAt: string): string {
  return new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString();
}

export function tokenValidityForInvitation(input: {
  storedStatus: UserInvitationStoredStatus;
  expiresAt: string;
  issuerMatches: boolean;
  now: string;
}): UserInvitationTokenValidity {
  if (input.storedStatus !== "pending") return "unavailable";
  if (!input.issuerMatches) return "invalidated";
  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) return "expired";
  return "current";
}

export function presentationStatusForInvitation(input: {
  storedStatus: UserInvitationStoredStatus;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  now: string;
}): UserInvitationPresentationStatus {
  if (input.storedStatus !== "pending") return input.storedStatus;
  if (Date.parse(input.expiresAt) <= Date.parse(input.now)) return "expired";
  if (input.deliveryStatus === "failed") return "delivery_failed";
  return "pending";
}
