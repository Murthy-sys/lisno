import {
  AI_ESTIMATOR_KNOWLEDGE_CURRENCY,
  AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES,
  createKnowledgePriceScopeKey
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const safeInteger = { validator: (value: unknown) => Number.isSafeInteger(value), message: "{PATH} must be a safe integer." };
const money = { type: Number, required: true, min: 0, max: AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE, immutable: true, validate: safeInteger };

const priceVersionSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    mainLineId: { type: String, ref: "AiEstimatorKnowledgeMainLine", required: true, immutable: true },
    revisionId: { type: String, ref: "AiEstimatorKnowledgeRevision", required: true, immutable: true },
    priceEntryId: { type: String, required: true, immutable: true },
    scopeKey: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/u },
    versionNumber: { type: Number, required: true, min: 1, immutable: true, validate: safeInteger },
    vendorId: { type: String, ref: "AiEstimatorKnowledgeVendor", required: true, immutable: true },
    uomId: { type: String, ref: "AiEstimatorKnowledgeUom", required: true, immutable: true },
    specificationId: { type: String, default: null, immutable: true },
    modeId: { type: String, ref: "AiEstimatorKnowledgeMode", default: null, immutable: true },
    taxRuleId: { type: String, ref: "AiEstimatorKnowledgeTaxRule", required: true, immutable: true },
    taxVersionId: { type: String, ref: "AiEstimatorKnowledgeTaxVersion", required: true, immutable: true },
    currency: { type: String, enum: [AI_ESTIMATOR_KNOWLEDGE_CURRENCY], required: true, default: AI_ESTIMATOR_KNOWLEDGE_CURRENCY, immutable: true },
    treatment: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS, required: true, immutable: true },
    inputAmountPaise: money,
    baseAmountPaise: money,
    taxAmountPaise: money,
    totalAmountPaise: money,
    effectiveFrom: { type: Date, required: true, immutable: true },
    effectiveTo: { type: Date, default: null, immutable: true },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES, required: true, default: "draft" },
    reviewRequired: { type: Boolean, required: true, default: false },
    version: { type: Number, required: true, default: 1, min: 1, validate: safeInteger },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true }
  },
  { collection: "aiEstimatorKnowledgePriceVersions", timestamps: true, versionKey: false, strict: "throw" }
);

priceVersionSchema.pre("validate", function deriveAndValidatePrice() {
  const scope = {
    vendorId: this.get("vendorId"),
    uomId: this.get("uomId"),
    specificationId: this.get("specificationId") ?? null,
    modeId: this.get("modeId") ?? null
  };
  if (typeof scope.vendorId === "string" && typeof scope.uomId === "string") {
    this.set("scopeKey", createKnowledgePriceScopeKey(scope));
  }
  const input = this.get("inputAmountPaise");
  const base = this.get("baseAmountPaise");
  const tax = this.get("taxAmountPaise");
  const total = this.get("totalAmountPaise");
  if ([input, base, tax, total].every(Number.isSafeInteger)) {
    if (base + tax !== total) this.invalidate("totalAmountPaise", "Base and tax must equal total.");
    if (this.get("treatment") === "exclusive" && input !== base) this.invalidate("inputAmountPaise", "Exclusive price input must equal base amount.");
    if (this.get("treatment") === "inclusive" && input !== total) this.invalidate("inputAmountPaise", "Inclusive price input must equal total amount.");
  }
  const from = this.get("effectiveFrom");
  const to = this.get("effectiveTo");
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || (to !== null && (!(to instanceof Date) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()))) {
    this.invalidate("effectiveTo", "Price effective window is invalid.");
  }
});

priceVersionSchema.index({ revisionId: 1, priceEntryId: 1, versionNumber: 1 }, { unique: true });
priceVersionSchema.index({ revisionId: 1, scopeKey: 1, status: 1, effectiveFrom: 1, effectiveTo: 1, _id: 1 });
priceVersionSchema.index({ priceEntryId: 1, versionNumber: -1, _id: 1 });
priceVersionSchema.index({ mainLineId: 1, revisionId: 1, status: 1, effectiveFrom: -1, effectiveTo: 1, _id: 1 });
priceVersionSchema.index({ revisionId: 1, vendorId: 1, uomId: 1, modeId: 1, status: 1, _id: 1 });

export const AiEstimatorKnowledgePriceVersionModel =
  models.AiEstimatorKnowledgePriceVersion ??
  model("AiEstimatorKnowledgePriceVersion", priceVersionSchema);
