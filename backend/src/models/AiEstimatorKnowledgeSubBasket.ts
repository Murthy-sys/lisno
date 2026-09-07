import { AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT, normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const subBasketSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", required: true, immutable: true },
  name: { type: String, required: true, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
  nameNormalized: { type: String, required: true },
  displayOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  updatedById: { type: String, ref: "User", required: true }
}, { collection: "aiEstimatorKnowledgeSubBaskets", timestamps: true, versionKey: false, strict: "throw" });

subBasketSchema.pre("validate", function normalizeIdentity() {
  const name = this.get("name");
  if (typeof name === "string") {
    const trimmed = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    this.set("name", trimmed);
    this.set("nameNormalized", normalizeKnowledgeIdentity(trimmed));
  }
});
subBasketSchema.index({ basketId: 1, nameNormalized: 1 }, { unique: true });
subBasketSchema.index({ basketId: 1, displayOrder: 1, _id: 1 });

export const AiEstimatorKnowledgeSubBasketModel = models.AiEstimatorKnowledgeSubBasket ??
  model("AiEstimatorKnowledgeSubBasket", subBasketSchema);
