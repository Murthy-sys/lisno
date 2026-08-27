import type {
  ExpectedStaffInvitationHumanJwtOperation
} from "./staff-invitation-route-operations.js";
import {
  EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS
} from "./staff-invitation-route-operations.js";

export type ExpectedEstimateClientResponseHumanJwtOperation = Omit<
  ExpectedStaffInvitationHumanJwtOperation,
  "scope" | "availability"
> & {
  scope:
    | ExpectedStaffInvitationHumanJwtOperation["scope"]
    | { kind: "non_project"; namespace: "estimate_client_response" };
  availability:
    | ExpectedStaffInvitationHumanJwtOperation["availability"]
    | "estimate_client_response";
};

export const EXPECTED_ESTIMATE_CLIENT_RESPONSE_HUMAN_JWT_OPERATIONS = [
  ...EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS,
  { key: "GET /admin/estimate-client-response-tasks", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
  { key: "GET /admin/estimate-client-response-tasks/:roundId", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
  { key: "GET /admin/estimate-client-response-tasks/:roundId/pdf", permission: "estimation.client_response_tasks.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
  { key: "GET /admin/estimate-client-response-tasks/:roundId/proof", permission: "estimation.client_response_proof.read", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "read", superAdminBehavior: "global_read", availability: "estimate_client_response" },
  { key: "POST /admin/estimate-client-response-tasks/:roundId/decision", permission: "estimation.client_response_tasks.decide", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "estimate_client_response" },
  { key: "POST /estimates/:estimateId/client-email/retry", permission: "estimation.estimate_email.retry", scope: { kind: "non_project", namespace: "estimate_client_response" }, operationClass: "personal", superAdminBehavior: "admin_override", availability: "estimate_client_response" }
] as const satisfies readonly ExpectedEstimateClientResponseHumanJwtOperation[];
