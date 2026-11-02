import { model, models, Schema } from "./mongoose.js";

const digest = { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ };
const positive = { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger };
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  reviewRoundId: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: positive,
  policyVersion: positive,
  visibilityDigest: digest,
  sourceDigest: digest,
  approvedTotalPaise: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  filename: { type: String, required: true, immutable: true },
  mimeType: { type: String, enum: ["application/pdf"], required: true, immutable: true },
  byteSize: positive,
  sha256: digest,
  storageReference: { type: String, required: true, immutable: true, select: false },
  createdAt: { type: Date, required: true, immutable: true }
}, { versionKey: false });

schema.index({ reviewRoundId: 1, visibilityDigest: 1, policyVersion: 1 }, { unique: true });

export const ClientQuotationRenditionModel = models.ClientQuotationRendition ?? model("ClientQuotationRendition", schema);
