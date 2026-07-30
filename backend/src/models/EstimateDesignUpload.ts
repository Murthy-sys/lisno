import { model, models, Schema } from "./mongoose.js";
import { estimateDesignExtractionStatuses } from "../domain/estimate-design.js";

const estimateDesignUploadSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  leadId: { type: String, ref: "Lead", required: true, immutable: true },
  originalFilename: { type: String, required: true, immutable: true, maxlength: 255 },
  storedFileReference: { type: String, required: true, immutable: true },
  mimeType: { type: String, required: true, immutable: true, enum: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff", "image/heic"] },
  sizeBytes: { type: Number, required: true, immutable: true, min: 0 },
  uploaderId: { type: String, ref: "User", required: true, immutable: true },
  uploadedAt: { type: Date, required: true, immutable: true },
  extractionStatus: { type: String, required: true, enum: estimateDesignExtractionStatuses },
  replacementDrawingId: { type: String, ref: "EstimateDesignDrawing", default: null, immutable: true },
  replacesRevisionId: { type: String, ref: "EstimateDesignRevision", default: null, immutable: true },
  replacementVersion: { type: Number, default: null, min: 1, immutable: true },
  failureCode: { type: String, default: null, maxlength: 64 },
  failureMessage: { type: String, default: null, maxlength: 500 }
}, { timestamps: true, versionKey: false });

estimateDesignUploadSchema.index({ estimateId: 1, uploadedAt: -1, _id: -1 });

export const EstimateDesignUploadModel = models.EstimateDesignUpload ?? model("EstimateDesignUpload", estimateDesignUploadSchema);
