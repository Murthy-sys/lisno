import {
  EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS
} from "./project-workflow-route-operations.js";

export const EXPECTED_PROJECT_FINANCE_HUMAN_JWT_OPERATIONS = [
  ...EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS,
  { key: "GET /finance/projects", permission: "finance.bucket.read", scope: { kind: "non_project", namespace: "project_finance" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_finance" },
  { key: "GET /finance/projects/:projectId", permission: "finance.bucket.read", scope: { kind: "project", module: "finance" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_finance" },
  { key: "GET /finance/projects/:projectId/entries", permission: "finance.entry.read", scope: { kind: "project", module: "finance" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_finance" },
  { key: "GET /finance/projects/:projectId/entries/:entryId/document", permission: "finance.entry.read", scope: { kind: "project", module: "finance" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_finance" },
  { key: "POST /finance/projects/:projectId/entries", permission: "finance.entry.create", scope: { kind: "project", module: "finance" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "project_finance" }
] as const;
