import { model, models, Schema } from "./mongoose.js";
import { ESTIMATE_CLIENT_SHA256 } from "../domain/estimate-client-review.js";

const attachmentSchema = new Schema(
  {
    uploadId: { type: String, required: true, immutable: true },
    filename: { type: String, required: true, immutable: true },
    mimeType: { type: String, required: true, immutable: true },
    byteSize: { type: Number, required: true, min: 1, immutable: true },
    sha256: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    storageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    }
  },
  { _id: false, strict: "throw" }
);

const designPlanReviewRoundSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
    projectId: { type: String, ref: "Project", required: true, immutable: true },
    leadId: { type: String, ref: "Lead", required: true, immutable: true },
    designPlanVersion: { type: Number, required: true, min: 1, immutable: true },
    recipientEmail: { type: String, required: true, immutable: true },
    clientName: { type: String, required: true, immutable: true },
    projectName: { type: String, required: true, immutable: true },
    submittedRevisionIds: {
      type: [String],
      required: true,
      immutable: true,
      validate: {
        validator: (value: unknown[]) => value.length > 0,
        message: "A Design review requires submitted revisions."
      }
    },
    attachments: {
      type: [attachmentSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (value: unknown[]) => value.length > 0,
        message: "A Design review requires at least one attachment."
      }
    },
    submittedById: { type: String, ref: "User", required: true, immutable: true },
    submittedAt: { type: Date, required: true, immutable: true },
    assignedAdminId: { type: String, ref: "User", required: true },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sending", "sent", "failed", "disabled"],
      required: true,
      default: "queued"
    },
    deliveryAttemptCount: { type: Number, required: true, default: 0, min: 0 },
    deliveredAt: { type: Date, default: null },
    deliveryFailureCode: { type: String, default: null, maxlength: 64 },
    status: {
      type: String,
      enum: ["pending", "approved", "changes_requested"],
      required: true,
      default: "pending"
    },
    decision: {
      type: String,
      enum: ["approve", "request_changes", null],
      default: null
    },
    decisionSource: {
      type: String,
      enum: ["client_portal", "admin_proof", null],
      default: null
    },
    decisionNote: { type: String, default: null, maxlength: 1_000 },
    decidedById: { type: String, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    version: { type: Number, required: true, default: 1, min: 1 }
  },
  { timestamps: true, versionKey: false }
);

designPlanReviewRoundSchema.index(
  { estimateId: 1, designPlanVersion: 1 },
  { unique: true }
);
designPlanReviewRoundSchema.index({ assignedAdminId: 1, status: 1, createdAt: -1 });
designPlanReviewRoundSchema.index({ estimateId: 1, createdAt: -1 });

export const DesignPlanReviewRoundModel =
  models.DesignPlanReviewRound ??
  model("DesignPlanReviewRound", designPlanReviewRoundSchema);
