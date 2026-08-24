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
import type { Query } from "mongoose";
import { EstimateClientResponseProofModel } from "./EstimateClientResponseProof.js";
import { model, models, Schema } from "./mongoose.js";

const safeIntegerValidator = {
  validator: (value: unknown) => Number.isSafeInteger(value),
  message: "{PATH} must be a safe integer."
};

const decisionStatePaths = [
  "status",
  "decision",
  "decisionSource",
  "decisionNote",
  "decidedById",
  "decidedAt"
] as const;

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
    estimateVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: safeIntegerValidator
    },
    sendGeneration: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: safeIntegerValidator
    },
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
    deliveryAttemptGeneration: {
      type: Number,
      required: true,
      min: 1,
      validate: safeIntegerValidator
    },
    deliveryAttemptCount: {
      type: Number,
      required: true,
      min: 0,
      validate: safeIntegerValidator
    },
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
    version: {
      type: Number,
      required: true,
      min: 1,
      validate: safeIntegerValidator
    }
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
  const error = decisionStateError({
    status: this.get("status"),
    decision: this.get("decision"),
    decisionSource: this.get("decisionSource"),
    decisionNote: this.get("decisionNote"),
    decidedById: this.get("decidedById"),
    decidedAt: this.get("decidedAt")
  });
  if (error) this.invalidate("status", error);
});

estimateClientReviewRoundSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate"],
  validateDecisionStateUpdate
);

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

function decisionStateError(input: Record<string, unknown>) {
  const {
    status,
    decision,
    decisionSource,
    decisionNote,
    decidedById,
    decidedAt
  } = input;
  if (status === "pending") {
    return [decision, decisionSource, decisionNote, decidedById, decidedAt].some(
      (value) => value !== null
    )
      ? "Pending review rounds cannot contain decision metadata."
      : null;
  }

  const expectedDecision = status === "approved" ? "approve" : "request_changes";
  if (
    !["approved", "changes_requested"].includes(String(status)) ||
    decision !== expectedDecision ||
    !["client_portal", "admin_proof"].includes(String(decisionSource)) ||
    typeof decisionNote !== "string" ||
    typeof decidedById !== "string" ||
    decidedById.length === 0 ||
    !isDate(decidedAt) ||
    (decision === "request_changes" &&
      decisionSource === "admin_proof" &&
      decisionNote.trim().length === 0)
  ) {
    return "Terminal review rounds require complete, status-consistent decision metadata.";
  }
  return null;
}

function validateDecisionStateUpdate(this: Query<unknown, unknown>) {
  const update = this.getUpdate();
  if (!updateTouchesDecisionState(update)) return;
  if (!update || Array.isArray(update)) {
    throw new Error("Decision state updates must set the complete decision tuple.");
  }

  const updateObject = update as Record<string, unknown>;
  const set = {
    ...Object.fromEntries(
      Object.entries(updateObject).filter(([key]) => !key.startsWith("$"))
    ),
    ...asRecord(updateObject.$set)
  };
  const nonSetMutation = Object.entries(updateObject).some(
    ([operator, value]) =>
      operator.startsWith("$") &&
      operator !== "$set" &&
      updateTouchesDecisionState(value)
  );
  if (
    nonSetMutation ||
    !decisionStatePaths.every((path) => Object.hasOwn(set, path))
  ) {
    throw new Error("Decision state updates must set the complete decision tuple.");
  }

  const error = decisionStateError(set);
  if (error) throw new Error(error);
}

function updateTouchesDecisionState(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(updateTouchesDecisionState);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([path, nested]) =>
      decisionStatePaths.includes(path.split(".")[0] as (typeof decisionStatePaths)[number]) ||
      updateTouchesDecisionState(nested)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const EstimateClientReviewRoundModel =
  models.EstimateClientReviewRound ??
  model("EstimateClientReviewRound", estimateClientReviewRoundSchema);

export async function prepareEstimateClientReviewIndexes(): Promise<void> {
  await EstimateClientReviewRoundModel.createIndexes();
  await EstimateClientResponseProofModel.createIndexes();
}
