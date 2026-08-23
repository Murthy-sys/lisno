import { describe, expect, it } from "vitest";

import {
  AUTHORIZATION_POLICY_VERSION,
  OPERATIONAL_ROLES,
  PERMISSION_CODES,
  PROJECT_MODULES,
  REQUESTABLE_MODULES_BY_ROLE,
  REQUESTABLE_PROJECT_MODULES,
  ROLE_CODES,
  ROLE_LABELS,
  WORKER_ROLES,
  isFrontendRole,
  roleMayRequestModule
} from "./authorization-contract";

const expectedRoles = [
  "super_admin",
  "admin",
  "estimator_sales",
  "designer",
  "procurement",
  "finance_head",
  "site_manager",
  "worker_electrician",
  "worker_plumber",
  "worker_carpenter",
  "worker_painter",
  "worker_civil",
  "worker_other",
  "design_manager",
  "design_head",
  "client"
] as const;

describe("frontend authorization contract", () => {
  it("publishes the exact Prompt 2 role and module vocabulary", () => {
    expect(ROLE_CODES).toEqual(expectedRoles);
    expect(PROJECT_MODULES).toEqual([
      "projects",
      "design",
      "estimation",
      "procurement",
      "finance",
      "execution"
    ]);
    expect(REQUESTABLE_PROJECT_MODULES).toEqual([
      "design",
      "procurement",
      "finance",
      "execution"
    ]);
    expect(AUTHORIZATION_POLICY_VERSION).toBe("2026-08-23.prompt-2");
  });

  it("publishes all 93 unique permissions including Admin project initiation", () => {
    expect(PERMISSION_CODES).toHaveLength(93);
    expect(new Set(PERMISSION_CODES)).toHaveLength(93);
    expect(PERMISSION_CODES).toContain("projects.initiate");
    expect(PERMISSION_CODES).toContain("organization.estimators.read");
    expect(PERMISSION_CODES.at(-1)).toBe(
      "execution.worker_assignment.override"
    );
  });

  it("keeps worker and operational role families explicit", () => {
    expect(WORKER_ROLES).toEqual([
      "worker_electrician",
      "worker_plumber",
      "worker_carpenter",
      "worker_painter",
      "worker_civil",
      "worker_other"
    ]);
    expect(OPERATIONAL_ROLES).toEqual([
      "estimator_sales",
      "designer",
      "procurement",
      "finance_head",
      "site_manager",
      "worker_electrician",
      "worker_plumber",
      "worker_carpenter",
      "worker_painter",
      "worker_civil",
      "worker_other"
    ]);
  });

  it("provides an exhaustive display label for every role", () => {
    expect(Object.keys(ROLE_LABELS)).toEqual(expectedRoles);
    expect(ROLE_LABELS).toEqual({
      super_admin: "Super Admin",
      admin: "Admin",
      estimator_sales: "Estimator/Sales",
      designer: "Designer",
      procurement: "Procurement",
      finance_head: "Finance Head",
      site_manager: "Site Manager",
      worker_electrician: "Electrician",
      worker_plumber: "Plumber",
      worker_carpenter: "Carpenter",
      worker_painter: "Painter",
      worker_civil: "Civil Worker",
      worker_other: "Other Worker",
      design_manager: "Design Manager",
      design_head: "Design Head",
      client: "Client"
    });
  });

  it("recognizes only canonical roles and explicit requestable modules", () => {
    expect(isFrontendRole("designer")).toBe(true);
    expect(isFrontendRole("worker_roofer")).toBe(false);
    expect(REQUESTABLE_MODULES_BY_ROLE.designer).toEqual(["design"]);
    expect(roleMayRequestModule("designer", "design")).toBe(true);
    expect(roleMayRequestModule("designer", "finance")).toBe(false);
    expect(roleMayRequestModule("admin", "design")).toBe(false);
  });
});
