import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  status: { type: String, required: true, enum: ["pending", "deleted"], default: "pending" },
  attempts: { type: Number, required: true, min: 0, default: 0 },
  retryAt: { type: Date, required: true },
  lastErrorCode: { type: String, default: null, maxlength: 100 }
}, { collection: "vendorWorkImageCleanupJobs", timestamps: true, versionKey: false, strict: "throw" });

schema.index({ status: 1, retryAt: 1 });

export const VendorWorkImageCleanupJobModel = models.VendorWorkImageCleanupJob ?? model("VendorWorkImageCleanupJob", schema);
