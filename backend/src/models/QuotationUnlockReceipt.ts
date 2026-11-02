import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true, minlength: 8, maxlength: 128 },
  expectedVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  reviewRoundId: { type: String, required: true, immutable: true },
  reason: { type: String, required: true, immutable: true, maxlength: 1000 },
  resultVersion: { type: Number, required: true, immutable: true, min: 1, validate: Number.isSafeInteger },
  occurredAt: { type: Date, required: true, immutable: true }
}, { versionKey: false, strict: "throw" });
schema.index({ estimateId: 1, idempotencyKey: 1 }, { unique: true });
export const QuotationUnlockReceiptModel = models.QuotationUnlockReceipt ?? model("QuotationUnlockReceipt", schema);
