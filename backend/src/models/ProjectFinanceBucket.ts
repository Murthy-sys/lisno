import {
  MAX_FINANCE_AMOUNT_PAISE,
  PROJECT_FINANCE_BUCKET_STATUSES,
  PROJECT_FINANCE_CURRENCY,
  PROJECT_FINANCE_TARGET_MARGIN_BPS
} from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const safeIntegerValidator = {
  validator: (value: unknown) => Number.isSafeInteger(value),
  message: "{PATH} must be a safe integer."
};

const moneyPath = (immutable = false) => ({
  type: Number,
  required: true,
  min: 0,
  max: MAX_FINANCE_AMOUNT_PAISE,
  immutable,
  validate: safeIntegerValidator
});

const projectFinanceBucketSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
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
    designPlanVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: safeIntegerValidator
    },
    currency: {
      type: String,
      enum: [PROJECT_FINANCE_CURRENCY],
      required: true,
      immutable: true,
      default: PROJECT_FINANCE_CURRENCY
    },
    approvedSubtotalPaise: moneyPath(true),
    approvedGstPaise: moneyPath(true),
    approvedContractTotalPaise: moneyPath(true),
    targetMarginBps: {
      type: Number,
      required: true,
      min: PROJECT_FINANCE_TARGET_MARGIN_BPS,
      max: PROJECT_FINANCE_TARGET_MARGIN_BPS,
      immutable: true,
      validate: safeIntegerValidator
    },
    targetProfitPaise: moneyPath(true),
    costBudgetPaise: moneyPath(true),
    directSpendPaise: { ...moneyPath(), default: 0 },
    overheadPaise: { ...moneyPath(), default: 0 },
    status: {
      type: String,
      enum: PROJECT_FINANCE_BUCKET_STATUSES,
      required: true,
      default: "pending_design"
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: safeIntegerValidator
    },
    createdById: {
      type: String,
      ref: "User",
      required: true,
      immutable: true
    },
    openedAt: { type: Date, default: null },
    openedById: { type: String, ref: "User", default: null },
    closedAt: { type: Date, default: null },
    closedById: { type: String, ref: "User", default: null }
  },
  { timestamps: true, versionKey: false }
);

projectFinanceBucketSchema.pre("validate", function validateBucketState() {
  const status = this.get("status");
  const openedAt = this.get("openedAt");
  const openedById = this.get("openedById");
  const closedAt = this.get("closedAt");
  const closedById = this.get("closedById");
  const hasOpening = openedAt instanceof Date && typeof openedById === "string";
  const hasClosing = closedAt instanceof Date && typeof closedById === "string";
  if (
    (status === "pending_design" &&
      (openedAt !== null || openedById !== null || closedAt !== null || closedById !== null)) ||
    (status === "open" && (!hasOpening || closedAt !== null || closedById !== null)) ||
    (status === "closed" && (!hasOpening || !hasClosing))
  ) {
    this.invalidate(
      "status",
      "Finance bucket status and lifecycle timestamps are inconsistent."
    );
  }
  const subtotal = this.get("approvedSubtotalPaise");
  const gst = this.get("approvedGstPaise");
  const total = this.get("approvedContractTotalPaise");
  const targetProfit = this.get("targetProfitPaise");
  const costBudget = this.get("costBudgetPaise");
  const directSpend = this.get("directSpendPaise");
  const overhead = this.get("overheadPaise");
  if (
    typeof subtotal === "number" &&
    typeof gst === "number" &&
    typeof total === "number" &&
    subtotal + gst !== total
  ) {
    this.invalidate(
      "approvedContractTotalPaise",
      "Approved subtotal and GST must equal the contract total."
    );
  }
  if (
    typeof subtotal === "number" &&
    typeof targetProfit === "number" &&
    typeof costBudget === "number" &&
    targetProfit + costBudget !== subtotal
  ) {
    this.invalidate(
      "costBudgetPaise",
      "Target profit and cost budget must equal approved pre-GST revenue."
    );
  }
  if (
    Number.isSafeInteger(subtotal) &&
    Number.isSafeInteger(targetProfit)
  ) {
    const expectedTargetProfit = Number(
      (BigInt(subtotal) * BigInt(PROJECT_FINANCE_TARGET_MARGIN_BPS) + 5_000n) /
      10_000n
    );
    if (targetProfit !== expectedTargetProfit) {
      this.invalidate(
        "targetProfitPaise",
        "Target profit must be exactly 20% of approved pre-GST revenue."
      );
    }
  }
  if (
    Number.isSafeInteger(directSpend) &&
    Number.isSafeInteger(overhead) &&
    directSpend + overhead > MAX_FINANCE_AMOUNT_PAISE
  ) {
    this.invalidate(
      "overheadPaise",
      "Recorded project cost exceeds the supported finance amount."
    );
  }
});

projectFinanceBucketSchema.index({ projectId: 1 }, { unique: true });
projectFinanceBucketSchema.index({ estimateId: 1 }, { unique: true });
projectFinanceBucketSchema.index({ status: 1, updatedAt: -1, _id: 1 });

export const ProjectFinanceBucketModel =
  models.ProjectFinanceBucket ??
  model("ProjectFinanceBucket", projectFinanceBucketSchema);
