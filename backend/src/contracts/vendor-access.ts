/** Public, token-free vendor login and delivery contract. */
export type VendorAccessAction = "send_invitation" | "resend_invitation" | "send_work_notification";
export interface VendorDeliveryReadiness {
  state: "ready" | "paused" | "unavailable";
  reasonCode: string | null;
  lastProcessedAt: string | null;
}
export interface VendorAccessInvitation {
  id: string;
  version: number;
  status: "pending" | "expired" | "delivery_failed" | "accepted" | "revoked" | "superseded";
  deliveryStatus: "queued" | "sent" | "failed";
  expiresAt: string;
}
export type VendorAccessDeliveryState = "not_requested" | "queued" | "sending" | "sent" | "failed" | "delivery_unavailable" | "intervention_required" | "cancelled";
export interface VendorAccessDelivery {
  state: VendorAccessDeliveryState;
  failureCode: string | null;
  sentAt: string | null;
  updatedAt: string | null;
  cooldownUntil: string | null;
}
export interface VendorLoginAccess {
  vendorId: string;
  vendorName: string;
  vendorVersion: number;
  recipient: { name: string; email: string } | null;
  access: "unknown" | "setup_pending" | "active" | "blocked";
  invitation: VendorAccessInvitation | null;
  delivery: VendorAccessDelivery;
  readiness: VendorDeliveryReadiness;
  availableActions: VendorAccessAction[];
  blockedReasonCode: string | null;
}
export interface VendorInvitationCommand {
  expectedVendorVersion: number;
  invitationId: string | null;
  expectedInvitationVersion: number | null;
  idempotencyKey: string;
}
export interface VendorOrderAccessCommand extends VendorInvitationCommand {
  action: VendorAccessAction;
  expectedOrderVersion: number;
  expectedOrderRevision: number;
  expectedAccessVersion: number | null;
}
export interface VendorOrderAccess extends VendorAccessDelivery {
  /** Null represents an issued order without an intent; reads never create one. */
  id: string | null;
  version: number | null;
  projectId: string;
  vendorId: string;
  vendorName: string;
  vendorVersion: number;
  orderId: string;
  orderLabel: string;
  orderVersion: number;
  revision: number;
  access: VendorLoginAccess["access"];
  invitation: VendorAccessInvitation | null;
  readiness: VendorDeliveryReadiness;
  availableActions: VendorAccessAction[];
  blockedReasonCode: string | null;
  attempts: number;
  /** Compatibility with the earlier retry-only panel. */
  canRetry: boolean;
}
export interface VendorOrderAccessPage {
  items: VendorOrderAccess[];
  total: number;
  readiness: VendorDeliveryReadiness;
}
