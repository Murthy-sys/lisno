import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  sourceSectionId: { type: String, required: true, immutable: true },
  sourceLineItemKey: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, enum: ["not_applicable", "externally_fulfilled"], immutable: true },
  reason: { type: String, required: true, minlength: 10, maxlength: 2_000, immutable: true },
  expectedAuthorityVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  resultingAuthorityVersion: { type: Number, required: true, min: 2, validate: Number.isSafeInteger, immutable: true },
  actorId: { type: String, required: true, immutable: true, ref: "User" },
  recordedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true }
}, { collection: "projectScopeExceptions", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, sourceLineItemKey: 1 }, { unique: true });
schema.index({ projectId: 1, idempotencyKey: 1 }, { unique: true });

export const ProjectScopeExceptionModel = models.ProjectScopeException ?? model("ProjectScopeException", schema);
