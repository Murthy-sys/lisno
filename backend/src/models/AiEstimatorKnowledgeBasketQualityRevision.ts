import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { createKnowledgeContentDigest } from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", required: true, immutable: true },
  revisionNumber: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  parameters: { type: Schema.Types.Mixed, required: true, immutable: true },
  contentDigest: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/u },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }
}, { collection: "aiEstimatorKnowledgeBasketQualityRevisions", versionKey: false, strict: "throw" });

schema.pre("validate", function validateChecklist() {
  const issues = validateKnowledgeSectionPayload("quality", { parameters: this.get("parameters") });
  if (issues.length) this.invalidate("parameters", issues.map(({ message }) => message).join(" "));
  if (this.get("contentDigest") !== createKnowledgeContentDigest({ basketId: this.get("basketId"), parameters: this.get("parameters") })) {
    this.invalidate("contentDigest", "Checklist digest must match its Basket and parameters.");
  }
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
  schema.pre(operation, function preventSnapshotChanges() {
    throw new Error("Shared Basket quality revisions are immutable; create a new revision.");
  });
}
schema.pre("save", function preventSavedSnapshotChanges() {
  if (!this.isNew && this.isModified()) throw new Error("Shared Basket quality revisions are immutable; create a new revision.");
});
schema.index({ basketId: 1, revisionNumber: 1 }, { unique: true });

export const AiEstimatorKnowledgeBasketQualityRevisionModel = models.AiEstimatorKnowledgeBasketQualityRevision
  ?? model("AiEstimatorKnowledgeBasketQualityRevision", schema);
