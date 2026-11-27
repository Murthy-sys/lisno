import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({ _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, orderId: { type: String, required: true, immutable: true }, transactionId: { type: String, required: true, immutable: true }, kind: { type: String, required: true, enum: ["reversal", "request", "resolved", "rejected"], immutable: true }, requestId: { type: String, default: null, immutable: true }, actorId: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true }, reason: { type: String, required: true, immutable: true }, accountVersion: { type: Number, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, transactionId: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: "reversal" } });
schema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string" } } });
schema.index({ projectId: 1, orderId: 1, occurredAt: -1 });
export const ProcurementPaymentCorrectionModel = models.ProcurementPaymentCorrection ?? model("ProcurementPaymentCorrection", schema);
