import { model, models, Schema } from "./mongoose.js";
import { EXECUTION_CHOICE_OPTION_IDS, EXECUTION_CHOICE_PHASE_IDS } from "../contracts/project-execution-choice.js";
const executionChoiceSchema = new Schema({
  optionId: { type: String, enum: EXECUTION_CHOICE_OPTION_IDS, required: true },
  definitionVersion: { type: Number, enum: [1], required: true },
  phaseIds: { type: [{ type: String, enum: EXECUTION_CHOICE_PHASE_IDS }], required: true },
  selectedAt: { type: String, required: true }, selectedById: { type: String, required: true },
  historyEventId: { type: String, required: true }, keyCollectionStageId: { type: String, required: true }
}, { _id: false, strict: "throw" });
const designWorkflowStateSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  version: { type: Number, required: true, min: 1 },
  executionChoice: { type: executionChoiceSchema, required: false, default: undefined },
  initialPaymentAt: { type: String, default: null },
  estimationWorkflowVersion: { type: Number, enum: [2, 3] },
  quotationLocked: { type: Boolean },
  designApprovalLocked: { type: Boolean },
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
