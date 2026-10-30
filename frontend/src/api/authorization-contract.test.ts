import { describe, expect, it } from "vitest";

import {
  AUTHORIZATION_POLICY_VERSION,
  ACTIVE_ROLE_CODES,
  OPERATIONAL_ROLES,
  PERMISSION_CODES,
  PROJECT_MODULES,
  REQUESTABLE_MODULES_BY_ROLE,
  REQUESTABLE_PROJECT_MODULES,
  ROLE_CODES,
  ROLE_LABELS,
  WORKER_ROLES,
  isFrontendRole,
  isActiveFrontendRole,
  roleMayRequestModule
} from "./authorization-contract";
import { ROUTE_REGISTRY } from "../app/routeRegistry";

const expectedRoles = [
  "super_admin",
  "admin",
  "estimator_sales",
  "designer",
  "procurement",
  "program_manager",
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
  "client",
  "vendor"
] as const;

const estimateCollaborationPermissions = [
  "projects.client_invitation.read",
  "projects.client_invitation.manage",
  "identity.project_invitation.accept",
  "estimation.tiers.read", "estimation.tiers.select", "estimation.dimensions.update",
  "estimation.requirements.read",
  "estimation.requirements.create",
  "estimation.requirements.update",
  "estimation.requirements.resolve",
  "estimation.review.withdraw",
  "estimation.preparation.release"
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
  it("retains historical role parsing but exposes only one active Project Manager", () => {
    expect(isFrontendRole("program_manager")).toBe(true);
    expect(isActiveFrontendRole("program_manager")).toBe(false);
    expect(ACTIVE_ROLE_CODES).toEqual(ROLE_CODES.filter(role => role !== "program_manager"));
    expect(isActiveFrontendRole("site_manager")).toBe(true);
    expect(ROLE_LABELS.site_manager).toBe("Project Manager");
  });
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
      "2026-10-30.user-deletion.v1"
    );
  });

  it("publishes all 221 unique permissions in canonical order", () => {
    expect(PERMISSION_CODES).toHaveLength(221);
    expect(new Set(PERMISSION_CODES)).toHaveLength(221);
    expect(PERMISSION_CODES.slice(0, 21)).toEqual(["pm.estimates.read", "pm.vendor_suggestions.read", "pm.vendor_suggestions.manage", "pm.vendor_notices.respond", "pm.workspace.read", "pm.requests.create", "pm.requests.act", "pm.requests.receive", "pm.selections.act", "pm.supply.sign", "pm.vendors.manage", "pm.certifications.act", "pm.client.manage", "pm.snags.manage", "pm.quality.manage", "pm.performance.read", "pm.leaderboard.read", "pm.bonus.read", "pm.evidence.manage", "pm.evidence.read", "pm.notifications.read"]);
    expect(PERMISSION_CODES.filter(permission => !permission.startsWith("pm.")).slice(0, 24)).toEqual([...estimateCollaborationPermissions, "ask_lisno.request", "chat.assistant.read", "chat.assistant.request", "procurement.vendor_access.read", "procurement.vendor_access.manage", "execution.tracker.read", "execution.work.update", "execution.staff.manage", "execution.verify", "execution.policy.manage", "execution.notifications.read", "execution.access.retry"]);
    expect(PERMISSION_CODES).toContain("chat.action_types.manage");
    expect(PERMISSION_CODES).toContain("chat.project_name.manage");
    expect(PERMISSION_CODES).toContain("estimation.design_upload.delete");
    expect(PERMISSION_CODES).toContain("estimation.catalogue.read");
    expect(PERMISSION_CODES).toContain("projects.initiate");
    expect(PERMISSION_CODES).toContain("projects.procurement_identity.manage");
    expect(PERMISSION_CODES).toContain("procurement.vendor_city.manage");
    expect(PERMISSION_CODES).toContain("procurement.work_order_approval.decide");
    expect(PERMISSION_CODES).toContain("finance.vendor_invoice.manage");
    expect(PERMISSION_CODES).toContain("organization.estimators.read");
    const identityMutationIndex = PERMISSION_CODES.indexOf(
      "identity.users.update"
    );
    expect(
      PERMISSION_CODES.slice(identityMutationIndex, identityMutationIndex + 7)
    ).toEqual([
      "identity.users.update",
      "identity.users.delete",
      ...invitationPermissions,
      "access_request.create"
    ]);
    expect(PERMISSION_CODES.slice(-65)).toEqual([
      "access_request.review.read",
      "access_request.review.decide",
      "project_access_grant.revoke",
      "execution.worker_assignment.override",
      ...procurementPermissions,
      ...projectFinancePermissions,
      "finance.vendor_invoice.manage",
      "workflow.tasks.read",
      "workflow.tasks.update",
      "ai_estimator_knowledge.configuration.read",
      "ai_estimator_knowledge.configuration.create",
      "ai_estimator_knowledge.configuration.update",
      "ai_estimator_knowledge.configuration.lifecycle",
      "ai_estimator_knowledge.context.read",
      "admin.dashboard.read",
      "chat.read", "chat.send", "chat.issue", "chat.read_state", "chat.participants.manage",
      "chat.action_types.manage", "chat.project_name.manage",
      "procurement.items.read", "procurement.items.manage",
      "procurement.purchase_orders.read", "procurement.purchase_orders.manage", "procurement.purchase_orders.approve",
      "procurement.work_order_approval.read", "procurement.work_order_approval.decide", "procurement.vendor_city.manage",
      "procurement.vendor_work.read", "procurement.vendor_work.update", "procurement.vendor_work.media.read", "procurement.vendor_work.media.upload",
      "procurement.client_work.read", "procurement.client_work.decide", "procurement.progress.read", "procurement.site_completion.manage", "procurement.project_completion.decide",
      "procurement.vendors.read", "procurement.vendors.create",
      "procurement.vendor_suggestions.read",
      "procurement.vendor_suggestions.manage",
      "ai_estimator_knowledge.quality_control_options.create",
      "procurement.vendor_directory.read",
      "procurement.vendor_directory.create",
      "procurement.vendor_directory.update",
      "procurement.vendor_directory.lifecycle",
      "procurement.vendor_classification.create",
      "procurement.vendor_basket_proposal.read",
      "procurement.vendor_basket_proposal.create",
      "procurement.vendor_basket_proposal.update",
      "procurement.vendor_basket_proposal.submit",
      "procurement.vendor_allocation_baseline.correct",
      "procurement.vendor_kpi.read",
      "procurement.vendor_kpi.rate",
      "procurement.vendor_kpi.request",
      "procurement.vendor_induction.read",
      "procurement.vendor_induction.manage",
      "procurement.vendor_induction.request",
      "procurement.vendor_induction.review"
    ]);
    expect(PERMISSION_CODES.at(-1)).toBe(
      "procurement.vendor_induction.review"
    );
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

  it("keeps the protected frontend registry at exactly 49 routes", () => {
    expect(ROUTE_REGISTRY).toHaveLength(49);
    expect(ROUTE_REGISTRY.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "/execution", "/projects/:projectId/execution",
        "/project-messages", "/projects/:projectId/messages",
        "/designer/design-plans",
        "/admin/dashboard",
        "/admin/design-approvals",
        "/admin/configuration/estimation",
        "/admin/configuration/estimation/items/:itemId",
        "/admin/configuration/estimation/reusable-values",
        "/admin/procurement/vendors",
        "/admin/procurement/vendors/:vendorId",
        "/procurement/requests",
        "/procurement/vendors",
        "/procurement/vendors/:vendorId",
        "/procurement/projects/:projectId",
        "/vendor", "/admin/purchase-orders", "/admin/project-completion",
        "/finance",
        "/finance/projects/:projectId"
      ])
    );
    expect(ROUTE_REGISTRY.map(({ path }) => path)).not.toContain(
      "/accept-invitation"
    );
    expect(ROUTE_REGISTRY.map(({ path }) => path)).not.toContain(
      "/accept-project-invitation"
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
      admin: "Sales Manager",
      estimator_sales: "Sales",
      designer: "Designer",
      procurement: "Procurement",
      program_manager: "Program Manager",
      finance_head: "Finance Manager",
      site_manager: "Project Manager",
      worker_electrician: "Electrician",
      worker_plumber: "Plumber",
      worker_carpenter: "Carpenter",
      worker_painter: "Painter",
      worker_civil: "Civil Worker",
      worker_other: "Other Worker",
      design_manager: "Design Manager",
      design_head: "Design Head",
      client: "Client",
      vendor: "Vendor"
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
