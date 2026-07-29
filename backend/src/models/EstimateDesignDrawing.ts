import { model, models, Schema } from "./mongoose.js";

const evidenceSchema = new Schema({ value: { type: String, required: true, maxlength: 500 } }, { _id: false, strict: "throw" });

const estimateDesignDrawingSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  uploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  sourcePageId: { type: String, ref: "EstimateDesignSourcePage", required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  active: { type: Boolean, required: true, default: true },
  verified: { type: Boolean, required: true, default: false },
  roomId: { type: String, default: null },
  scopeSectionId: { type: String, default: null },
  detectedTitle: { type: String, required: true, maxlength: 500 },
  displayTitle: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  source: { type: String, required: true, enum: ["ocr", "manual"] },
  roomConfidence: { type: Number, default: null, min: 0, max: 1 },
  scopeConfidence: { type: Number, default: null, min: 0, max: 1 },
  ocrConfidence: { type: Number, default: null, min: 0, max: 1 },
  roomEvidence: { type: [evidenceSchema], default: [] },
  scopeEvidence: { type: [evidenceSchema], default: [] }
}, { timestamps: true, versionKey: false });

estimateDesignDrawingSchema.index({ estimateId: 1, active: 1, _id: 1 });
estimateDesignDrawingSchema.index({ uploadId: 1, sourcePageId: 1 });

export const EstimateDesignDrawingModel = models.EstimateDesignDrawing ?? model("EstimateDesignDrawing", estimateDesignDrawingSchema);
