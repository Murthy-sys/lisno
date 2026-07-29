import { model, models, Schema } from "./mongoose.js";

export const estimateDesignSourcePageSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  uploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  pageNumber: { type: Number, required: true, immutable: true, min: 1 },
  normalizedFileReference: { type: String, required: true, immutable: true },
  width: { type: Number, required: true, immutable: true, min: 1 },
  height: { type: Number, required: true, immutable: true, min: 1 }
}, { timestamps: true, versionKey: false });

estimateDesignSourcePageSchema.index({ uploadId: 1, pageNumber: 1 }, { unique: true });

export const EstimateDesignSourcePageModel = models.EstimateDesignSourcePage ?? model("EstimateDesignSourcePage", estimateDesignSourcePageSchema);
