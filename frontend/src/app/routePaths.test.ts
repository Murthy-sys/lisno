import { describe, expect, it } from "vitest";

import { ROLE_CODES, type Role } from "../api/authorization-contract";
import { roleHomePath, safeReturnPath } from "./routePaths";

const expectedRoleHomes: Record<Role, string> = {
  super_admin: "/admin/users",
  admin: "/admin/projects",
  estimator_sales: "/estimator-sales",
  designer: "/designer",
  procurement: "/home",
  finance_head: "/home",
  site_manager: "/home",
  worker_electrician: "/home",
  worker_plumber: "/home",
  worker_carpenter: "/home",
  worker_painter: "/home",
  worker_civil: "/home",
  worker_other: "/home",
  design_manager: "/manager",
  design_head: "/head",
  client: "/client"
};

describe("roleHomePath", () => {
  it.each(ROLE_CODES)("maps %s to a defined safe staged home", (role) => {
    expect(roleHomePath(role)).toBe(expectedRoleHomes[role]);
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["admin", "/admin/projects/project-1", "/admin/projects/project-1"],
    ["super_admin", "/admin/projects", "/admin/projects"],
    [
      "super_admin",
      "/admin/configuration/estimation/items/item-1?section=pricing#rates",
      "/admin/configuration/estimation/items/item-1?section=pricing#rates"
    ],
    [
      "super_admin",
      "/admin/projects/project-1?tab=estimate#summary",
      "/admin/projects/project-1?tab=estimate#summary"
    ],
    ["client", "/client", "/client"],
    ["client", "/client/projects/project-1", "/client/projects/project-1"],
    [
      "designer",
      "/designer/projects/project-1?tab=tasks#task-2",
      "/designer/projects/project-1?tab=tasks#task-2"
    ]
  ] as const)("keeps a %s return inside its role routes", (role, candidate, expected) => {
    expect(safeReturnPath(role, candidate)).toBe(expected);
  });

  it.each([
    ["admin", "/admin/users"],
    ["client", "/manager"],
    ["designer", "/manager/designers/designer-1"],
    ["designer", "https://evil.example/designer"],
    ["designer", "//evil.example/designer"],
    ["designer", "\\\\evil.example\\designer"],
    ["client", "/client\\projects\\project-1"],
    ["client", "/client/%2e%2e/manager"],
    ["client", "/client/%2e%2e%2fmanager"],
    ["client", "/client/%252e%252e/manager"],
    ["client", "/client/%ZZ"],
    ["client", "/client?next=%ZZ"],
    ["client", "/client#%ZZ"],
    ["client", "/client?next=%E0%A4"],
    ["client", "?from=/client/projects/project-1"],
    ["client", "#/client/projects/project-1"]
  ] as const)("falls back from an unsafe %s candidate %s", (role, candidate) => {
    expect(safeReturnPath(role, candidate)).toBe(
      role === "client" ? "/client" : role === "admin" ? "/admin/projects" : "/designer"
    );
  });

  it.each([null, undefined, ""])(
    "never throws for an absent client return path: %s",
    (candidate) => {
      expect(() => safeReturnPath("client", candidate)).not.toThrow();
      expect(safeReturnPath("client", candidate)).toBe("/client");
    }
  );

  it.each([
    ["admin", "/admin/client-responses"],
    ["admin", "/admin/client-responses/round-1?from=project#decision"],
    ["super_admin", "/admin/client-responses"],
    ["super_admin", "/admin/client-responses/round%20one"]
  ] as const)(
    "allows an authenticated %s to return to the exact Client response boundary",
    (role, candidate) => {
      expect(safeReturnPath(role, candidate)).toBe(candidate);
    }
  );

  it.each(ROLE_CODES.filter((role) => role !== "admin" && role !== "super_admin"))(
    "rejects the Client response return boundary for %s",
    (role) => {
      expect(safeReturnPath(role, "/admin/client-responses/round-1")).toBe(
        roleHomePath(role)
      );
    }
  );

  it.each([
    ["admin", "/admin/client-responses-archive"],
    ["admin", "/admin/client-responses/%2e%2e/projects/project-1"],
    ["admin", "/admin/client-responses/%252e%252e/projects/project-1"],
    ["super_admin", "/admin/client-responses/%2e%2e/users"],
    ["super_admin", "//evil.example/admin/client-responses"],
    ["super_admin", "/admin/client-responses\\round-1"]
  ] as const)("rejects boundary confusion or traversal for %s: %s", (role, candidate) => {
    expect(safeReturnPath(role, candidate)).toBe(roleHomePath(role));
  });

  it.each([
    "/admin/projects-archive",
    "/admin/projects/%2e%2e/users",
    "/admin/projects/%252e%252e/users",
    "//evil.example/admin/projects",
    "/admin/projects\\project-1"
  ])("rejects a confused or traversing Super Admin project boundary: %s", (candidate) => {
    expect(safeReturnPath("super_admin", candidate)).toBe("/admin/users");
  });

  it.each([
    "/admin/configuration/estimations",
    "/admin/configuration/estimation-archive",
    "/admin/configuration/estimation/%2e%2e/users",
    "/admin/configuration/estimation/%252e%252e/users",
    "//evil.example/admin/configuration/estimation",
    "/admin/configuration/estimation\\items\\item-1"
  ])("rejects a confused or traversing knowledge configuration boundary: %s", (candidate) => {
    expect(safeReturnPath("super_admin", candidate)).toBe("/admin/users");
  });

  it.each(ROLE_CODES.filter((role) => role !== "super_admin"))(
    "rejects the knowledge configuration return boundary for %s",
    (role) => {
      expect(
        safeReturnPath(role, "/admin/configuration/estimation/items/item-1")
      ).toBe(roleHomePath(role));
    }
  );
});
