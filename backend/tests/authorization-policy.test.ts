import { describe, expect, it } from "vitest";

import {
  PERMISSION_CODES,
  PROJECT_MODULES,
  REQUESTABLE_MODULES_BY_ROLE,
  ROLE_PERMISSIONS,
  hasPermission,
  roleMayRequestModule
} from "../src/domain/authorization.js";
import {
  AUDIT_ACTIONS,
  EXISTING_AUDIT_ACTIONS,
  PROMPT_1_AUDIT_ACTIONS
} from "../src/domain/audit-actions.js";
import { ROLE_CODES, WORKER_ROLES, type Role } from "../src/domain/roles.js";
import { EXPECTED_HUMAN_JWT_OPERATIONS } from "./fixtures/prompt-1-route-operations.js";

const COMMON_ROWS = [1, 85] as const;
const ADDITIONAL_ROWS = {
  admin: [2, 5, 86, 87, 91, 92, 93],
  estimator_sales: [2, 5, ...range(40, 45), ...range(49, 53), ...range(61, 76), 81],
  designer: [2, ...range(4, 10), 12, ...range(16, 18), 20, 22, 23, ...range(25, 27), ...range(29, 35), 38, 39, ...range(61, 65), 77, 80, 88, 89, 90],
  design_manager: [2, 5, 9, 11, 13, ...range(16, 23), ...range(26, 29), 38, 39, ...range(61, 65), ...range(77, 79)],
  design_head: [2, 5, 9, 11, ...range(14, 23), ...range(26, 29), 38, 39, ...range(61, 65)],
  client: [2, 3, 5, 24, ...range(26, 27), 29, ...range(36, 39), ...range(45, 48), ...range(54, 60), ...range(82, 84)],
  procurement: [88, 89, 90],
  finance_head: [88, 89, 90],
  site_manager: [88, 89, 90],
  worker_electrician: [],
  worker_plumber: [],
  worker_carpenter: [],
  worker_painter: [],
  worker_civil: [],
  worker_other: []
} as const satisfies Record<Exclude<Role, "super_admin">, readonly number[]>;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function permissionsForRows(rows: readonly number[]): string[] {
  const selectedRows = new Set(rows);
  return [...new Set(
    EXPECTED_HUMAN_JWT_OPERATIONS
      .filter((_operation, index) => selectedRows.has(index + 1))
      .map(({ permission }) => permission)
  )];
}

describe("authorization policy", () => {
  it("contains exactly the six project module codes", () => {
    expect(PROJECT_MODULES).toEqual([
      "projects", "design", "estimation", "procurement", "finance", "execution"
    ]);
  });

  it("allows only the four approved requestable pairs", () => {
    expect(Object.entries(REQUESTABLE_MODULES_BY_ROLE).filter(([, modules]) => modules.length > 0)).toEqual([
      ["designer", ["design"]],
      ["procurement", ["procurement"]],
      ["finance_head", ["finance"]],
      ["site_manager", ["execution"]]
    ]);
    expect(roleMayRequestModule("designer", "design")).toBe(true);
    expect(roleMayRequestModule("designer", "finance")).toBe(false);
    expect(roleMayRequestModule("root", "design")).toBe(false);
  });

  it("defaults unknown roles and permissions to deny", () => {
    expect(hasPermission("root", "projects.read")).toBe(false);
    expect(hasPermission("designer", "projects.destroy")).toBe(false);
  });

  it.each([
    ["worker_electrician", "finance.expense.read"],
    ["worker_plumber", "procurement.purchase_order.read"],
    ["worker_carpenter", "execution.task.self.update"],
    ["designer", "finance.expense.read"],
    ["procurement", "design.version.approve"],
    ["finance_head", "execution.task.update"],
    ["site_manager", "design.version.approve"],
    ["estimator_sales", "design.version.approve"]
  ] as const)("denies %s the unregistered or foreign action %s", (role, action) => {
    expect(hasPermission(role, action)).toBe(false);
  });

  it("matches the exact role-to-operation allowlist", () => {
    for (const role of ROLE_CODES) {
      if (role === "super_admin") continue;
      expect(ROLE_PERMISSIONS[role], role).toEqual(
        permissionsForRows([...COMMON_ROWS, ...ADDITIONAL_ROWS[role]])
      );
    }
    const expectedSuperAdminPermissions = [
      ...permissionsForRows(range(1, 93)),
      "execution.worker_assignment.override"
    ];
    expect(PERMISSION_CODES).toEqual(expectedSuperAdminPermissions);
    expect(PERMISSION_CODES).toHaveLength(91);
    expect(ROLE_PERMISSIONS.super_admin).toEqual(expectedSuperAdminPermissions);
  });

  it("gives all worker trades identical identity-only permissions", () => {
    for (const role of WORKER_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toEqual([
        "identity.self.read", "identity.authorization.read"
      ]);
    }
  });

  it("keeps the reserved worker-assignment override route-less and Super Admin-only", () => {
    expect(PERMISSION_CODES).toContain("execution.worker_assignment.override");
    expect(ROLE_PERMISSIONS.super_admin).toContain("execution.worker_assignment.override");
    for (const role of ROLE_CODES.filter((candidate) => candidate !== "super_admin")) {
      expect(ROLE_PERMISSIONS[role]).not.toContain("execution.worker_assignment.override");
    }
    expect(EXPECTED_HUMAN_JWT_OPERATIONS.map(({ permission }) => permission)).not.toContain(
      "execution.worker_assignment.override"
    );
  });

  it("registers all nine Prompt 1 audit actions", () => {
    expect(PROMPT_1_AUDIT_ACTIONS).toEqual([
      "user.role_changed", "user.activated", "user.deactivated",
      "access_request.created", "access_request.cancelled", "access_request.approved",
      "access_request.rejected", "project_access.granted", "project_access.revoked"
    ]);
  });

  it("registers estimate assignment as a typed existing-domain audit action", () => {
    expect(EXISTING_AUDIT_ACTIONS).toContain("estimate_designer_assigned");
    expect(AUDIT_ACTIONS).toContain("estimate_designer_assigned");
    expect(PROMPT_1_AUDIT_ACTIONS).toHaveLength(9);
  });
});
