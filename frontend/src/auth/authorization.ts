import { z } from "zod";

import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  isFrontendPermissionCode,
  isFrontendRole,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";

const rawAuthorizationSnapshotSchema = z
  .object({
    role: z.string(),
    policyVersion: z.string(),
    permissions: z.array(z.string()).max(PERMISSION_CODES.length + 32)
  })
  .strict();

export class InvalidAuthorizationSnapshotError extends Error {
  readonly code = "INVALID_AUTHORIZATION_SNAPSHOT";

  constructor() {
    super("The authorization policy could not be established.");
    this.name = "InvalidAuthorizationSnapshotError";
  }
}

export function parseAuthorizationSnapshot(
  input: unknown,
  expectedRole: Role
): AuthorizationSnapshot | null {
  const parsed = rawAuthorizationSnapshotSchema.safeParse(input);
  if (!parsed.success) return null;
  if (
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
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze(permissions)
  });
}

export function hasFrontendPermission(
  authorization: AuthorizationSnapshot | null,
  permission: PermissionCode
): boolean {
  return (
    authorization !== null &&
    isFrontendPermissionCode(permission) &&
    authorization.permissions.includes(permission)
  );
}
