import {
  AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const taxVersionSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    taxRuleId: { type: String, ref: "AiEstimatorKnowledgeTaxRule", required: true, immutable: true },
    versionNumber: { type: Number, required: true, min: 1, immutable: true, validate: Number.isSafeInteger },
    rateBps: { type: Number, required: true, min: 0, max: AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS * 10, immutable: true, validate: Number.isSafeInteger },
    treatment: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS, required: true, immutable: true },
    applicability: { type: String, required: true, minlength: 1, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT, immutable: true },
    effectiveFrom: { type: Date, required: true, immutable: true },
    // Lifecycle boundary: only the guarded transactional rollover service may
    // close an open-ended version. Financial and start-of-effect fields remain immutable.
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES, required: true, default: "draft" },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true }
  },
  { collection: "aiEstimatorKnowledgeTaxVersions", timestamps: true, versionKey: false, strict: "throw" }
);

taxVersionSchema.pre("validate", function validateWindow() {
  const from = this.get("effectiveFrom");
  const to = this.get("effectiveTo");
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || (to !== null && (!(to instanceof Date) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()))) {
    this.invalidate("effectiveTo", "Tax effective window is invalid.");
  }
});

taxVersionSchema.index({ taxRuleId: 1, versionNumber: 1 }, { unique: true });
taxVersionSchema.index({ taxRuleId: 1, status: 1, effectiveFrom: -1, effectiveTo: 1, _id: 1 });

export const AiEstimatorKnowledgeTaxVersionModel =
  models.AiEstimatorKnowledgeTaxVersion ??
  model("AiEstimatorKnowledgeTaxVersion", taxVersionSchema);
