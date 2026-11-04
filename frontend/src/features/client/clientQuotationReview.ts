import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { quotationApprovalNeedsClient } from "../estimates/quotationApproval";
import type { QuotationDetail, QuotationRevision } from "./quotationApi";

export interface ClientQuotationReviewState {
  estimate: EstimateQueueItem | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
}

/** UI consistency checks supplement the server's complete Sales and publication proof. */
export function canReviewCurrentQuotation(detail: QuotationDetail, estimate: EstimateQueueItem | null, revision: QuotationRevision | undefined): boolean {
  const review = estimate?.publishedReview;
  const lifecycle = estimate?.estimation;
  if (!estimate || !review || estimate.reviewSourceIssue || !lifecycle || !revision) return false;
  if (detail.projectId !== estimate.projectId || detail.estimateId !== estimate.id || revision.estimateId !== estimate.id) return false;
  if (detail.workflowVersion !== 3 || lifecycle.workflowVersion !== 3 || review.workflowVersion !== 3) return false;
  if (detail.estimateVersion !== estimate.version || detail.estimateVersion !== review.estimateVersion || revision.estimateVersion !== detail.estimateVersion) return false;
  if (detail.phase !== review.phase || lifecycle.phase !== review.phase || revision.phase !== detail.phase) return false;
  if (detail.pricedRevision !== lifecycle.pricedRevision || revision.pricedRevision !== detail.pricedRevision) return false;
  if (detail.status !== "sent_to_client" || lifecycle.status !== "sent_to_client" || estimate.status !== "sent_to_client" || revision.status !== "sent_to_client") return false;
  if (detail.reviewState !== "ready_for_approval" || lifecycle.editClosedAt || lifecycle.pendingReviewRoundId !== review.id || review.status !== "pending" || !review.canDecide) return false;
  if (review.requirementsVersion !== undefined && review.requirementsVersion !== lifecycle.requirementsVersion) return false;
  if (review.phase === "pre") {
    const proof = lifecycle.salesApproval;
    if (!proof || proof.estimateVersion !== review.estimateVersion || proof.pricedRevision !== detail.pricedRevision) return false;
  } else if (!estimate.preApprovedReview || !estimate.changesFromPre ||
    detail.quotationApprovalState !== "revision_pending_client" ||
    estimate.quotationApprovalState !== "revision_pending_client" ||
    !quotationApprovalNeedsClient(detail) || !quotationApprovalNeedsClient(estimate)) return false;
  // The safe projection omits private rows, so its digest/totals cannot validate full-source proof.
  return true;
}
