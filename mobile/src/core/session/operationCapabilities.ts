import type { AuthenticatedSession } from "../../contracts/session";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import {
  PROTECTED_OPERATIONS,
  type ProtectedOperation
} from "../../contracts/operations";

export type ProtectedOperationKey = ProtectedOperation["operation"];

export interface OperationCapability {
  readonly allowed: boolean;
  readonly policy: ProtectedOperation | null;
  readonly reason:
    | "allowed"
    | "unknown_operation"
    | "invalid_session"
    | "missing_permission"
    | "super_admin_personal_denied";
}

const OPERATION_POLICIES = new Map<ProtectedOperationKey, ProtectedOperation>(
  PROTECTED_OPERATIONS.map((policy) => [policy.operation, policy])
);

export function operationCapability(
  session: AuthenticatedSession,
  operation: ProtectedOperationKey
): OperationCapability {
  const policy = OPERATION_POLICIES.get(operation) ?? null;
  if (!policy) return { allowed: false, policy: null, reason: "unknown_operation" };
  if (
    session.authorization.role !== session.user.role ||
    session.authorization.policyVersion !== AUTHORIZATION_POLICY_VERSION
  ) {
    return { allowed: false, policy, reason: "invalid_session" };
  }
  if (!session.authorization.permissions.includes(policy.permission)) {
    return { allowed: false, policy, reason: "missing_permission" };
  }
  if (
    session.user.role === "super_admin" &&
    policy.superAdminBehavior === "deny_personal"
  ) {
    return { allowed: false, policy, reason: "super_admin_personal_denied" };
  }
  return { allowed: true, policy, reason: "allowed" };
}

export function canPerformOperation(
  session: AuthenticatedSession,
  operation: ProtectedOperationKey
): boolean {
  return operationCapability(session, operation).allowed;
}
