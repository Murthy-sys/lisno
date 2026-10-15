import { newEstimationLifecycle } from "../../src/domain/estimation-lifecycle.js";
import { EstimateModel } from "../../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../../src/models/EstimateClientReviewRound.js";
import { DesignPlanReviewRoundModel } from "../../src/models/DesignPlanReviewRound.js";
import { DesignWorkflowStateModel } from "../../src/models/DesignWorkflowState.js";
import { ProjectModel } from "../../src/models/Project.js";

export async function collaborativePurchasePreparation(projectId: string, at: Date) {
  await ProjectModel.updateOne({ _id: projectId }, { $set: { estimationWorkflowVersion: 2, estimateRequirementsVersion: 0, estimationFenceEpoch: 0, status: "planning", completionAuthority: "legacy_staff" } });
  await EstimateModel.updateOne({ _id: `estimate-${projectId}` }, { $set: { estimation: {
    ...newEstimationLifecycle(), phase: "post", preApproval: { reviewRoundId: `round-${projectId}`, estimateVersion: 1, approvedAt: at.toISOString() }
  }, designPlanStatus: "changes_requested" } });
  await EstimateClientReviewRoundModel.collection.updateOne({ _id: `round-${projectId}` }, { $set: { projectId, phase: "pre" } });
}
export async function collaborativePurchaseFinal(projectId: string, at: Date, quantity?: number) {
  const pre = (await EstimateClientReviewRoundModel.findById(`round-${projectId}`).lean())!;
  const snapshot = structuredClone(pre.estimateSnapshot);
  if (quantity !== undefined) snapshot.lineItems[0].quantity = quantity;
  const finalId = `final-${projectId}`;
  await EstimateClientReviewRoundModel.collection.insertOne({ ...pre, _id: finalId, estimateVersion: 3, sendGeneration: 2, phase: "post", projectId,
    dedupeKey: `final-${projectId}`, estimateSnapshot: snapshot } as never);
  await EstimateModel.updateOne({ _id: `estimate-${projectId}` }, { $set: {
    "estimation.finalApproval": { reviewRoundId: finalId, estimateVersion: 3, approvedAt: at.toISOString(), requirementsVersion: 0,
      designReviewRoundId: `design-${projectId}`, designPlanVersion: 1, designScopeRevision: 1 },
    "estimation.status": "client_approved", "estimation.editClosedAt": at.toISOString(), "estimation.approvedDesignScopeRevision": 1,
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: "synthetic-designer"
  } });
  await DesignPlanReviewRoundModel.collection.insertOne({ _id: `design-${projectId}`, projectId, estimateId: `estimate-${projectId}`,
    designPlanVersion: 1, designScopeRevision: 1, status: "approved", decision: "approve" } as never);
}
export async function collaborativePurchasePayment(projectId: string, at: Date) {
  await DesignWorkflowStateModel.create({ _id: projectId, projectId, version: 1, estimationWorkflowVersion: 2,
    designStartedAt: at.toISOString(), initialPaymentAt: at.toISOString(), initialPaymentEstimateId: `estimate-${projectId}`,
    initialPaymentEstimateVersion: 3, initialPaymentReviewRoundId: `final-${projectId}`, initialPaymentDesignReviewRoundId: `design-${projectId}`,
    stages: {}, pauses: [], history: [] });
  await ProjectModel.updateOne({ _id: projectId }, { $set: { status: "active" } });
}
