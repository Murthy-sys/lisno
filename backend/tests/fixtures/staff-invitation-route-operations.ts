import type { ExpectedHumanJwtOperation } from "./prompt-1-route-operations.js";
import { EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS } from "./prompt-2-route-operations.js";

export type ExpectedStaffInvitationHumanJwtOperation = Omit<
  ExpectedHumanJwtOperation,
  "availability"
> & {
  availability:
    | ExpectedHumanJwtOperation["availability"]
    | "identity_provisioning";
};

export const EXPECTED_STAFF_INVITATION_HUMAN_JWT_OPERATIONS = [
  ...EXPECTED_PROMPT_2_HUMAN_JWT_OPERATIONS,
  { key: "GET /admin/user-invitations", permission: "identity.user_invitations.read", scope: { kind: "non_project", namespace: "identity" }, operationClass: "read", superAdminBehavior: "global_read", availability: "identity_provisioning" },
  { key: "POST /admin/user-invitations", permission: "identity.user_invitations.create", scope: { kind: "non_project", namespace: "identity" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "identity_provisioning" },
  { key: "POST /admin/user-invitations/:invitationId/resend", permission: "identity.user_invitations.resend", scope: { kind: "non_project", namespace: "identity" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "identity_provisioning" },
  { key: "POST /admin/user-invitations/:invitationId/revoke", permission: "identity.user_invitations.revoke", scope: { kind: "non_project", namespace: "identity" }, operationClass: "admin", superAdminBehavior: "admin_override", availability: "identity_provisioning" }
] as const satisfies readonly ExpectedStaffInvitationHumanJwtOperation[];
