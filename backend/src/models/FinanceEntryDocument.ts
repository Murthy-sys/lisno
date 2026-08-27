import { model, models, Schema } from "./mongoose.js";

export const FINANCE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

const safeIntegerValidator = {
  validator: (value: unknown) => Number.isSafeInteger(value),
  message: "{PATH} must be a safe integer."
};

const financeEntryDocumentSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    entryId: {
      type: String,
      ref: "FinanceLedgerEntry",
      required: true,
      immutable: true
    },
    bucketId: {
      type: String,
      ref: "ProjectFinanceBucket",
      required: true,
      immutable: true
    },
    projectId: {
      type: String,
      ref: "Project",
      required: true,
      immutable: true
    },
    estimateId: {
      type: String,
      ref: "Estimate",
      required: true,
      immutable: true
    },
    estimateVersion: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: safeIntegerValidator
    },
    estimateReviewRoundId: {
      type: String,
      ref: "EstimateClientReviewRound",
      default: null,
      immutable: true
    },
    sourceSectionId: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
      immutable: true
    },
    sourceLineItemKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
      immutable: true
    },
    originalFilename: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 255,
      immutable: true
    },
    mimeType: {
      type: String,
      enum: FINANCE_DOCUMENT_MIME_TYPES,
      required: true,
      immutable: true
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: safeIntegerValidator
    },
    sha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/u,
      immutable: true,
      select: false
    },
    storageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    createdById: {
      type: String,
      ref: "User",
      required: true,
      immutable: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    strict: "throw"
  }
);

financeEntryDocumentSchema.index({ entryId: 1 }, { unique: true });
financeEntryDocumentSchema.index({ projectId: 1, entryId: 1 });

export const FinanceEntryDocumentModel =
  models.FinanceEntryDocument ??
  model("FinanceEntryDocument", financeEntryDocumentSchema);
