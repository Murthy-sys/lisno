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
});
