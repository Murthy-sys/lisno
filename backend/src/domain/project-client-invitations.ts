export interface ProjectClientInvitationRecord {
  id: string;
  projectId: string;
  emailNormalized: string;
  invitedById: string;
  tokenIssuedById: string;
  tokenIssuerVersion: number;
  tokenHash: string | null;
  tokenGeneration: number;
  issuedAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked";
  acceptedUserId: string | null;
  acceptedAt: string | null;
  revokedById: string | null;
  revokedAt: string | null;
  deliveryStatus: "queued" | "sent" | "failed";
  deliveryFailureCode: string | null;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectInitiationReceipt {
  id: string;
  actorId: string;
  fingerprint: string;
  projectId: string;
}
export interface ProjectClientInvitationSummary {
  projectId: string;
  status: "not_issued" | "pending" | "delivery_failed" | "expired" | "revoked" | "accepted";
  deliveryAvailable: boolean;
  expectedVersion: number;
  expiresAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  availableActions: Array<"send" | "resend" | "revoke">;
}
