import { model, models, Schema } from "./mongoose.js";
/** Append-only operational due-date decisions, separate from issued order terms. */
const schema = new Schema({ _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, orderId: { type: String, required: true, immutable: true }, milestoneId: { type: String, required: true, immutable: true }, orderRevisionId: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, enum: ["proposed", "confirmed"], immutable: true }, dueDate: { type: String, required: true, immutable: true }, originalDueDate: { type: String, default: null, immutable: true }, accountVersion: { type: Number, required: true, immutable: true }, actorId: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true }, reason: { type: String, required: true, immutable: true }
}, { strict: "throw", versionKey: false });
schema.index({ projectId: 1, orderId: 1, milestoneId: 1, accountVersion: 1 }, { unique: true });
export const ProcurementPaymentObligationModel = models.ProcurementPaymentObligation ?? model("ProcurementPaymentObligation", schema);
