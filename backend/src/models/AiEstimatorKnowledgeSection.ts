import {
  AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  type KnowledgeSectionKey
} from "../domain/ai-estimator-knowledge.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { model, models, Schema } from "./mongoose.js";

const sectionSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    mainLineId: { type: String, ref: "AiEstimatorKnowledgeMainLine", required: true, immutable: true },
    revisionId: { type: String, ref: "AiEstimatorKnowledgeRevision", required: true, immutable: true },
    sectionKey: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, required: true, immutable: true },
    applicability: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY, required: true, default: "not_configured" },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true }
  },
  { collection: "aiEstimatorKnowledgeSections", timestamps: true, versionKey: false, strict: "throw" }
);

sectionSchema.pre("validate", function validatePayload() {
  const sectionKey = this.get("sectionKey") as KnowledgeSectionKey;
  const issues = validateKnowledgeSectionPayload(sectionKey, this.get("payload"));
  if (issues.length > 0) {
    this.invalidate("payload", issues.map((issue) => issue.message).join(" "));
  }
});

sectionSchema.index({ revisionId: 1, sectionKey: 1 }, { unique: true });
sectionSchema.index({ mainLineId: 1, revisionId: 1, sectionKey: 1, _id: 1 });

export const AiEstimatorKnowledgeSectionModel =
  models.AiEstimatorKnowledgeSection ??
  model("AiEstimatorKnowledgeSection", sectionSchema);
