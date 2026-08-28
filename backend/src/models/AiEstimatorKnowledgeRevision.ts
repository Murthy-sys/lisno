import {
  AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES,
  AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const findingSchema = new Schema(
  {
    code: { type: String, required: true, maxlength: 96 },
    sectionKey: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, required: true },
    message: { type: String, required: true, maxlength: 500 },
    blocking: { type: Boolean, required: true }
  },
  { _id: false, strict: "throw" }
);

const sectionCompletenessSchema = new Schema(
  {
    sectionKey: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, required: true },
    state: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_COMPLETENESS_STATES, required: true },
    findings: { type: [findingSchema], required: true, default: [] }
  },
  { _id: false, strict: "throw" }
);

const completenessSchema = new Schema(
  {
    percentage: { type: Number, required: true, min: 0, max: 100, validate: Number.isSafeInteger },
    sections: { type: [sectionCompletenessSchema], required: true, default: [] },
    blockers: { type: [findingSchema], required: true, default: [] },
    warnings: { type: [findingSchema], required: true, default: [] }
  },
  { _id: false, strict: "throw" }
);

const revisionSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    mainLineId: { type: String, ref: "AiEstimatorKnowledgeMainLine", required: true, immutable: true },
    revisionNumber: { type: Number, required: true, min: 1, immutable: true, validate: Number.isSafeInteger },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES, required: true, default: "draft" },
    sourceRevisionId: { type: String, ref: "AiEstimatorKnowledgeRevision", default: null, immutable: true },
    contentDigest: { type: String, default: null, match: /^[a-f0-9]{64}$/u },
    completeness: { type: completenessSchema, required: true },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true },
    activatedAt: { type: Date, default: null },
    activatedById: { type: String, ref: "User", default: null },
    supersededAt: { type: Date, default: null },
    supersededById: { type: String, ref: "User", default: null }
  },
  { collection: "aiEstimatorKnowledgeRevisions", timestamps: true, versionKey: false, strict: "throw" }
);

revisionSchema.pre("validate", function validateLifecycleMetadata() {
  const status = this.get("status");
  const activated = this.get("activatedAt") instanceof Date && typeof this.get("activatedById") === "string";
  const superseded = this.get("supersededAt") instanceof Date && typeof this.get("supersededById") === "string";
  if ((status === "draft" && (activated || superseded)) || (status === "active" && (!activated || superseded)) || (status === "superseded" && (!activated || !superseded))) {
    this.invalidate("status", "Revision status and immutable lifecycle metadata are inconsistent.");
  }
  if (status !== "draft" && typeof this.get("contentDigest") !== "string") {
    this.invalidate("contentDigest", "Activated and superseded revisions require a content digest.");
  }
});

revisionSchema.index({ mainLineId: 1, revisionNumber: 1 }, { unique: true });
revisionSchema.index({ mainLineId: 1, status: 1, revisionNumber: -1, _id: 1 });
revisionSchema.index({ status: 1, updatedAt: -1, _id: 1 });

export const AiEstimatorKnowledgeRevisionModel =
  models.AiEstimatorKnowledgeRevision ??
  model("AiEstimatorKnowledgeRevision", revisionSchema);
