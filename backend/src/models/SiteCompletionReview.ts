import { model, models, Schema } from "./mongoose.js";

const sectionSchema = new Schema({
  assignmentId: { type: String, required: true, immutable: true },
  sourceSectionId: { type: String, required: true, immutable: true },
  sectionLabel: { type: String, required: true, immutable: true },
  roomName: { type: String, required: true, immutable: true },
  itemName: { type: String, required: true, immutable: true },
  scopeType: { type: String, required: true, immutable: true },
  imageIds: { type: [String], required: true, immutable: true }
}, { _id: false, strict: "throw" });

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
  clientId: { type: String, required: true, immutable: true, ref: "User" },
  managerId: { type: String, required: true, immutable: true, ref: "User" },
  round: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  approvedRevisionIds: { type: [String], required: true, immutable: true },
  sourceLineItemKeys: { type: [String], required: true, immutable: true },
  sections: { type: [sectionSchema], required: true, immutable: true },
  progress: { type: Number, required: true, min: 0, max: 100, immutable: true },
  note: { type: String, default: "", maxlength: 2_000, validate: (value: unknown) => typeof value === "string", immutable: true },
  submittedById: { type: String, required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  submitKey: { type: String, required: true, immutable: true },
  submitDigest: { type: String, required: true, immutable: true },
  status: { type: String, required: true, enum: ["pending", "approved", "changes_requested"] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  decision: { type: decisionSchema, default: null }
}, { collection: "siteCompletionReviews", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ projectId: 1, round: 1 }, { unique: true });
schema.index({ projectId: 1, submitKey: 1 }, { unique: true });
schema.index({ projectId: 1, clientId: 1, status: 1 });
export const SiteCompletionReviewModel = models.SiteCompletionReview ?? model("SiteCompletionReview", schema);
