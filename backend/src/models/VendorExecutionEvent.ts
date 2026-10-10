import { model, models, Schema } from "./mongoose.js";

/** Append-only command journal. The unique request key is also the transaction receipt. */
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, assignmentId: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true }, action: { type: String, required: true, immutable: true }, occurredAt: { type: Date, required: true, immutable: true },
  localDate: { type: String, required: true, immutable: true }, timezone: { type: String, required: true, immutable: true }, executionRound: { type: Number, required: true, immutable: true },
  version: { type: Number, required: true, immutable: true }, idempotencyKey: { type: String, required: true, immutable: true }, requestDigest: { type: String, required: true, immutable: true },
  note: { type: String, default: "", maxlength: 2_000, immutable: true }, reason: { type: String, default: null, maxlength: 2_000, immutable: true }, nextAction: { type: String, default: null, maxlength: 2_000, immutable: true },
  progress: { type: Number, default: null, immutable: true }, status: { type: String, default: null, immutable: true }, imageIds: { type: [String], default: [], immutable: true },
  startDate: { type: String, default: null, immutable: true }, finishDate: { type: String, default: null, immutable: true }, reviewDate: { type: String, default: null, immutable: true }, submissionId: { type: String, default: null, immutable: true }
}, { collection: "vendorExecutionEvents", timestamps: false, versionKey: false, strict: "throw" });
schema.index({ assignmentId: 1, actorId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ assignmentId: 1, occurredAt: -1, version: -1, _id: -1 });
schema.index({ assignmentId: 1, action: 1, localDate: 1, occurredAt: 1 });
export const VendorExecutionEventModel = models.VendorExecutionEvent ?? model("VendorExecutionEvent", schema);
