import { annotationDocumentSchema } from "../domain/estimate-design.js";
import { model, models, Schema } from "./mongoose.js";

export const estimatePlanAnnotationDraftSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  clientId: { type: String, ref: "User", required: true, immutable: true },
  version: { type: Number, required: true, min: 1 },
  annotations: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true, versionKey: false, strict: "throw" });

estimatePlanAnnotationDraftSchema.pre("validate", function validateAnnotations() {
  annotationDocumentSchema.parse(this.get("annotations"));
});
estimatePlanAnnotationDraftSchema.index({ clientId: 1, sourcePageId: 1 }, { unique: true });

export const EstimatePlanAnnotationDraftModel = models.EstimatePlanAnnotationDraft ??
  model("EstimatePlanAnnotationDraft", estimatePlanAnnotationDraftSchema);
