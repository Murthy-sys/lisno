import {
  AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const mainLineSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", required: true, immutable: true },
    name: { type: String, required: true, minlength: 1, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    nameNormalized: { type: String, required: true, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    description: { type: String, default: null, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT },
    displayOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES, required: true, default: "draft" },
    activeRevisionId: { type: String, ref: "AiEstimatorKnowledgeRevision", default: null },
    draftRevisionId: { type: String, ref: "AiEstimatorKnowledgeRevision", default: null },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedById: { type: String, ref: "User", default: null },
    archivedAt: { type: Date, default: null },
    archivedById: { type: String, ref: "User", default: null }
  },
  { collection: "aiEstimatorKnowledgeMainLines", timestamps: true, versionKey: false, strict: "throw" }
);

mainLineSchema.pre("validate", function normalizeIdentity() {
  const name = this.get("name");
  if (typeof name === "string") {
    const trimmed = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    this.set("name", trimmed);
    this.set("nameNormalized", normalizeKnowledgeIdentity(trimmed));
  }
  const archived = this.get("status") === "archived";
  if (archived !== (this.get("archivedAt") instanceof Date)) {
    this.invalidate("archivedAt", "Archived status and archive timestamp must agree.");
  }
  if (archived !== (typeof this.get("archivedById") === "string")) {
    this.invalidate("archivedById", "Archived status and archive actor must agree.");
  }
});

mainLineSchema.index(
  { basketId: 1, nameNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["draft", "active", "inactive"] } }
  }
);
mainLineSchema.index({ basketId: 1, status: 1, displayOrder: 1, _id: 1 });
mainLineSchema.index({ status: 1, updatedAt: -1, _id: 1 });
mainLineSchema.index({ activeRevisionId: 1 }, { sparse: true });
mainLineSchema.index({ draftRevisionId: 1 }, { sparse: true });

export const AiEstimatorKnowledgeMainLineModel =
  models.AiEstimatorKnowledgeMainLine ??
  model("AiEstimatorKnowledgeMainLine", mainLineSchema);
