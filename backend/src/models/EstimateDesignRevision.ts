import { model, models, Schema } from "./mongoose.js";

const cropSchema = new Schema({
  x: { type: Number, required: true, min: 0 },
  y: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 1 },
  height: { type: Number, required: true, min: 1 }
}, { _id: false, strict: "throw" });

export const estimateDesignRevisionSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  drawingId: { type: String, ref: "EstimateDesignDrawing", required: true, immutable: true },
  revisionNumber: { type: Number, required: true, immutable: true, min: 1 },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  crop: { type: cropSchema, required: true, immutable: true },
  croppedFileReference: { type: String, required: true, immutable: true },
  roomId: { type: String, required: true, immutable: true },
  scopeSectionId: { type: String, required: true, immutable: true },
  label: { type: String, required: true, immutable: true, trim: true, minlength: 1, maxlength: 500 },
  reviewStatus: { type: String, required: true, enum: ["draft", "submitted", "approved", "changes_requested"] },
  submittedAt: { type: Date, default: null },
  reviewerId: { type: String, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  changeSummary: { type: String, default: null, maxlength: 1_000 },
  annotationLayerId: { type: String, ref: "EstimateDesignAnnotationDraft", default: null },
  replacesRevisionId: { type: String, ref: "EstimateDesignRevision", default: null, immutable: true }
}, { timestamps: true, versionKey: false });

estimateDesignRevisionSchema.index({ drawingId: 1, revisionNumber: 1 }, { unique: true });

export const EstimateDesignRevisionModel = models.EstimateDesignRevision ?? model("EstimateDesignRevision", estimateDesignRevisionSchema);
