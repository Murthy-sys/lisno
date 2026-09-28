import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, min: 1, immutable: true },
  tokenHash: { type: String, required: true, immutable: true },
  recipientEmailHash: { type: String, required: true, immutable: true },
  vendorType: { type: String, enum: ["execution", "supplier"], required: true, immutable: true },
  rubricVersion: { type: Number, required: true, immutable: true },
  rubricGeneration: { type: Number, required: true, min: 0, immutable: true },
  status: { type: String, enum: ["pending", "sent", "failed", "superseded", "consumed"], required: true },
  requestedAt: { type: Date, required: true, immutable: true },
  expiresAt: { type: Date, required: true, immutable: true },
  sentAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null },
  requestedById: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  submissionKey: { type: String, default: null },
  submissionHash: { type: String, default: null },
  receipt: { submittedAt: { type: String }, averageScoreBps: { type: Number } }
}, { collection: "vendorKpiRequests", strict: "throw", versionKey: false });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ vendorId: 1, version: -1 }, { unique: true });
schema.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
export const VendorKpiRequestModel = models.VendorKpiRequest ?? model("VendorKpiRequest", schema);
