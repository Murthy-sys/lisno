import { model, models, Schema } from "./mongoose.js";

const id = { type: String, required: true, immutable: true };
const vendorId = { type: String, required: true, immutable: true };
const version = { type: Number, required: true, min: 1, immutable: true };
const actorId = { type: String, required: true, immutable: true };
const key = { type: String, required: true, immutable: true };
const vendorType = { type: String, enum: ["execution", "supplier"], required: true, immutable: true };
const questions = { type: [Schema.Types.Mixed], required: true, immutable: true };

const draft = new Schema({ _id: id, vendorId, version, vendorType, questions,
  updatedAt: { type: Date, required: true, immutable: true }, actorId, idempotencyKey: key,
  payloadHash: key }, { collection: "vendorInductionDrafts", strict: "throw", versionKey: false });
draft.index({ vendorId: 1, version: -1 }, { unique: true });
draft.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
export const VendorInductionDraftModel = models.VendorInductionDraft ?? model("VendorInductionDraft", draft);

const questionnaire = new Schema({ _id: id, vendorId, version,
  draftVersion: { type: Number, required: true, min: 1, immutable: true }, vendorType, questions,
  questionHash: key, publishedAt: { type: Date, required: true, immutable: true }, actorId,
  idempotencyKey: key }, { collection: "vendorInductionQuestionnaires", strict: "throw", versionKey: false });
questionnaire.index({ vendorId: 1, version: -1 }, { unique: true });
questionnaire.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
export const VendorInductionQuestionnaireModel = models.VendorInductionQuestionnaire ?? model("VendorInductionQuestionnaire", questionnaire);

const request = new Schema({ _id: id, vendorId, version,
  questionnaireId: id, questionnaireVersion: { type: Number, required: true, min: 1, immutable: true },
  questionnairePublishedAt: { type: Date, required: true, immutable: true },
  questionHash: key, questions, vendorType,
  tokenHash: key, recipientEmailHash: key,
  status: { type: String, enum: ["pending", "sent", "failed", "superseded", "consumed"], required: true },
  requestedAt: { type: Date, required: true, immutable: true }, expiresAt: { type: Date, required: true, immutable: true },
  sentAt: { type: Date, default: null }, consumedAt: { type: Date, default: null },
  requestedById: actorId, idempotencyKey: key, changeNote: { type: String, default: null, immutable: true },
  submissionKey: { type: String, default: null }, submissionHash: { type: String, default: null },
  receipt: { submittedAt: { type: String } }
}, { collection: "vendorInductionRequests", strict: "throw", versionKey: false });
request.index({ tokenHash: 1 }, { unique: true });
request.index({ vendorId: 1, version: -1 }, { unique: true });
request.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
export const VendorInductionRequestModel = models.VendorInductionRequest ?? model("VendorInductionRequest", request);

const submission = new Schema({ _id: id, vendorId, requestId: id,
  questionnaireVersion: { type: Number, required: true, min: 1, immutable: true },
  vendorType, questionnaire: { type: Schema.Types.Mixed, required: true, immutable: true },
  answers: { type: [Schema.Types.Mixed], required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: key, payloadHash: key
}, { collection: "vendorInductionSubmissions", strict: "throw", versionKey: false });
submission.index({ requestId: 1 }, { unique: true });
submission.index({ vendorId: 1, submittedAt: -1 });
export const VendorInductionSubmissionModel = models.VendorInductionSubmission ?? model("VendorInductionSubmission", submission);

const review = new Schema({ _id: id, vendorId, version, submissionId: id, vendorType,
  decision: { type: String, enum: ["approved", "changes_requested", "reopened"], required: true, immutable: true },
  reason: { type: String, default: null, immutable: true }, actorId,
  reviewedAt: { type: Date, required: true, immutable: true }, idempotencyKey: key,
  payloadHash: key
}, { collection: "vendorInductionReviews", strict: "throw", versionKey: false });
review.index({ vendorId: 1, version: -1 }, { unique: true });
review.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
export const VendorInductionReviewModel = models.VendorInductionReview ?? model("VendorInductionReview", review);
