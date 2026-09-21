import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  type PermissionCode,
  type Role
} from "../../contracts/authorization";
import { PROTECTED_OPERATIONS } from "../../contracts/operations";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation, operationCapability } from "./operationCapabilities";

function session(
  role: Role,
  permissions: readonly PermissionCode[] = PERMISSION_CODES
): AuthenticatedSession {
  return {
    user: { id: `user-${role}`, name: role, email: `${role}@example.com`, role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
  };
}

describe("operation capabilities", () => {
  it("denies every deny_personal action to Super Admin even with every permission", () => {
    const superAdmin = session("super_admin");
    const personalOperations = PROTECTED_OPERATIONS.filter(
      (policy) => policy.superAdminBehavior === "deny_personal"
    );
    expect(personalOperations.length).toBeGreaterThan(0);
    expect(
      personalOperations.every((policy) =>
        canPerformOperation(superAdmin, policy.operation) === false
      )
    ).toBe(true);
  });

  it("allows reviewed read, self and administrative Super Admin operations", () => {
    const superAdmin = session("super_admin");
    expect(canPerformOperation(superAdmin, "GET /projects")).toBe(true);
    expect(canPerformOperation(superAdmin, "GET /notifications")).toBe(true);
    expect(canPerformOperation(superAdmin, "POST /admin/projects")).toBe(true);
  });

  it("allows a non-Super-Admin personal operation only with its permission", () => {
    expect(canPerformOperation(
      session("designer", ["design.task.self.update"]),
      "PATCH /tasks/:taskId"
    )).toBe(true);
    expect(operationCapability(
      session("designer", []),
      "PATCH /tasks/:taskId"
    ).reason).toBe("missing_permission");
  });

  it("fails closed when the user and authorization roles disagree", () => {
    const invalid = session("designer");
    expect(operationCapability({
      ...invalid,
      authorization: { ...invalid.authorization, role: "super_admin" }
    }, "GET /projects").reason).toBe("invalid_session");
  });

  it("fails closed for an obsolete authorization policy snapshot", () => {
    const stale = session("designer");
    expect(operationCapability({
      ...stale,
      authorization: { ...stale.authorization, policyVersion: "obsolete-policy" }
    }, "GET /projects").reason).toBe("invalid_session");
  });
});
