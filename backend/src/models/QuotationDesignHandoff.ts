import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateReviewRoundId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  designReviewRoundId: { type: String, required: true, immutable: true },
  designPlanVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  designScopeRevision: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  actorId: { type: String, required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true }
}, { versionKey: false, strict: "throw" });
schema.index({ estimateId: 1, estimateReviewRoundId: 1, designReviewRoundId: 1 }, { unique: true });
export const QuotationDesignHandoffModel = models.QuotationDesignHandoff ?? model("QuotationDesignHandoff", schema);
