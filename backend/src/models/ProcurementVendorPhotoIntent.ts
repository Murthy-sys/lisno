import { model, models, Schema } from "./mongoose.js";

// A target is recorded before bytes are written. Failed/expired targets remain recoverable.
const intentSchema = new Schema({
  _id: { type: String, required: true }, vendorId: { type: String, required: true },
  actorId: { type: String, required: true }, fingerprint: { type: String, required: true },
  status: { type: String, required: true, enum: ["uploading", "committed", "failed"] },
  generation: { type: Number, required: true, min: 1 }, storageReference: { type: String, required: true },
  expiresAt: { type: Date, required: true }, resultVersion: { type: Number, default: null },
  photoId: { type: String, required: true }, mimeType: { type: String, required: true },
  byteSize: { type: Number, required: true }, uploadedAt: { type: String, default: null }
}, { collection: "procurementVendorPhotoIntents", timestamps: true, versionKey: false, strict: "throw" });
intentSchema.index({ status: 1, expiresAt: 1 });

const cleanupSchema = new Schema({
  _id: { type: String, required: true }, vendorId: { type: String, required: true },
  status: { type: String, required: true, enum: ["pending", "deleted"], default: "pending" },
  attempts: { type: Number, required: true, default: 0 }, retryAt: { type: Date, required: true },
  lastError: { type: String, enum: ["STORAGE_DELETE_FAILED", null], default: null }
}, { collection: "procurementVendorPhotoCleanup", timestamps: true, versionKey: false, strict: "throw" });
cleanupSchema.index({ status: 1, retryAt: 1 });

export const ProcurementVendorPhotoIntentModel = models.ProcurementVendorPhotoIntent ?? model("ProcurementVendorPhotoIntent", intentSchema);
export const ProcurementVendorPhotoCleanupModel = models.ProcurementVendorPhotoCleanup ?? model("ProcurementVendorPhotoCleanup", cleanupSchema);
