import { model, models, Schema } from "./mongoose.js";
const decision = new Schema({ slot: { type: String, required: true }, actorId: { type: String, required: true }, outcome: { type: String, enum: ["certify", "reject"], required: true },
  reason: { type: String, required: true }, evidenceIds: { type: [String], default: [] }, at: { type: Date, required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  vendorName: { type: String, required: true, immutable: true },
  orderId: { type: String, required: true, immutable: true }, orderRevisionId: { type: String, required: true, immutable: true }, proposalRevisionId: { type: String, required: true, immutable: true },
  milestoneId: { type: String, required: true, immutable: true }, milestoneName: { type: String, required: true, immutable: true },
  amountPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  sourceToken: { type: String, required: true, immutable: true }, requiredSlots: { type: [String], required: true, immutable: true },
  reviewerIds: { type: Schema.Types.Mixed, required: true, immutable: true }, reason: { type: String, required: true, immutable: true },
  evidenceIds: { type: [String], default: [], immutable: true }, decisions: { type: [decision], default: [] },
  status: { type: String, required: true, enum: ["requested", "partially_certified", "certified", "rejected"] }, version: { type: Number, required: true, min: 1 },
  createdById: { type: String, required: true, immutable: true }, createdAt: { type: Date, required: true, immutable: true }
}, { versionKey: false, strict: "throw" });
schema.index({ projectId: 1, orderRevisionId: 1, milestoneId: 1 }, { unique: true });
schema.index({ projectId: 1, vendorId: 1, createdAt: -1 });
export const ProjectPaymentCertificationModel = models.ProjectPaymentCertification ?? model("ProjectPaymentCertification", schema);
