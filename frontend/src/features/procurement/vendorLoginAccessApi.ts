import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { userInvitationKeys } from "../admin/userInvitationsApi";
import { executionKeys } from "../execution/executionApi";

/** Token-free contract mirrored from backend/contracts/vendor-access.ts. */
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
export interface VendorAccessDelivery {
  state: "not_requested" | "queued" | "sending" | "sent" | "failed" | "delivery_unavailable" | "intervention_required" | "cancelled";
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
  canRetry: boolean;
}
export interface VendorOrderAccessPage {
  items: VendorOrderAccess[];
  total: number;
  readiness: VendorDeliveryReadiness;
}
export const vendorLoginAccessKeys = {
  all: ["procurement", "vendor-login-access"] as const,
  detail: (actorId: string, vendorId: string) => ["procurement", "vendor-login-access", actorId, vendorId] as const
};
export const vendorLoginAccessApi = {
  get: (vendorId: string, signal?: AbortSignal) => apiClient.get<VendorLoginAccess>(`/procurement/vendors/${encodeURIComponent(vendorId)}/login-access`, { signal, showGlobalLoader: false }),
  send: (vendorId: string, input: VendorInvitationCommand) => apiClient.post<VendorLoginAccess>(`/procurement/vendors/${encodeURIComponent(vendorId)}/login-access/send`, input, { showGlobalLoader: false }),
  resend: (vendorId: string, input: VendorInvitationCommand) => apiClient.post<VendorLoginAccess>(`/procurement/vendors/${encodeURIComponent(vendorId)}/login-access/resend`, input, { showGlobalLoader: false })
};

export async function invalidateVendorAccess(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: vendorLoginAccessKeys.all }),
    client.invalidateQueries({ queryKey: executionKeys.all }),
    client.invalidateQueries({ queryKey: userInvitationKeys.all })
  ]);
}
