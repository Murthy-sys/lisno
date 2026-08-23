import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  ROLE_LABELS,
  WORKER_ROLES,
  isRole,
  roleFamilyFor
} from "../src/domain/roles.js";

describe("canonical role catalog", () => {
  it("exposes the exact sixteen canonical role codes", () => {
    expect(ROLE_CODES).toEqual([
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
    ]);
  });

  it("provides an exhaustive product-friendly label for every role", () => {
    expect(ROLE_LABELS).toEqual({
      super_admin: "Super Admin",
      admin: "Admin",
      estimator_sales: "Estimator/Sales",
      designer: "Designer",
      procurement: "Procurement",
      finance_head: "Finance Manager",
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

  it.each(WORKER_ROLES)("maps %s to the Worker family", (role) => {
    expect(roleFamilyFor(role)).toBe("worker");
  });

  it("does not infer Worker membership from a string prefix", () => {
    expect(isRole("worker_roofer")).toBe(false);
  });

  it("keeps the Admin operational boundary exact", () => {
    expect(OPERATIONAL_ROLES).toEqual([
      "estimator_sales",
      "designer",
      "procurement",
      "finance_head",
      "site_manager",
      ...WORKER_ROLES
    ]);
  });
});
