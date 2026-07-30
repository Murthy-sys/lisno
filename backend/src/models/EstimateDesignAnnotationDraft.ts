import { annotationDocumentSchema } from "../domain/estimate-design.js";
import { model, models, Schema } from "./mongoose.js";

export const estimateDesignAnnotationDraftSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  revisionId: {
    type: String,
    ref: "EstimateDesignRevision",
    required: true,
    immutable: true
  },
  clientId: { type: String, ref: "User", required: true, immutable: true },
  version: { type: Number, required: true, min: 1 },
  annotations: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true, versionKey: false, strict: "throw" });

estimateDesignAnnotationDraftSchema.pre("validate", function validateAnnotation() {
  annotationDocumentSchema.parse(this.get("annotations"));
});
estimateDesignAnnotationDraftSchema.index(
  { revisionId: 1, clientId: 1 },
  { unique: true }
);

export const EstimateDesignAnnotationDraftModel =
  models.EstimateDesignAnnotationDraft ??
  model("EstimateDesignAnnotationDraft", estimateDesignAnnotationDraftSchema);
