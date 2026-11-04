import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";
import { resolveCurrentQuotationApproval } from "./quotation-approval-state.service.js";

export interface FinalWorkOrderSource { estimateId: string; estimateVersion: number; estimateReviewRoundId: string }

/** Call only after the caller has checked project access. This contains no client data. */
export async function projectWorkOrderIssueReadiness(projectId: string, session?: ClientSession): Promise<{
  required: boolean; canIssue: boolean; blockers: string[]; finalSource: FinalWorkOrderSource | null;
}> {
  const projectQuery = ProjectModel.findById(projectId).select({ estimationWorkflowVersion: 1, estimateRequirementsVersion: 1 });
  if (session) projectQuery.session(session);
  const project = await projectQuery.lean();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (![2, 3].includes(project.estimationWorkflowVersion)) return { required: false, canIssue: true, blockers: [], finalSource: null };
  const blockers: string[] = [];
  const estimateQuery = EstimateModel.find({ projectId }).limit(2);
  if (session) estimateQuery.session(session);
  const estimates = await estimateQuery.lean();
  const estimate = estimates.length === 1 ? estimates[0] : null;
  const lifecycle = estimate?.estimation;
  if (!estimate || lifecycle?.workflowVersion !== project.estimationWorkflowVersion)
    return { required: true, canIssue: false, blockers: ["Client approval of the current quotation is required."], finalSource: null };
  const resolved = lifecycle.workflowVersion === 3 ? await resolveCurrentQuotationApproval(estimate, session) : null;
  const approvalReference = lifecycle.workflowVersion === 3 ? resolved?.currentQuotationApproval : lifecycle.finalApproval;
  if (!approvalReference)
    return { required: true, canIssue: false, blockers: ["Client approval of the current quotation is required."], finalSource: null };
  const finalSource = { estimateId: String(estimate._id), estimateVersion: approvalReference.estimateVersion,
    estimateReviewRoundId: approvalReference.reviewRoundId };
  const approvalQuery = EstimateClientReviewRoundModel.findOne({ _id: approvalReference.reviewRoundId, estimateId: estimate._id, projectId,
    estimateVersion: approvalReference.estimateVersion,
    phase: lifecycle.workflowVersion === 3 && approvalReference.kind === "initial_unchanged" ? "pre" : "post",
    status: "approved", decision: "approve" });
  if (session) approvalQuery.session(session);
  const approval = await approvalQuery.lean();
  const sourceRequirementsVersion = lifecycle.workflowVersion === 3 ? approvalReference.requirementsVersion : approvalReference.requirementsVersion;
  if (!approval || !approval.decidedById || !approval.decidedAt ||
    sourceRequirementsVersion !== project.estimateRequirementsVersion || sourceRequirementsVersion !== lifecycle.requirementsVersion)
    blockers.push("The quotation approval or its requirements source needs reconciliation.");
  const designBinding = lifecycle.workflowVersion === 3 ? lifecycle.designApproval : {
    reviewRoundId: approvalReference.designReviewRoundId, designPlanVersion: approvalReference.designPlanVersion,
    designScopeRevision: approvalReference.designScopeRevision, estimateReviewRoundId: approvalReference.reviewRoundId
  };
  if (!designBinding || designBinding.estimateReviewRoundId !== approvalReference.reviewRoundId ||
      designBinding.designScopeRevision !== approvalReference.designScopeRevision) {
    blockers.push("Approve the uploaded design for the current quotation before issuing work orders.");
  }
  const designQuery = DesignPlanReviewRoundModel.exists({ _id: designBinding?.reviewRoundId ?? null, estimateId: estimate._id, projectId,
    designPlanVersion: designBinding?.designPlanVersion ?? null, status: "approved", decision: "approve",
    ...(lifecycle.workflowVersion === 3 ? { designScopeRevision: lifecycle.designScopeRevision } : {}) });
  if (session) designQuery.session(session);
  if (estimate.designPlanStatus !== "approved" || estimate.designPlanVersion !== designBinding?.designPlanVersion ||
    lifecycle.designScopeRevision !== approvalReference.designScopeRevision || lifecycle.approvedDesignScopeRevision !== approvalReference.designScopeRevision || !await designQuery)
    blockers.push("Design must be complete and approved for the current quotation scope.");
  const paymentQuery = DesignWorkflowStateModel.findById(projectId);
  if (session) paymentQuery.session(session);
  const payment = await paymentQuery.lean();
  if (!payment?.initialPaymentAt || payment.initialPaymentEstimateId !== String(estimate._id) ||
    payment.initialPaymentEstimateVersion !== approvalReference.estimateVersion || payment.initialPaymentReviewRoundId !== approvalReference.reviewRoundId ||
    payment.initialPaymentDesignReviewRoundId !== designBinding?.reviewRoundId)
    blockers.push("Super Admin must confirm the initial payment against the current quotation.");
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
  const result = await ProjectModel.updateOne({ _id: projectId, estimationWorkflowVersion: { $in: [2, 3] } }, { $inc: { estimationFenceEpoch: 1 } }, { session, timestamps: false });
  if (result.matchedCount !== 1) throw new ApiError(409, "WORK_ORDER_SOURCE_CONFLICT", "The project changed before work-order issuance.");
}
