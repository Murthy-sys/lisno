import type { ProjectStatusSummary } from "../../api/types";
import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { currentQuotationIsApproved } from "../estimates/quotationApproval";

export type ClientProjectPhase = "Estimate" | "Post approval" | "Execution";
export type ClientProjectPhaseResult =
  | { kind: "resolved"; phase: ClientProjectPhase; state: string | null }
  | { kind: "unavailable" | "conflict" };

const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const recorded = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const reference = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const unavailable = { kind: "unavailable" } as const;
const conflict = { kind: "conflict" } as const;
const initialActionStages = new Map([
  ["prepare", "estimate_preparation"],
  ["prepare-quotation", "estimate_preparation"],
  ["submit", "estimate_submission"]
]);

/** Phase boundaries come from approval lineage, never a stage label or progress value. */
export function resolveClientProjectPhase(projectId: string, status: ProjectStatusSummary, estimates: readonly EstimateQueueItem[]): ClientProjectPhaseResult {
  if (status.projectId !== projectId) return conflict;
  if (status.state === "unavailable") return unavailable;
  const candidates = estimates.filter(estimate => estimate.projectId === projectId || estimate.lead?.projectId === projectId);
  if (candidates.length > 1) return conflict;
  const estimate = candidates[0];
  if (!estimate) {
    // Initial drafts may be omitted by the Client collection before publication.
    // These backend source actions occur only before initial Client approval.
    const action = status.pendingActions[0];
    const prefix = `${projectId}:estimate:`;
    const source = action?.id.startsWith(prefix) ? action.id.slice(prefix.length) : "";
    const initialStage = initialActionStages.get(source.match(/^[^:]+:([^:]+)$/)?.[1] ?? "");
    const preEstimate = initialStage && status.currentStage?.key === initialStage && status.pendingActions.length === 1 &&
      action?.stageKey === initialStage && action.responsibleRole === "estimator_sales";
    return preEstimate ? resolved("Estimate", status) : unavailable;
  }
  if (estimate.projectId !== projectId || estimate.lead?.projectId && estimate.lead.projectId !== projectId ||
    !reference(estimate.id) || estimates.filter(row => row.id === estimate.id).length !== 1 || estimate.reviewSourceIssue) return conflict;
  if (status.pendingActions.some(action => action.id.startsWith(`${projectId}:estimate:`) &&
    !action.id.startsWith(`${projectId}:estimate:${estimate.id}:`))) return conflict;
  const lifecycle = estimate.estimation;
  const workflowVersions = [estimate.workflowVersion, lifecycle?.workflowVersion, estimate.publishedReview?.workflowVersion].filter(value => value !== undefined);
  if (new Set(workflowVersions).size > 1 || workflowVersions.some(value => value !== 2 && value !== 3)) return conflict;
  const published = estimate.publishedReview;
  if (published && (!positive(published.estimateVersion) || positive(estimate.version) &&
    (published.estimateVersion > estimate.version || published.status === "pending" && estimate.status === "sent_to_client" && published.estimateVersion !== estimate.version))) return conflict;
  const collaborative = workflowVersions.length > 0;
  if (collaborative) {
    if (!lifecycle || !positive(estimate.version)) return unavailable;
    const initial = lifecycle.preApproval;
    const preReview = estimate.preApprovedReview;
    if (!initial) {
      if (preReview || lifecycle.phase !== "pre" || lifecycle.designApproval || lifecycle.finalApproval ||
        estimate.status === "client_approved" || estimate.designPlanStatus === "approved") return conflict;
      return resolved("Estimate", status);
    }
    if (lifecycle.phase !== "post" || !recorded(initial.approvedAt) || !positive(initial.estimateVersion) ||
      initial.estimateVersion > estimate.version! || !reference(initial.reviewRoundId) ||
      preReview?.reviewRoundId !== initial.reviewRoundId || preReview.estimateVersion !== initial.estimateVersion) return conflict;

    if (lifecycle.workflowVersion === 3) {
      const design = lifecycle.designApproval;
      if (!design) return estimate.designPlanStatus === "approved" ? conflict : resolved("Post approval", status);
      const approvedQuotation = estimate.quotationApprovalState === "initial_current" ? initial : lifecycle.finalApproval;
      if (!currentQuotationIsApproved(estimate) || !reference(design.reviewRoundId) || !recorded(design.approvedAt) ||
        !positive(design.designPlanVersion) || design.designPlanVersion !== estimate.designPlanVersion ||
        !positive(design.designScopeRevision) || design.designScopeRevision !== lifecycle.designScopeRevision ||
        design.designScopeRevision !== lifecycle.approvedDesignScopeRevision ||
        design.estimateReviewRoundId !== estimate.currentQuotationApproval?.reviewRoundId ||
        approvedQuotation?.reviewRoundId !== estimate.currentQuotationApproval?.reviewRoundId ||
        approvedQuotation?.estimateVersion !== estimate.currentQuotationApproval?.estimateVersion || estimate.designPlanStatus !== "approved") return conflict;
      return resolved("Execution", status);
    }
    const final = lifecycle.finalApproval;
    if (!final) {
      if (estimate.designPlanStatus !== "approved") return resolved("Post approval", status);
      return positive(estimate.designPlanVersion) && positive(lifecycle.designScopeRevision) &&
        lifecycle.approvedDesignScopeRevision === lifecycle.designScopeRevision ? resolved("Execution", status) : conflict;
    }
    if (!reference(final.reviewRoundId) || !reference(final.designReviewRoundId) || !recorded(final.approvedAt) ||
      !positive(final.estimateVersion) || final.estimateVersion > estimate.version! ||
      final.requirementsVersion !== lifecycle.requirementsVersion || !positive(final.designPlanVersion) ||
      final.designPlanVersion !== estimate.designPlanVersion || !positive(final.designScopeRevision) ||
      final.designScopeRevision !== lifecycle.designScopeRevision || final.designScopeRevision !== lifecycle.approvedDesignScopeRevision ||
      estimate.publishedReview?.id !== final.reviewRoundId || estimate.publishedReview.status !== "approved" ||
      estimate.publishedReview.estimateVersion !== final.estimateVersion || estimate.designPlanStatus !== "approved") return conflict;
    return resolved("Execution", status);
  }
  if (estimate.preApprovedReview || lifecycle) return conflict;
  if (estimate.status !== "client_approved") {
    if (estimate.publishedReview?.status === "approved" || estimate.designPlanStatus === "approved") return conflict;
    return resolved("Estimate", status);
  }
  const review = estimate.publishedReview;
  if (!review || review.status !== "approved" || !positive(review.estimateVersion) ||
    !positive(estimate.version) || review.estimateVersion + 1 !== estimate.version) return unavailable;
  return resolved(estimate.designPlanStatus === "approved" ? "Execution" : "Post approval", status);
}

function resolved(phase: ClientProjectPhase, status: ProjectStatusSummary): ClientProjectPhaseResult {
  if ((status.state === "completed" || status.projectStatus === "completed") && phase !== "Execution") return conflict;
  if (phase === "Estimate" && status.currentStage && !["estimate_preparation", "estimate_internal_review", "estimate_submission", "estimate_approval"].includes(status.currentStage.key)) return conflict;
  if (phase !== "Execution" && status.currentStage && ["execution", "purchase_order", "vendor_work", "client_vendor_review", "site_execution", "client_completion", "final_completion"].includes(status.currentStage.key)) return conflict;
  return { kind: "resolved", phase, state: status.state === "completed" ? "Completed"
    : status.state === "paused" ? "On hold" : status.state === "scheduled" ? "Scheduled"
      : status.pendingActions.some(action => action.state === "blocked") ? "Blocked" : null };
}
