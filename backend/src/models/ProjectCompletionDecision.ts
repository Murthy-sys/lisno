import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  expectedAuthorityVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  resultingAuthorityVersion: { type: Number, required: true, min: 2, validate: Number.isSafeInteger, immutable: true },
  approvedRevisionIds: { type: [String], required: true, immutable: true },
  acceptedAssignmentIds: { type: [String], required: true, immutable: true },
  siteCompletionReviewId: { type: String, default: null, immutable: true },
  exceptionIds: { type: [String], required: true, immutable: true },
  sourceLineItemKeys: { type: [String], required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true, ref: "User" },
  decidedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true }
}, { collection: "projectCompletionDecisions", timestamps: false, versionKey: false, strict: "throw" });

schema.index({ projectId: 1 }, { unique: true });
schema.index({ projectId: 1, idempotencyKey: 1 }, { unique: true });

export const ProjectCompletionDecisionModel = models.ProjectCompletionDecision ?? model("ProjectCompletionDecision", schema);
