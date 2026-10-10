import { model, models, Schema } from "./mongoose.js";

const decision = new Schema({ outcome: { type: String, required: true, enum: ["verified", "changes_requested"] }, actorId: { type: String, required: true }, decidedAt: { type: Date, required: true }, reason: { type: String, default: null }, idempotencyKey: { type: String, required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, assignmentId: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  executionRound: { type: Number, required: true, immutable: true }, submissionVersion: { type: Number, required: true, immutable: true }, submittedById: { type: String, required: true, immutable: true }, submittedAt: { type: Date, required: true, immutable: true },
  note: { type: String, required: true, maxlength: 2_000, immutable: true }, imageIds: { type: [String], required: true, immutable: true }, evidenceExemptionReason: { type: String, default: null, immutable: true }, evidenceExemptionGrantedById: { type: String, default: null, immutable: true },
  decision: { type: decision, default: null }
}, { collection: "vendorExecutionReviews", timestamps: false, versionKey: false, strict: "throw" });
schema.index({ assignmentId: 1, executionRound: 1 }, { unique: true });
schema.index({ projectId: 1, submittedAt: 1 });
export const VendorExecutionReviewModel = models.VendorExecutionReview ?? model("VendorExecutionReview", schema);
