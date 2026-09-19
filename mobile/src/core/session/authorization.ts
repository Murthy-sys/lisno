import { z } from "zod";

import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  isFrontendRole,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../../contracts/authorization";
import type { AuthPayload, PublicUser } from "../../contracts/session";

const policyIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

const rawAuthorizationSchema = z
  .object({
    role: z.string(),
    policyVersion: policyIdentifierSchema,
    permissions: z.array(z.string()).max(PERMISSION_CODES.length + 32)
  })
  .strict();

const rawUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().min(1),
    role: z.string(),
    avatar: z.string().optional()
  })
  .strict();

const rawAuthPayloadSchema = z
  .object({
    token: z.string().min(1),
    user: rawUserSchema
  })
  .strict();

export class InvalidAuthorizationSnapshotError extends Error {
  readonly code = "INVALID_AUTHORIZATION_SNAPSHOT";

  constructor() {
    super("The authorization policy could not be established.");
    this.name = "InvalidAuthorizationSnapshotError";
  }
}

export class InvalidSessionPayloadError extends Error {
  readonly code = "INVALID_SESSION_PAYLOAD";

  constructor() {
    super("The service returned an invalid session.");
    this.name = "InvalidSessionPayloadError";
  }
}

export function parsePublicUser(input: unknown): PublicUser | null {
  const parsed = rawUserSchema.safeParse(input);
  if (!parsed.success || !isFrontendRole(parsed.data.role)) return null;
  const base = {
    id: parsed.data.id,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role
  };
  return Object.freeze(
    parsed.data.avatar === undefined ? base : { ...base, avatar: parsed.data.avatar }
  );
}

export function parseAuthPayload(input: unknown): AuthPayload | null {
  const parsed = rawAuthPayloadSchema.safeParse(input);
  if (!parsed.success) return null;
  const user = parsePublicUser(parsed.data.user);
  if (!user) return null;
  return Object.freeze({ token: parsed.data.token, user });
}

export function parseAuthorizationSnapshot(
  input: unknown,
  expectedRole: Role
): AuthorizationSnapshot | null {
  const parsed = rawAuthorizationSchema.safeParse(input);
  if (
    !parsed.success ||
    !isFrontendRole(parsed.data.role) ||
    parsed.data.role !== expectedRole ||
    parsed.data.policyVersion !== AUTHORIZATION_POLICY_VERSION
  ) {
    return null;
  }

  const permissions = PERMISSION_CODES.filter((permission) =>
    parsed.data.permissions.includes(permission)
  );
  return Object.freeze({
    role: parsed.data.role,
    policyVersion: parsed.data.policyVersion,
    permissions: Object.freeze(permissions)
  });
}

export function hasPermission(
  authorization: AuthorizationSnapshot | null,
  permission: PermissionCode
): boolean {
  return authorization?.permissions.includes(permission) ?? false;
}
