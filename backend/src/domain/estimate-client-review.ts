import { createHash } from "node:crypto";

export const ESTIMATE_DELIVERY_STATUSES = [
  "queued",
  "sent",
  "failed",
  "disabled"
] as const;
export const ESTIMATE_CLIENT_REVIEW_STATUSES = [
  "pending",
  "approved",
  "changes_requested"
] as const;
export const ESTIMATE_CLIENT_DECISIONS = ["approve", "request_changes"] as const;
export const ESTIMATE_CLIENT_DECISION_SOURCES = [
  "client_portal",
  "admin_proof"
] as const;
export const ESTIMATE_CLIENT_PROOF_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;
export const ESTIMATE_CLIENT_DECISION_NOTE_MAX = 1_000;
export const ESTIMATE_DELIVERY_FAILURE_CODE = /^[A-Z0-9_]{1,64}$/;
export const ESTIMATE_CLIENT_SHA256 = /^[a-f0-9]{64}$/;

export type EstimateDeliveryStatus = (typeof ESTIMATE_DELIVERY_STATUSES)[number];
export type EstimateClientReviewStatus =
  (typeof ESTIMATE_CLIENT_REVIEW_STATUSES)[number];
export type EstimateClientDecision = (typeof ESTIMATE_CLIENT_DECISIONS)[number];
export type EstimateClientDecisionSource =
  (typeof ESTIMATE_CLIENT_DECISION_SOURCES)[number];
export type EstimateClientProofMimeType =
  (typeof ESTIMATE_CLIENT_PROOF_MIME_TYPES)[number];

export interface EstimateClientReviewSnapshot {
  clientName: string;
  projectName: string;
  location: string;
  propertyType: string;
  lineItems: readonly {
    id?: string | null;
    catalogueId: string;
    roomName: string;
    specification: string;
    unit: string;
    rate: number;
    quantity: number;
    included: boolean;
    amount: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
}

export interface EstimateClientReviewRoundRecord {
  id: string;
  estimateId: string;
  leadId: string;
  projectId: string | null;
  estimateVersion: number;
  sendGeneration: number;
  dedupeKey: string;
  recipientEmail: string;
  recipientEmailNormalized: string;
  estimateSnapshot: EstimateClientReviewSnapshot;
  pdfFilename: string;
  pdfMimeType: "application/pdf";
  pdfByteSize: number;
  pdfSha256: string;
  pdfStorageReference: string;
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptGeneration: number;
  deliveryAttemptCount: number;
  deliveryAttemptedAt: Date | null;
  deliveryLeaseExpiresAt: Date | null;
  deliveredAt: Date | null;
  deliveryFailureCode: string | null;
  assignedAdminId: string;
  status: EstimateClientReviewStatus;
  decision: EstimateClientDecision | null;
  decisionSource: EstimateClientDecisionSource | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EstimateClientResponseProofRecord {
  id: string;
  reviewRoundId: string;
  estimateId: string;
  storageReference: string;
  originalFilename: string;
  mimeType: EstimateClientProofMimeType;
  byteSize: number;
  sha256: string;
  uploadedById: string;
  uploadedAt: Date;
}

export interface EstimateClientReviewSummary {
  id: string;
  sendGeneration: number;
  estimateVersion: number;
  version: number;
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptCount: number;
  deliveredAt: string | null;
  status: EstimateClientReviewStatus;
}

export interface EstimateClientReviewListItem {
  id: string;
  version: number;
  sendGeneration: number;
  project: { id: string; name: string } | null;
  client: { name: string; email: string };
  estimate: { id: string; version: number; total: number };
  assignedAdmin: { id: string; name: string };
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptCount: number;
  deliveryAttemptedAt: string | null;
  deliveredAt: string | null;
  status: EstimateClientReviewStatus;
  decision: EstimateClientDecision | null;
  proofAvailable: boolean;
  createdAt: string;
}

export interface EstimateClientReviewDetail extends EstimateClientReviewListItem {
  estimateSnapshot: EstimateClientReviewSnapshot;
  pdf: {
    filename: string;
    mimeType: "application/pdf";
    byteSize: number;
    sha256: string;
  };
  decisionSource: EstimateClientDecisionSource | null;
  decisionNote: string | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
}

export interface StoredEstimateClientResponseProof {
  storageReference: string;
  originalFilename: string;
  mimeType: EstimateClientProofMimeType;
  byteSize: number;
  sha256: string;
}

export interface ReviewAssignee {
  assignedAdminId: string;
  source: "admin_initiator" | "super_admin_fallback";
}

export interface StoredDownload {
  filename: string;
  mimeType: "application/pdf" | EstimateClientProofMimeType;
  bytes: Buffer;
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildEstimateClientReviewDedupeKey(input: {
  estimateId: string;
  estimateVersion: number;
  recipientEmailNormalized: string;
}): string {
  return sha256Hex(
    `${input.estimateId}\n${input.estimateVersion}\n${input.recipientEmailNormalized}`
  );
}
