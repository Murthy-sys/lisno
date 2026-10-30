/** Allowlisted PM commercial reads and Main Line recommendation contracts. Money is integer paise. */
export interface PMApprovedSourceRef {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string;
  phase: "pre" | "post" | "legacy";
  designPlanVersion: number;
  sourceSnapshotId: string | null;
  sourceDigest: string | null;
}
export interface PMLineOccurrence {
  sourceLineItemKey: string;
  sectionId: string;
  roomId: string | null;
  roomName: string;
}
export interface PMEstimateLine extends PMLineOccurrence {
  itemType?: "main_line" | "temporary";
  mainLineId: string | null;
  mainLineName: string;
  mainBasketId: string | null;
  mainBasketName: string | null;
  specification: string;
  included: boolean;
  quantity: number | null;
  unit: string;
  ratePaise: number | null;
  amountPaise: number | null;
  dimensions: Array<{ label: string; value: string; unit: string | null }>;
}
export interface PMMainLineScope {
  itemType?: "main_line" | "temporary";
  mainLineId: string;
  mainLineName: string;
  mainBasketId: string | null;
  mainBasketName: string | null;
  occurrences: PMLineOccurrence[];
  scopeDigest: string;
  canSuggest: boolean;
  unavailableReason: string | null;
}
export interface PMWriteAvailability { available: boolean; reason: string | null; }
export interface PMEstimateView {
  project: { id: string; name: string };
  availability: "available" | "unavailable";
  reason: string | null;
  source: PMApprovedSourceRef | null;
  approvedAt: string | null;
  lines: PMEstimateLine[];
  mainLines: PMMainLineScope[];
  totals: { subtotalPaise: number | null; gstPaise: number | null; totalPaise: number | null };
  writeAvailability: PMWriteAvailability;
}
export interface PMVendorCandidate {
  id: string;
  code: string;
  name: string;
  classification: string[];
  canSuggest: boolean;
  bidEligible: boolean;
  reasons: string[];
}
export interface PMVendorCandidatePage {
  source: PMApprovedSourceRef;
  mainLine: PMMainLineScope;
  items: PMVendorCandidate[];
  total: number;
  limit: number;
  offset: number;
}
export interface PMVendorBidActivity {
  enquiryId: string;
  basketId: string;
  revisionId: string;
  revision: number;
  invitationId: string;
  requestedAt: string;
  deliveryStatus: "pending" | "sent" | "failed" | "stalled" | "expired" | "revoked" | "superseded" | "consumed";
  deliveredAt: string | null;
  bidReceivedAt: string | null;
  lineResponded: boolean;
  respondedSourceLineItemKeys: string[];
  coveredSourceLineItemKeys: string[];
  coverage: "full" | "partial";
  sourceRelation: "exact" | "reconciled_history";
}
export interface PMVendorSuggestion {
  id: string;
  projectId: string;
  source: PMApprovedSourceRef | null;
  storedSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null; designPlanVersion: number };
  scope: "project" | "main_line";
  mainLine: PMMainLineScope | null;
  vendor: { id: string; code: string; name: string };
  note: string;
  status: "suggested" | "withdrawn";
  version: number;
  suggestedBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  sourceState: "current" | "historical" | "unverified";
  canEdit: boolean;
  editUnavailableReason: string | null;
  reinstatementAvailability?: PMWriteAvailability;
  bidEligible: boolean;
  readinessReasons: string[];
  activity: { availability: "available" | "unavailable"; items: PMVendorBidActivity[]; truncated: boolean };
}
export interface PMVendorSuggestionPage {
  source: PMApprovedSourceRef | null;
  items: PMVendorSuggestion[];
  total: number;
  limit: number;
  offset: number;
  writeAvailability: PMWriteAvailability;
}
export interface PMVendorSuggestionCreate {
  expectedSource: PMApprovedSourceRef;
  mainLineId: string;
  vendorId: string;
  note: string;
  idempotencyKey: string;
}
export interface PMVendorSuggestionUpdate {
  expectedSource: PMApprovedSourceRef;
  expectedVersion: number;
  idempotencyKey: string;
  note: string;
  status: "suggested" | "withdrawn";
}
export interface PMVendorSuggestionCommandResult { id: string; version: number; status: "suggested" | "withdrawn"; }
export interface PMVendorSuggestionQuery {
  mainLineId?: string;
  source: "current" | "history" | "all";
  q?: string;
  limit: number;
  offset: number;
}
export interface PMVendorCandidateQuery {
  expectedSource: PMApprovedSourceRef;
  mainLineId: string;
  q?: string;
  limit: number;
  offset: number;
}
export interface ProcurementMainLineSuggestionPage {
  items: PMVendorSuggestion[];
  total: number;
  limit: number;
  offset: number;
  mainLines: Array<{ id: string; name: string }>;
}
