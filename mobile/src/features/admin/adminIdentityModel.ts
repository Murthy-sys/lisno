import type { Role } from "../../contracts/authorization";

export type InvitableRole = Exclude<Role, "client" | "super_admin">;
export type UserInvitationStatus =
  | "pending"
  | "delivery_failed"
  | "expired"
  | "accepted"
  | "revoked"
  | "superseded";
export type UserInvitationDeliveryStatus = "queued" | "sent" | "failed";
export type UserInvitationAction = "resend" | "revoke";

export interface ManagedUserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly active: boolean;
  readonly version: number;
}

export interface UserInvitationSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: InvitableRole;
  readonly mobile: string;
  readonly status: UserInvitationStatus;
  readonly deliveryStatus: UserInvitationDeliveryStatus;
  readonly currentLinkAvailable: boolean;
  readonly availableActions: readonly UserInvitationAction[];
  readonly expiresAt: string;
  readonly version: number;
}

export interface UserInvitationDraft {
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly mobile: string;
}

export interface CreateUserInvitationInput {
  readonly name: string;
  readonly email: string;
  readonly role: InvitableRole;
  readonly mobile: string;
}

export type InvitationField = keyof CreateUserInvitationInput;
export type InvitationFieldErrors = Partial<Record<InvitationField, string>>;

export interface UserDirectoryItem extends ManagedUserSummary {
  readonly role: Role;
  readonly avatar?: string;
  readonly title?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ManagedUserMutationResult {
  readonly user: UserDirectoryItem;
  readonly revokedGrantCount: number;
  readonly responsibilities: Readonly<Record<string, number>>;
}

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MOBILE_PATTERN = /^\+?[0-9 ()-]+$/u;

export function validateInvitationDraft(
  draft: UserInvitationDraft,
  availableRoles: readonly InvitableRole[]
): { readonly value?: CreateUserInvitationInput; readonly errors: InvitationFieldErrors } {
  const errors: InvitationFieldErrors = {};
  const name = draft.name.trim();
  const email = draft.email.trim();
  const mobile = draft.mobile.trim().replace(/ +/gu, " ");
  const digitCount = mobile.replace(/[^0-9]/gu, "").length;

  if (!name) errors.name = "Name is required.";
  else if (name.length > 120 || CONTROL_CHARACTERS.test(draft.name)) {
    errors.name = "Enter a valid name of 120 characters or fewer.";
  }

  if (!email) errors.email = "Email is required.";
  else if (
    email.length > 254 ||
    CONTROL_CHARACTERS.test(draft.email) ||
    !EMAIL_PATTERN.test(email)
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (!availableRoles.includes(draft.role as InvitableRole)) {
    errors.role = "Choose an available role.";
  }

  if (!mobile) errors.mobile = "Mobile is required.";
  else if (
    mobile.length > 30 ||
    CONTROL_CHARACTERS.test(draft.mobile) ||
    !MOBILE_PATTERN.test(mobile) ||
    digitCount < 7 ||
    digitCount > 15
  ) {
    errors.mobile = "Mobile must contain 7 to 15 ASCII digits.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    value: { name, email, role: draft.role as InvitableRole, mobile }
  };
}

function assertVersionedId(id: string, version: number): void {
  if (!id || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("The current server version is unavailable.");
  }
}

export function managedUserActiveCommand(
  user: ManagedUserSummary,
  active: boolean
): { readonly path: string; readonly body: { readonly version: number; readonly active: boolean } } {
  assertVersionedId(user.id, user.version);
  return {
    path: `/admin/users/${encodeURIComponent(user.id)}`,
    body: { version: user.version, active }
  };
}

export function invitationActionCommand(
  invitation: Pick<UserInvitationSummary, "id" | "version">,
  action: UserInvitationAction
): { readonly path: string; readonly body: { readonly version: number } } {
  assertVersionedId(invitation.id, invitation.version);
  return {
    path: `/admin/user-invitations/${encodeURIComponent(invitation.id)}/${action}`,
    body: { version: invitation.version }
  };
}

export function invitationDeliveryMessage(
  deliveryStatus: UserInvitationDeliveryStatus
): string {
  if (deliveryStatus === "sent") return "Email sent.";
  if (deliveryStatus === "queued") return "Email queued.";
  return "Email delivery failed. You can resend from the invitation list.";
}

