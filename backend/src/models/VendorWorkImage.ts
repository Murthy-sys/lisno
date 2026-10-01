import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  assignmentId: { type: String, required: true, immutable: true },
  round: { type: Number, required: true, min: 1, immutable: true },
  storageReference: { type: String, required: true, immutable: true },
  originalFilename: { type: String, required: true, maxlength: 255, immutable: true },
  mimeType: { type: String, required: true, enum: ["image/jpeg", "image/png", "image/webp"], immutable: true },
  byteSize: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  uploadedAt: { type: Date, required: true, immutable: true },
  uploadedById: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true }
}, { collection: "vendorWorkImages", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ assignmentId: 1, round: 1, uploadedAt: 1 });
schema.index({ assignmentId: 1, uploadedById: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ storageReference: 1 }, { unique: true });

export const VendorWorkImageModel = models.VendorWorkImage ?? model("VendorWorkImage", schema);
