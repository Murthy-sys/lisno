import { model, models, Schema } from "./mongoose.js";
const designWorkflowStateSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  version: { type: Number, required: true, min: 1 },
  initialPaymentAt: { type: String, default: null },
  estimationWorkflowVersion: { type: Number, enum: [2] },
  designStartedAt: { type: String },
  initialPaymentEstimateId: { type: String },
  initialPaymentEstimateVersion: { type: Number, min: 1 },
  initialPaymentReviewRoundId: { type: String },
  initialPaymentDesignReviewRoundId: { type: String },
  stages: { type: Schema.Types.Mixed, required: true },
  pauses: { type: [Schema.Types.Mixed], required: true },
  history: { type: [Schema.Types.Mixed], required: true, select: false }
}, { versionKey: false, strict: "throw", minimize: false });
designWorkflowStateSchema.index({ projectId: 1 }, { unique: true });
export const DesignWorkflowStateModel = models.DesignWorkflowState ?? model("DesignWorkflowState", designWorkflowStateSchema);
