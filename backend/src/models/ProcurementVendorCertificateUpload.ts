import { model, models, Schema } from "./mongoose.js";

// Intent and target are durable before storage I/O. No TTL removes cleanup evidence.
const uploadSchema = new Schema({
  _id: { type: String, required: true }, uploadId: { type: String, required: true }, certificateId: { type: String, required: true },
  actorId: { type: String, required: true }, vendorId: { type: String, default: null },
  expectedVersion: { type: Number, default: null }, fingerprint: { type: String, required: true },
  status: { type: String, required: true, enum: ["uploading", "ready", "consumed", "failed", "expired"] },
  generation: { type: Number, required: true, min: 1 }, storageReference: { type: String, required: true },
  expiresAt: { type: Date, required: true }, originalFilename: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"] },
  byteSize: { type: Number, required: true, min: 1 }, sha256: { type: String, required: true },
  uploadedAt: { type: String, default: null }, consumedByVendorId: { type: String, default: null }
}, { collection: "procurementVendorCertificateUploads", timestamps: true, versionKey: false, strict: "throw" });
uploadSchema.index({ uploadId: 1 }, { unique: true });
uploadSchema.index({ status: 1, expiresAt: 1 });

const cleanupSchema = new Schema({
  _id: { type: String, required: true }, vendorId: { type: String, default: null },
  status: { type: String, required: true, enum: ["pending", "deleted"], default: "pending" },
  attempts: { type: Number, required: true, default: 0 }, retryAt: { type: Date, required: true },
  lastError: { type: String, enum: ["STORAGE_DELETE_FAILED", null], default: null }
}, { collection: "procurementVendorCertificateCleanup", timestamps: true, versionKey: false, strict: "throw" });
cleanupSchema.index({ status: 1, retryAt: 1 });

export const ProcurementVendorCertificateUploadModel = models.ProcurementVendorCertificateUpload ?? model("ProcurementVendorCertificateUpload", uploadSchema);
export const ProcurementVendorCertificateCleanupModel = models.ProcurementVendorCertificateCleanup ?? model("ProcurementVendorCertificateCleanup", cleanupSchema);
