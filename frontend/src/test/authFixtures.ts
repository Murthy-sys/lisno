import {
  AUTHORIZATION_POLICY_VERSION,
  type AuthorizationSnapshot,
  type PermissionCode,
  type Role
} from "../api/authorization-contract";

const BASE_SESSION_PERMISSIONS = [
  "identity.self.read",
  "identity.authorization.read"
] as const satisfies readonly PermissionCode[];

export function authorizationFor(
  role: Role,
  permissions: readonly PermissionCode[] = BASE_SESSION_PERMISSIONS
): AuthorizationSnapshot {
  return Object.freeze({
    role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze([...permissions])
  });
}
