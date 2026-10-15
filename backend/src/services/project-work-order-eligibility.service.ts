import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";

export interface FinalWorkOrderSource { estimateId: string; estimateVersion: number; estimateReviewRoundId: string }

/** Call only after the caller has checked project access. This contains no client data. */
export async function projectWorkOrderIssueReadiness(projectId: string, session?: ClientSession): Promise<{
  required: boolean; canIssue: boolean; blockers: string[]; finalSource: FinalWorkOrderSource | null;
}> {
  const projectQuery = ProjectModel.findById(projectId).select({ estimationWorkflowVersion: 1, estimateRequirementsVersion: 1 });
  if (session) projectQuery.session(session);
  const project = await projectQuery.lean();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.estimationWorkflowVersion !== 2) return { required: false, canIssue: true, blockers: [], finalSource: null };
  const blockers: string[] = [];
  const estimateQuery = EstimateModel.find({ projectId }).limit(2);
  if (session) estimateQuery.session(session);
  const estimates = await estimateQuery.lean();
  const estimate = estimates.length === 1 ? estimates[0] : null;
  const lifecycle = estimate?.estimation;
  const final = lifecycle?.workflowVersion === 2 ? lifecycle.finalApproval : null;
  if (!estimate || !final || !lifecycle.editClosedAt || lifecycle.status !== "client_approved")
    return { required: true, canIssue: false, blockers: ["Client approval of the final post-estimate is required."], finalSource: null };
  const finalSource = { estimateId: String(estimate._id), estimateVersion: final.estimateVersion, estimateReviewRoundId: final.reviewRoundId };
  const approvalQuery = EstimateClientReviewRoundModel.findOne({ _id: final.reviewRoundId, estimateId: estimate._id, projectId,
    estimateVersion: final.estimateVersion, phase: "post", status: "approved", decision: "approve" });
  if (session) approvalQuery.session(session);
  const approval = await approvalQuery.lean();
  if (!approval || !approval.decidedById || !approval.decidedAt ||
    final.requirementsVersion !== project.estimateRequirementsVersion || final.requirementsVersion !== lifecycle.requirementsVersion)
    blockers.push("The final estimate approval or its requirements source needs reconciliation.");
  const designQuery = DesignPlanReviewRoundModel.exists({ _id: final.designReviewRoundId, estimateId: estimate._id, projectId,
    designPlanVersion: final.designPlanVersion, status: "approved", decision: "approve" });
  if (session) designQuery.session(session);
  if (estimate.designPlanStatus !== "approved" || estimate.designPlanVersion !== final.designPlanVersion ||
    lifecycle.designScopeRevision !== final.designScopeRevision || lifecycle.approvedDesignScopeRevision !== final.designScopeRevision || !await designQuery)
    blockers.push("Design must be complete and approved for the final estimate scope.");
  const paymentQuery = DesignWorkflowStateModel.findById(projectId);
  if (session) paymentQuery.session(session);
  const payment = await paymentQuery.lean();
  if (!payment?.initialPaymentAt || payment.initialPaymentEstimateId !== String(estimate._id) ||
    payment.initialPaymentEstimateVersion !== final.estimateVersion || payment.initialPaymentReviewRoundId !== final.reviewRoundId ||
    payment.initialPaymentDesignReviewRoundId !== final.designReviewRoundId)
    blockers.push("Super Admin must confirm the initial payment against the final estimate.");
  return { required: true, canIssue: blockers.length === 0, blockers, finalSource };
}

/** Every effective issue path calls this within its transaction, after an already-issued replay. */
export async function assertProjectWorkOrderIssueEligible(projectId: string, session: ClientSession, source?: FinalWorkOrderSource): Promise<void> {
  const readiness = await projectWorkOrderIssueReadiness(projectId, session);
  if (!readiness.required) return;
  if (!readiness.canIssue) throw new ApiError(409, "WORK_ORDER_NOT_READY", readiness.blockers.join(" "));
  if (source && (!readiness.finalSource || source.estimateId !== readiness.finalSource.estimateId ||
    source.estimateVersion !== readiness.finalSource.estimateVersion || source.estimateReviewRoundId !== readiness.finalSource.estimateReviewRoundId))
    throw new ApiError(409, "WORK_ORDER_SOURCE_RECONCILIATION_REQUIRED", "Reconcile and approve this order against the final estimate before issuing it.");
  const result = await ProjectModel.updateOne({ _id: projectId, estimationWorkflowVersion: 2 }, { $inc: { estimationFenceEpoch: 1 } }, { session, timestamps: false });
  if (result.matchedCount !== 1) throw new ApiError(409, "WORK_ORDER_SOURCE_CONFLICT", "The project changed before work-order issuance.");
}
