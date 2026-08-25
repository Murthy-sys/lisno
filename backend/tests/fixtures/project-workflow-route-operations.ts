import {
  EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS
} from "./estimate-client-response-route-operations.js";

export const EXPECTED_PROJECT_WORKFLOW_HUMAN_JWT_OPERATIONS = [
  ...EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS,
  { key: "GET /admin/designers", permission: "design.plan_assignment.manage", scope: { kind: "non_project", namespace: "organization" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_workflow" },
  { key: "POST /admin/projects/:projectId/design-assignment", permission: "design.plan_assignment.manage", scope: { kind: "project", module: "projects" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "project_workflow" },
  { key: "GET /designer/design-plan-tasks", permission: "design.plan_task.read", scope: { kind: "non_project", namespace: "estimation_ownership" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_workflow" },
  { key: "GET /admin/design-plan-response-tasks", permission: "design.plan_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "project_workflow" },
  { key: "POST /admin/design-plan-response-tasks/:roundId/decision", permission: "design.plan_response_tasks.decide", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "project_workflow" },
  { key: "GET /workflow-tasks", permission: "workflow.tasks.read", scope: { kind: "non_project", namespace: "project_workflow" }, operationClass: "personal", superAdminBehavior: "deny_personal", availability: "project_workflow" }
] as const;
