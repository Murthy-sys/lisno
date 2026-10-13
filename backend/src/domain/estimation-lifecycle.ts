/** Commercial revisions are independent of the established project design status. */
export const ESTIMATION_WORKFLOW_VERSION = 2 as const;
export const ESTIMATION_STATUSES = ["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested", "ready_for_client", "sent_to_client", "client_changes_requested", "client_approved"] as const;
export type EstimationStatus = typeof ESTIMATION_STATUSES[number];
export type EstimationPhase = "pre" | "post";

export interface EstimationApprovalReference {
  reviewRoundId: string;
  estimateVersion: number;
  approvedAt: string;
}
export interface FinalEstimationApprovalReference extends EstimationApprovalReference {
  requirementsVersion: number;
  designReviewRoundId: string;
  designPlanVersion: number;
  designScopeRevision: number;
}
export interface EstimationLifecycle {
  workflowVersion: typeof ESTIMATION_WORKFLOW_VERSION;
  phase: EstimationPhase;
  status: EstimationStatus;
  requirementsVersion: number;
  editClosedAt: string | null;
  preApproval: EstimationApprovalReference | null;
  finalApproval: FinalEstimationApprovalReference | null;
  designScopeRevision: number;
  approvedDesignScopeRevision: number | null;
  pendingReviewRoundId: string | null;
  preparationSnapshotId: string | null;
}
export interface EstimationDocument {
  status?: unknown;
  estimation?: EstimationLifecycle | null;
}

export function newEstimationLifecycle(requirementsVersion = 0): EstimationLifecycle {
  return { workflowVersion: 2, phase: "pre", status: "draft", requirementsVersion,
    editClosedAt: null, preApproval: null, finalApproval: null,
    designScopeRevision: 1, approvedDesignScopeRevision: null,
    pendingReviewRoundId: null, preparationSnapshotId: null };
}

export function isCollaborativeEstimate(value: EstimationDocument): boolean {
  return value.estimation?.workflowVersion === ESTIMATION_WORKFLOW_VERSION;
}

export function effectiveCommercialStatus(value: EstimationDocument): EstimationStatus {
  return (isCollaborativeEstimate(value) ? value.estimation!.status : value.status) as EstimationStatus;
}

export function estimateCommercialStatusFields(value: EstimationDocument, status: EstimationStatus): Record<string, unknown> {
  if (!isCollaborativeEstimate(value)) return { status };
  return { "estimation.status": status,
    status: value.estimation!.preApproval ? "client_approved" : status };
}

export function estimateCommercialStatusFilter(value: EstimationDocument, status: EstimationStatus): Record<string, unknown> {
  return isCollaborativeEstimate(value)
    ? { "estimation.workflowVersion": 2, "estimation.status": status }
    : { status, "estimation.workflowVersion": { $ne: 2 } };
}

export function estimateWorkingCopyEditable(value: EstimationDocument): boolean {
  if (isCollaborativeEstimate(value) && (value.estimation!.editClosedAt || value.estimation!.finalApproval)) return false;
  return ["draft", "designer_changes_requested", "client_changes_requested"].includes(effectiveCommercialStatus(value));
}

/** Returns only a recorded approval; consumers must still verify the immutable round. */
export function currentEstimationApproval(value: EstimationDocument): EstimationApprovalReference | null {
  if (!isCollaborativeEstimate(value)) return null;
  return value.estimation!.finalApproval ?? value.estimation!.preApproval;
}

export interface EstimationPreparationSource {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  workflowVersion: 2;
  phase: EstimationPhase;
  kind: "approved_pre" | "released_post" | "approved_final";
  sourceSnapshotId: string;
  sourceDigest: string;
}
