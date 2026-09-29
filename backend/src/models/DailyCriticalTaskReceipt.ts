import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true, ref: "User" },
  localDate: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/u },
  createdAt: { type: Date, required: true, immutable: true },
  acknowledgedAt: { type: Date, default: null }
}, { versionKey: false });

schema.index({ userId: 1, localDate: 1 }, { unique: true });

export const DailyCriticalTaskReceiptModel = models.DailyCriticalTaskReceipt ?? model("DailyCriticalTaskReceipt", schema);
