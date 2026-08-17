import { describe, expect, it } from "vitest";

import { ROLE_CODES, type Role } from "../api/authorization-contract";
import { roleHomePath, safeReturnPath } from "./routePaths";

const expectedRoleHomes: Record<Role, string> = {
  super_admin: "/admin/users",
  admin: "/admin/users",
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
      role === "client" ? "/client" : "/designer"
    );
  });

  it.each([null, undefined, ""])(
    "never throws for an absent client return path: %s",
    (candidate) => {
      expect(() => safeReturnPath("client", candidate)).not.toThrow();
      expect(safeReturnPath("client", candidate)).toBe("/client");
    }
  );
});
