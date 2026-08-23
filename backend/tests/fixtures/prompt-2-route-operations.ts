import type { ExpectedHumanJwtOperation } from "./prompt-1-route-operations.js";

export const EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS = [
  { key: "GET /admin/projects", permission: "projects.list", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "GET /admin/projects/:projectId", permission: "projects.read", scope: { kind: "project", module: "projects" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" },
  { key: "POST /admin/projects", permission: "projects.initiate", scope: { kind: "project", module: "projects" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "prompt_2" },
  { key: "GET /admin/estimators", permission: "organization.estimators.read", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "prompt_2" }
] as const satisfies readonly ExpectedHumanJwtOperation[];
