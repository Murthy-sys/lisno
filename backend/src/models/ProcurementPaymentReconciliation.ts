import { model, models, Schema } from "./mongoose.js";
const balance = new Schema({ milestoneId: { type: String, required: true, immutable: true }, amountPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true } }, { _id: false, strict: "throw" });
const bound = new Schema({ milestoneId: { type: String, required: true, immutable: true }, maxPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true } }, { _id: false, strict: "throw" });
const schema = new Schema({ _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, orderId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true }, orderRevisionId: { type: String, required: true, immutable: true }, balances: { type: [balance], required: true, immutable: true }, actorId: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true }, evidenceIds: { type: [String], required: true, immutable: true }, reason: { type: String, required: true, immutable: true },
  supersedesReconciliationId: { type: String, default: null, immutable: true }, bounds: { type: [bound], required: true, immutable: true }, sourceDigest: { type: String, required: true, immutable: true }, accountVersion: { type: Number, required: true, min: 1, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, orderId: 1, supersedesReconciliationId: 1 }, { unique: true });
schema.index({ projectId: 1, orderId: 1, occurredAt: -1, _id: 1 });
export const ProcurementPaymentReconciliationModel = models.ProcurementPaymentReconciliation ?? model("ProcurementPaymentReconciliation", schema);
