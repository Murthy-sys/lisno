import type { AuthorizationSnapshot, Role } from "./authorization";

export interface PublicUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly avatar?: string;
  readonly profilePhotoVersion?: number;
}

export interface AuthPayload {
  readonly token: string;
  readonly user: PublicUser;
}

export interface AuthenticatedSession {
  readonly user: PublicUser;
  readonly authorization: AuthorizationSnapshot;
}

export type SessionStatus =
  | "booting"
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "transient_error"
  | "signing_out";
