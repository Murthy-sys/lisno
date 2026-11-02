/** Commercial revisions are independent of the established project design status. */
export const ESTIMATION_WORKFLOW_VERSION = 2 as const;
export const QUOTATION_WORKFLOW_VERSION = 3 as const;
export type EstimationWorkflowVersion = 2 | 3;
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
  designReviewRoundId: string | null;
  designPlanVersion: number | null;
  designScopeRevision: number;
}
export interface SalesQuotationApproval {
  actorId: string;
  pricedRevision: number;
  estimateVersion: number;
  sourceDigest: string;
  approvedAt: string;
}
export interface QuotationDesignApproval {
  reviewRoundId: string;
  designPlanVersion: number;
  designScopeRevision: number;
  estimateReviewRoundId: string;
  approvedAt: string;
}
interface EstimationLifecycleBase {
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
export interface LegacyEstimationLifecycle extends EstimationLifecycleBase {
  workflowVersion: 2;
  finalApproval: (FinalEstimationApprovalReference & { designReviewRoundId: string; designPlanVersion: number }) | null;
}
export interface QuotationLifecycle extends EstimationLifecycleBase {
  workflowVersion: 3;
  /** Changes only when priced content changes, not when workflow/audit metadata changes. */
  pricedRevision: number;
  /** First quotation approval starts design deadlines; reopening never resets this anchor. */
  designStartedAt: string | null;
  salesApproval: SalesQuotationApproval | null;
  /** Later drawing approval, independent of the immutable quotation approval. */
  designApproval: QuotationDesignApproval | null;
}
export type EstimationLifecycle = LegacyEstimationLifecycle | QuotationLifecycle;
export interface EstimationDocument {
  status?: unknown;
  estimation?: EstimationLifecycle | null;
}

export function newEstimationLifecycle(requirementsVersion = 0): LegacyEstimationLifecycle {
  return { workflowVersion: 2, phase: "pre", status: "draft", requirementsVersion,
    editClosedAt: null, preApproval: null, finalApproval: null,
    designScopeRevision: 1, approvedDesignScopeRevision: null,
    pendingReviewRoundId: null, preparationSnapshotId: null };
}

export function newQuotationLifecycle(requirementsVersion = 0): QuotationLifecycle {
  return { ...newEstimationLifecycle(requirementsVersion), workflowVersion: 3,
    pricedRevision: 1, designStartedAt: null, salesApproval: null, designApproval: null };
}

export function isEstimationWorkflowVersion(value: unknown): value is EstimationWorkflowVersion {
  return value === 2 || value === 3;
}

export function isQuotationEstimate(value: EstimationDocument): boolean {
  return value.estimation?.workflowVersion === QUOTATION_WORKFLOW_VERSION;
}

export function isCollaborativeEstimate(value: EstimationDocument): boolean {
  return isEstimationWorkflowVersion(value.estimation?.workflowVersion);
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
    ? { "estimation.workflowVersion": value.estimation!.workflowVersion, "estimation.status": status }
    : { status, "estimation.workflowVersion": { $nin: [2, 3] } };
}

export function estimateWorkingCopyEditable(value: EstimationDocument): boolean {
  if (isCollaborativeEstimate(value) && (value.estimation!.editClosedAt || value.estimation!.workflowVersion === 2 && value.estimation!.finalApproval)) return false;
  return ["draft", "designer_changes_requested", "client_changes_requested"].includes(effectiveCommercialStatus(value));
}

/** Client edits in a pending v3 round must supersede that round atomically. */
export function clientQuotationEditable(value: EstimationDocument): boolean {
  return isQuotationEstimate(value) && !value.estimation!.editClosedAt &&
    ["draft", "ready_for_client", "sent_to_client", "designer_changes_requested", "client_changes_requested"].includes(effectiveCommercialStatus(value));
}

export function quotationApprovalIsCurrent(value: EstimationDocument): boolean {
  return isQuotationEstimate(value) && !!value.estimation!.editClosedAt && !!value.estimation!.finalApproval &&
    value.estimation!.finalApproval.designScopeRevision === value.estimation!.designScopeRevision;
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
  workflowVersion: EstimationWorkflowVersion;
  phase: EstimationPhase;
  kind: "approved_pre" | "released_post" | "approved_final";
  sourceSnapshotId: string;
  sourceDigest: string;
}
