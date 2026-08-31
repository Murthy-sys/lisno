import { describe, expect, it } from "vitest";

import {
  PERMISSION_CODES,
  PROJECT_MODULES,
  REQUESTABLE_MODULES_BY_ROLE,
  REQUESTABLE_PROJECT_MODULES
} from "../src/domain/authorization.js";
import {
  OPERATIONAL_ROLES,
  ROLE_CODES,
  ROLE_LABELS,
  WORKER_ROLES
} from "../src/domain/roles.js";
import { AUTHORIZATION_POLICY_VERSION } from "../src/services/auth.service.js";
import {
  AUTHORIZATION_POLICY_VERSION as FRONTEND_POLICY_VERSION,
  OPERATIONAL_ROLES as FRONTEND_OPERATIONAL_ROLES,
  PERMISSION_CODES as FRONTEND_PERMISSION_CODES,
  PROJECT_MODULES as FRONTEND_PROJECT_MODULES,
  REQUESTABLE_MODULES_BY_ROLE as FRONTEND_REQUESTABLE_BY_ROLE,
  REQUESTABLE_PROJECT_MODULES as FRONTEND_REQUESTABLE_MODULES,
  ROLE_CODES as FRONTEND_ROLE_CODES,
  ROLE_LABELS as FRONTEND_ROLE_LABELS,
  WORKER_ROLES as FRONTEND_WORKER_ROLES
} from "../../frontend/src/api/authorization-contract.ts";

const STAFF_INVITATION_PERMISSIONS = [
  "identity.user_invitations.read",
  "identity.user_invitations.create",
  "identity.user_invitations.resend",
  "identity.user_invitations.revoke"
] as const;

const ESTIMATE_CLIENT_RESPONSE_PERMISSIONS = [
  "estimation.client_response_tasks.read",
  "estimation.client_response_tasks.decide",
  "estimation.client_response_proof.read",
  "estimation.estimate_email.retry"
] as const;

const PROJECT_WORKFLOW_PERMISSIONS = [
  "design.plan_assignment.manage",
  "design.plan_task.read",
  "design.plan_response_tasks.read",
  "design.plan_response_tasks.decide",
  "workflow.tasks.read",
  "workflow.tasks.update"
] as const;

const PROJECT_FINANCE_PERMISSIONS = [
  "finance.bucket.read",
  "finance.entry.read",
  "finance.entry.create"
] as const;

const PROCUREMENT_PERMISSIONS = [
  "procurement.workspace.read",
  "procurement.expense.create",
  "procurement.document.read"
] as const;

const AI_ESTIMATOR_KNOWLEDGE_PERMISSIONS = [
  "ai_estimator_knowledge.configuration.read",
  "ai_estimator_knowledge.configuration.create",
  "ai_estimator_knowledge.configuration.update",
  "ai_estimator_knowledge.configuration.lifecycle",
  "ai_estimator_knowledge.context.read"
] as const;

describe("frontend authorization contract parity", () => {
  it("matches the backend role vocabulary and labels", () => {
    expect(FRONTEND_ROLE_CODES).toEqual(ROLE_CODES);
    expect(FRONTEND_ROLE_LABELS).toEqual(ROLE_LABELS);
    expect(FRONTEND_WORKER_ROLES).toEqual(WORKER_ROLES);
    expect(FRONTEND_OPERATIONAL_ROLES).toEqual(OPERATIONAL_ROLES);
  });

  it("matches backend permissions, modules, requestability, and policy version", () => {
    expect(FRONTEND_PERMISSION_CODES).toEqual(PERMISSION_CODES);
    expect(FRONTEND_PROJECT_MODULES).toEqual(PROJECT_MODULES);
    expect(FRONTEND_REQUESTABLE_MODULES).toEqual(REQUESTABLE_PROJECT_MODULES);
    expect(FRONTEND_REQUESTABLE_BY_ROLE).toEqual(REQUESTABLE_MODULES_BY_ROLE);
    expect(FRONTEND_POLICY_VERSION).toBe(AUTHORIZATION_POLICY_VERSION);
  });

  it("publishes the exact 119-code Super Admin dashboard policy on both sides", () => {
    expect(AUTHORIZATION_POLICY_VERSION).toBe("2026-08-30.super-admin-dashboard.v1");
    expect(FRONTEND_POLICY_VERSION).toBe("2026-08-30.super-admin-dashboard.v1");
    expect(PERMISSION_CODES).toHaveLength(119);
    expect(FRONTEND_PERMISSION_CODES).toHaveLength(119);
    expect(new Set(PERMISSION_CODES).size).toBe(119);
    expect(new Set(FRONTEND_PERMISSION_CODES).size).toBe(119);
    expect(PERMISSION_CODES.at(-1)).toBe("admin.dashboard.read");
    expect(FRONTEND_PERMISSION_CODES.at(-1)).toBe("admin.dashboard.read");
    for (const permission of STAFF_INVITATION_PERMISSIONS) {
      expect(PERMISSION_CODES).toContain(permission);
      expect(FRONTEND_PERMISSION_CODES).toContain(permission);
    }
    expect(
      PERMISSION_CODES.filter((permission) =>
        ESTIMATE_CLIENT_RESPONSE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(ESTIMATE_CLIENT_RESPONSE_PERMISSIONS);
    expect(
      FRONTEND_PERMISSION_CODES.filter((permission) =>
        ESTIMATE_CLIENT_RESPONSE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(ESTIMATE_CLIENT_RESPONSE_PERMISSIONS);
    expect(
      PERMISSION_CODES.filter((permission) =>
        PROJECT_WORKFLOW_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROJECT_WORKFLOW_PERMISSIONS);
    expect(
      FRONTEND_PERMISSION_CODES.filter((permission) =>
        PROJECT_WORKFLOW_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROJECT_WORKFLOW_PERMISSIONS);
    expect(
      PERMISSION_CODES.filter((permission) =>
        PROCUREMENT_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROCUREMENT_PERMISSIONS);
    expect(
      FRONTEND_PERMISSION_CODES.filter((permission) =>
        PROCUREMENT_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROCUREMENT_PERMISSIONS);
    expect(
      PERMISSION_CODES.filter((permission) =>
        PROJECT_FINANCE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROJECT_FINANCE_PERMISSIONS);
    expect(
      FRONTEND_PERMISSION_CODES.filter((permission) =>
        PROJECT_FINANCE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(PROJECT_FINANCE_PERMISSIONS);
    expect(
      PERMISSION_CODES.filter((permission) =>
        AI_ESTIMATOR_KNOWLEDGE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(AI_ESTIMATOR_KNOWLEDGE_PERMISSIONS);
    expect(
      FRONTEND_PERMISSION_CODES.filter((permission) =>
        AI_ESTIMATOR_KNOWLEDGE_PERMISSIONS.includes(permission as never)
      )
    ).toEqual(AI_ESTIMATOR_KNOWLEDGE_PERMISSIONS);
  });
});
