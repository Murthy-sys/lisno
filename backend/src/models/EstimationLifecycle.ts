import { Schema } from "./mongoose.js";
import { ESTIMATION_STATUSES } from "../domain/estimation-lifecycle.js";

const approvalFields = {
  reviewRoundId: { type: String, required: true },
  estimateVersion: { type: Number, min: 1, required: true, validate: Number.isSafeInteger },
  approvedAt: { type: String, required: true }
};
const approvalSchema = new Schema(approvalFields, { _id: false });
const finalApprovalSchema = new Schema({
  ...approvalFields,
  requirementsVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  designReviewRoundId: { type: String, default: null },
  designPlanVersion: { type: Number, default: null, min: 1, validate: (value: unknown) => value == null || Number.isSafeInteger(value) },
  designScopeRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
}, { _id: false });

export const estimationLifecycleSchema = new Schema({
  workflowVersion: { type: Number, enum: [2, 3], required: true },
  pricedRevision: { type: Number, min: 1, default: undefined, validate: Number.isSafeInteger },
  designStartedAt: { type: String, default: undefined },
  salesApproval: { type: new Schema({
    actorId: { type: String, required: true },
    pricedRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    sourceDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    approvedAt: { type: String, required: true }
  }, { _id: false }), default: undefined },
  designApproval: { type: new Schema({
    reviewRoundId: { type: String, required: true },
    estimateReviewRoundId: { type: String, required: true },
    designPlanVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    designScopeRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    approvedAt: { type: String, required: true }
  }, { _id: false }), default: undefined },
  phase: { type: String, enum: ["pre", "post"], required: true },
  status: { type: String, enum: ESTIMATION_STATUSES, required: true },
  requirementsVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  editClosedAt: { type: String, default: null },
  preApproval: { type: approvalSchema, default: null },
  finalApproval: { type: finalApprovalSchema, default: null },
  designScopeRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  approvedDesignScopeRevision: { type: Number, default: null, min: 1, validate: (value: unknown) => value == null || Number.isSafeInteger(value) },
  pendingReviewRoundId: { type: String, default: null },
  preparationSnapshotId: { type: String, default: null }
}, { _id: false });

estimationLifecycleSchema.pre("validate", function validateVersionedApproval() {
  if (this.workflowVersion === 2 && this.finalApproval &&
    (!this.finalApproval.designReviewRoundId || !this.finalApproval.designPlanVersion)) {
    this.invalidate("finalApproval", "Version 2 final approval requires its approved design source.");
  }
  if (this.workflowVersion === 3 && !Number.isSafeInteger(this.pricedRevision)) {
    this.invalidate("pricedRevision", "Version 3 requires a priced revision.");
  }
});
