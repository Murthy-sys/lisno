import { model, models, Schema } from "./mongoose.js";
import { estimateDesignExtractionStatuses } from "../domain/estimate-design.js";

export const estimateDesignExtractionJobSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  uploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  status: { type: String, required: true, enum: estimateDesignExtractionStatuses },
  attemptCount: { type: Number, required: true, min: 0 },
  queuedAt: { type: Date, required: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  leaseExpiresAt: { type: Date, default: null },
  claimId: { type: String, default: null, maxlength: 128 },
  failureCode: { type: String, default: null, maxlength: 64 },
  failureMessage: { type: String, default: null, maxlength: 500 },
  workerResultId: { type: String, default: null, maxlength: 128 }
}, { timestamps: true, versionKey: false });

estimateDesignExtractionJobSchema.index({ uploadId: 1 }, { unique: true });
estimateDesignExtractionJobSchema.index({ status: 1, leaseExpiresAt: 1, queuedAt: 1 });

export const EstimateDesignExtractionJobModel = models.EstimateDesignExtractionJob ?? model("EstimateDesignExtractionJob", estimateDesignExtractionJobSchema);
