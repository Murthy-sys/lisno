import {
  ESTIMATE_CLIENT_DECISIONS,
  ESTIMATE_CLIENT_DECISION_NOTE_MAX,
  ESTIMATE_CLIENT_DECISION_SOURCES,
  ESTIMATE_CLIENT_REVIEW_STATUSES,
  ESTIMATE_CLIENT_SHA256,
  ESTIMATE_DELIVERY_FAILURE_CODE,
  ESTIMATE_DELIVERY_STATUSES
} from "../domain/estimate-client-review.js";
import { emailSchema, normalizeEmail } from "../domain/email.js";
import { EstimateClientResponseProofModel } from "./EstimateClientResponseProof.js";
import { model, models, Schema } from "./mongoose.js";

const estimateClientReviewLineItemSchema = new Schema(
  {
    catalogueId: { type: String, required: true, immutable: true },
    roomName: { type: String, required: true, immutable: true },
    specification: { type: String, required: true, immutable: true },
    unit: { type: String, required: true, immutable: true },
    rate: { type: Number, required: true, immutable: true },
    quantity: { type: Number, required: true, immutable: true },
    included: { type: Boolean, required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true }
  },
  { _id: false, strict: "throw" }
);

const estimateClientReviewSnapshotSchema = new Schema(
  {
    clientName: { type: String, required: true, immutable: true },
    projectName: { type: String, required: true, immutable: true },
    location: { type: String, required: true, immutable: true },
    propertyType: { type: String, required: true, immutable: true },
    lineItems: {
      type: [estimateClientReviewLineItemSchema],
      required: true,
      immutable: true
    },
    subtotal: { type: Number, required: true, immutable: true },
    gst: { type: Number, required: true, immutable: true },
    total: { type: Number, required: true, immutable: true }
  },
  { _id: false, strict: "throw" }
);

const estimateClientReviewRoundSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
    leadId: { type: String, ref: "Lead", required: true, immutable: true },
    projectId: { type: String, ref: "Project", default: null, immutable: true },
    estimateVersion: { type: Number, required: true, immutable: true, min: 1 },
    sendGeneration: { type: Number, required: true, immutable: true, min: 1 },
    dedupeKey: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    recipientEmail: { type: String, required: true, immutable: true },
    recipientEmailNormalized: { type: String, required: true, immutable: true },
    estimateSnapshot: {
      type: estimateClientReviewSnapshotSchema,
      required: true,
      immutable: true
    },
    pdfFilename: { type: String, required: true, immutable: true },
    pdfMimeType: {
      type: String,
      enum: ["application/pdf"],
      required: true,
      immutable: true
    },
    pdfByteSize: { type: Number, required: true, immutable: true, min: 1 },
    pdfSha256: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    pdfStorageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    deliveryStatus: {
      type: String,
      enum: ESTIMATE_DELIVERY_STATUSES,
      required: true
    },
    deliveryAttemptGeneration: { type: Number, required: true, min: 1 },
    deliveryAttemptCount: { type: Number, required: true, min: 0 },
    deliveryAttemptedAt: { type: Date, default: null },
    deliveryLeaseExpiresAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    deliveryFailureCode: {
      type: String,
      default: null,
      maxlength: 64,
      match: ESTIMATE_DELIVERY_FAILURE_CODE
    },
    assignedAdminId: { type: String, ref: "User", required: true },
    status: {
      type: String,
      enum: ESTIMATE_CLIENT_REVIEW_STATUSES,
      required: true
    },
    decision: { type: String, enum: ESTIMATE_CLIENT_DECISIONS, default: null },
    decisionSource: {
      type: String,
      enum: ESTIMATE_CLIENT_DECISION_SOURCES,
      default: null
    },
    decisionNote: {
      type: String,
      default: null,
      maxlength: ESTIMATE_CLIENT_DECISION_NOTE_MAX
    },
    decidedById: { type: String, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    version: { type: Number, required: true, min: 1 }
  },
  { timestamps: true, versionKey: false }
);

estimateClientReviewRoundSchema.pre("validate", function normalizeRecipient() {
  const parsed = emailSchema.safeParse(this.get("recipientEmail"));
  if (!parsed.success) {
    this.invalidate("recipientEmail", "Review recipient email is invalid.");
    return;
  }
  this.set("recipientEmail", parsed.data);
  this.set("recipientEmailNormalized", normalizeEmail(parsed.data));
});

estimateClientReviewRoundSchema.pre("validate", function validateDecisionState() {
  const status = this.get("status");
  const decision = this.get("decision");
  const source = this.get("decisionSource");
  const note = this.get("decisionNote");
  const decidedById = this.get("decidedById");
  const decidedAt = this.get("decidedAt");

  if (status === "pending") {
    if ([decision, source, note, decidedById, decidedAt].some((value) => value !== null)) {
      this.invalidate("status", "Pending review rounds cannot contain decision metadata.");
    }
    return;
  }

  const expectedDecision = status === "approved" ? "approve" : "request_changes";
  if (
    decision !== expectedDecision ||
    typeof source !== "string" ||
    typeof note !== "string" ||
    typeof decidedById !== "string" ||
    decidedById.length === 0 ||
    !isDate(decidedAt) ||
    (decision === "request_changes" && note.trim().length === 0)
  ) {
    this.invalidate(
      "status",
      "Terminal review rounds require complete, status-consistent decision metadata."
    );
  }
});

estimateClientReviewRoundSchema.index({ dedupeKey: 1 }, { unique: true });
estimateClientReviewRoundSchema.index(
  { estimateId: 1, sendGeneration: 1 },
  { unique: true }
);
estimateClientReviewRoundSchema.index({
  assignedAdminId: 1,
  status: 1,
  createdAt: -1,
  _id: 1
});
estimateClientReviewRoundSchema.index({ estimateId: 1, createdAt: -1, _id: 1 });

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export const EstimateClientReviewRoundModel =
  models.EstimateClientReviewRound ??
  model("EstimateClientReviewRound", estimateClientReviewRoundSchema);

export async function prepareEstimateClientReviewIndexes(): Promise<void> {
  await EstimateClientReviewRoundModel.createIndexes();
  await EstimateClientResponseProofModel.createIndexes();
}
