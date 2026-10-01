import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
  sourceUploadId: { type: String, ref: "EstimateDesignUpload", required: true, immutable: true },
  manifestHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  rendererVersion: { type: Number, required: true, immutable: true },
  manifest: { type: Schema.Types.Mixed, required: true, immutable: true, select: false },
  status: { type: String, enum: ["preparing", "ready", "failed"], required: true },
  attemptToken: { type: String, default: null, select: false },
  attemptExpiresAt: { type: Date, default: null },
  filename: { type: String, required: true },
  storageReference: { type: String, default: null, select: false },
  sha256: { type: String, default: null },
  byteSize: { type: Number, default: null },
  pageCount: { type: Number, required: true, min: 1 },
  failureCode: { type: String, default: null },
  failureMessage: { type: String, default: null },
  createdById: { type: String, required: true, immutable: true }
}, { timestamps: true, versionKey: false, strict: "throw" });

schema.index({ estimateId: 1, sourceUploadId: 1, manifestHash: 1, rendererVersion: 1 }, { unique: true });
schema.index({ estimateId: 1, status: 1 });

export const EstimateDesignPlanDocumentModel = models.EstimateDesignPlanDocument ?? model("EstimateDesignPlanDocument", schema);
