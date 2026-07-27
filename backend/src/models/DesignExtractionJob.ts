import { model, models, Schema } from "./mongoose.js";

const designExtractionJobSchema = new Schema(
  {
    _id: { type: String, required: true },
    designVersionId: { type: String, ref: "DesignVersion", required: true },
    status: {
      type: String,
      enum: [
        "queued",
        "processing",
        "designer_review",
        "submitted",
        "changes_requested",
        "approved",
        "processing_failed"
      ],
      required: true
    },
    attemptCount: { type: Number, required: true, min: 0 },
    queuedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    leaseExpiresAt: { type: Date, default: null },
    failureCode: { type: String, default: null, maxlength: 64 },
    failureMessage: { type: String, default: null, maxlength: 500 },
    workerResultId: { type: String, default: null, maxlength: 128 }
  },
  { timestamps: true, versionKey: false }
);

designExtractionJobSchema.index({ designVersionId: 1 }, { unique: true });
designExtractionJobSchema.index({ status: 1, leaseExpiresAt: 1, queuedAt: 1 });

export const DesignExtractionJobModel =
  models.DesignExtractionJob ?? model("DesignExtractionJob", designExtractionJobSchema);
