import { model, models, Schema } from "./mongoose.js";

const decisionSchema = new Schema({
  decision: { type: String, required: true, enum: ["approve", "request_changes"], immutable: true },
  reason: { type: String, default: null, maxlength: 2_000, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  decidedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true }
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  vendorId: { type: String, required: true, immutable: true },
  assignmentId: { type: String, required: true, immutable: true },
  clientId: { type: String, required: true, immutable: true, ref: "User" },
  round: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  assignmentVersionAtSubmit: { type: Number, required: true, min: 1, immutable: true },
  note: { type: String, required: true, maxlength: 2_000, immutable: true },
  progress: { type: Number, required: true, min: 0, max: 100, immutable: true },
  imageIds: { type: [String], required: true, immutable: true },
  submittedById: { type: String, required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  status: { type: String, required: true, enum: ["pending", "approved", "changes_requested"] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  executionVerificationId: { type: String, default: null, immutable: true },
  executionRound: { type: Number, default: null, immutable: true },
  executionSubmissionVersion: { type: Number, default: null, immutable: true },
  decision: { type: decisionSchema, default: null }
}, { collection: "vendorWorkReviews", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ assignmentId: 1, round: 1 }, { unique: true });
schema.index({ projectId: 1, clientId: 1, status: 1, submittedAt: -1 });

export const VendorWorkReviewModel = models.VendorWorkReview ?? model("VendorWorkReview", schema);
