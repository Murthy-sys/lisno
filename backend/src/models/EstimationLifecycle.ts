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
  designReviewRoundId: { type: String, required: true },
  designPlanVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  designScopeRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
}, { _id: false });

export const estimationLifecycleSchema = new Schema({
  workflowVersion: { type: Number, enum: [2], required: true },
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
