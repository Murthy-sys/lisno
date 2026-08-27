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
import { ROUTE_REGISTRY } from "../app/routeRegistry";

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

const invitationPermissions = [
  "identity.user_invitations.read",
  "identity.user_invitations.create",
  "identity.user_invitations.resend",
  "identity.user_invitations.revoke"
] as const;

const estimateClientResponsePermissions = [
  "estimation.client_response_tasks.read",
  "estimation.client_response_tasks.decide",
  "estimation.client_response_proof.read",
  "estimation.estimate_email.retry"
] as const;

const projectWorkflowPermissions = [
  "design.plan_assignment.manage",
  "design.plan_task.read",
  "design.plan_response_tasks.read",
  "design.plan_response_tasks.decide",
  "workflow.tasks.read",
  "workflow.tasks.update"
] as const;

const projectFinancePermissions = [
  "finance.bucket.read",
  "finance.entry.read",
  "finance.entry.create"
] as const;

const procurementPermissions = [
  "procurement.workspace.read",
  "procurement.expense.create",
  "procurement.document.read"
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
    expect(AUTHORIZATION_POLICY_VERSION).toBe(
      "2026-08-26.procurement-receipts.v5"
    );
  });

  it("publishes all 113 unique permissions with procurement, finance, workflow, response, and invitation permissions in canonical order", () => {
    expect(PERMISSION_CODES).toHaveLength(113);
    expect(new Set(PERMISSION_CODES)).toHaveLength(113);
    expect(PERMISSION_CODES).toContain("projects.initiate");
    expect(PERMISSION_CODES).toContain("organization.estimators.read");
    const identityMutationIndex = PERMISSION_CODES.indexOf(
      "identity.users.update"
    );
    expect(
      PERMISSION_CODES.slice(identityMutationIndex, identityMutationIndex + 6)
    ).toEqual([
      "identity.users.update",
      ...invitationPermissions,
      "access_request.create"
    ]);
    expect(PERMISSION_CODES.slice(-9)).toEqual([
      "execution.worker_assignment.override",
      ...procurementPermissions,
      ...projectFinancePermissions,
      "workflow.tasks.read",
      "workflow.tasks.update"
    ]);
    expect(
      PERMISSION_CODES.filter((permission) =>
        procurementPermissions.includes(permission as never)
      )
    ).toEqual(procurementPermissions);
    expect(
      PERMISSION_CODES.filter((permission) =>
        estimateClientResponsePermissions.includes(permission as never)
      )
    ).toEqual(estimateClientResponsePermissions);
    expect(
      PERMISSION_CODES.filter((permission) =>
        projectWorkflowPermissions.includes(permission as never)
      )
    ).toEqual(projectWorkflowPermissions);
    expect(
      PERMISSION_CODES.filter((permission) =>
        projectFinancePermissions.includes(permission as never)
      )
    ).toEqual(projectFinancePermissions);
  });

  it("keeps the protected frontend registry at exactly 27 routes", () => {
    expect(ROUTE_REGISTRY).toHaveLength(27);
    expect(ROUTE_REGISTRY.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "/designer/design-plans",
        "/admin/design-approvals",
        "/procurement/projects/:projectId",
        "/finance",
        "/finance/projects/:projectId"
      ])
    );
    expect(ROUTE_REGISTRY.map(({ path }) => path)).not.toContain(
      "/accept-invitation"
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

  it("recognizes only canonical roles and explicit requestable modules", () => {
    expect(isFrontendRole("designer")).toBe(true);
    expect(isFrontendRole("worker_roofer")).toBe(false);
    expect(REQUESTABLE_MODULES_BY_ROLE.designer).toEqual(["design"]);
    expect(roleMayRequestModule("designer", "design")).toBe(true);
    expect(roleMayRequestModule("designer", "finance")).toBe(false);
    expect(roleMayRequestModule("admin", "design")).toBe(false);
  });
});
