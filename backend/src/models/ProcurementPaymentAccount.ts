import { model, models, Schema } from "./mongoose.js";
const balance = new Schema({ milestoneId: { type: String, required: true }, amountPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, orderId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }, openingConfirmed: { type: Boolean, required: true }, openingBalances: { type: [balance], default: [] }, openingReconciliationId: { type: String, default: null },
  currentAuthorizationId: { type: String, default: null }, updatedAt: { type: Date, required: true }, updatedById: { type: String, required: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, orderId: 1 }, { unique: true });
export const ProcurementPaymentAccountModel = models.ProcurementPaymentAccount ?? model("ProcurementPaymentAccount", schema);
