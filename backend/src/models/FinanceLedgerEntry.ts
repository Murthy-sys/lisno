import {
  FINANCE_EXPENSE_CLASSES,
  FINANCE_LEDGER_ENTRY_STATUSES,
  FINANCE_LEDGER_ENTRY_TYPES,
  MAX_FINANCE_AMOUNT_PAISE
} from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const financeLedgerEntrySchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
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
    type: {
      type: String,
      enum: FINANCE_LEDGER_ENTRY_TYPES,
      required: true,
      immutable: true
    },
    /*
     * Null is retained for direct-spend rows written before expense
     * classification existed. New API writes require a class in the service;
     * reports conservatively include legacy null rows under `other`.
     */
    expenseClass: {
      type: String,
      enum: FINANCE_EXPENSE_CLASSES,
      default: null,
      immutable: true
    },
    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      immutable: true
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_FINANCE_AMOUNT_PAISE,
      immutable: true,
      validate: {
        validator: (value: unknown) => Number.isSafeInteger(value),
        message: "{PATH} must be a safe integer."
      }
    },
    incurredAt: { type: Date, required: true, immutable: true },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1_000,
      immutable: true
    },
    vendor: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      immutable: true
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      immutable: true
    },
    sourceSectionId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      immutable: true
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
      immutable: true
    },
    status: {
      type: String,
      enum: FINANCE_LEDGER_ENTRY_STATUSES,
      required: true,
      default: "posted"
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: {
        validator: (value: unknown) => Number.isSafeInteger(value),
        message: "{PATH} must be a safe integer."
      }
    },
    createdById: {
      type: String,
      ref: "User",
      required: true,
      immutable: true
    },
    voidedAt: { type: Date, default: null },
    voidedById: { type: String, ref: "User", default: null },
    voidReason: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 1_000,
      default: null
    }
  },
  { timestamps: true, versionKey: false }
);

financeLedgerEntrySchema.pre("validate", function validateEntryState() {
  const type = this.get("type");
  const expenseClass = this.get("expenseClass");
  const status = this.get("status");
  const voidedAt = this.get("voidedAt");
  const voidedById = this.get("voidedById");
  const voidReason = this.get("voidReason");
  const hasVoid =
    voidedAt instanceof Date &&
    typeof voidedById === "string" &&
    typeof voidReason === "string" &&
    voidReason.length > 0;
  if (
    (status === "posted" &&
      (voidedAt !== null || voidedById !== null || voidReason !== null)) ||
    (status === "voided" && !hasVoid)
  ) {
    this.invalidate(
      "status",
      "Finance ledger status and void metadata are inconsistent."
    );
  }
  if (type === "overhead" && expenseClass !== null) {
    this.invalidate(
      "expenseClass",
      "Overheads cannot be classified as direct project expenses."
    );
  }
});

financeLedgerEntrySchema.index(
  { projectId: 1, idempotencyKey: 1 },
  { unique: true }
);
financeLedgerEntrySchema.index({ bucketId: 1, incurredAt: -1, _id: -1 });
financeLedgerEntrySchema.index({ projectId: 1, type: 1, status: 1, incurredAt: -1 });

export const FinanceLedgerEntryModel =
  models.FinanceLedgerEntry ??
  model("FinanceLedgerEntry", financeLedgerEntrySchema);
