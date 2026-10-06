import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const rateSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, ref: "Project", required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  mainBasketId: { type: String, required: true, maxlength: 500, immutable: true },
  sourceLineItemKey: { type: String, required: true, maxlength: 500, immutable: true },
  overridePaise: { type: Number, default: null, min: 0, max: MAX_FINANCE_AMOUNT_PAISE,
    validate: { validator: (value: number | null) => value === null || Number.isSafeInteger(value),
      message: "Override must be integer paise." } },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  updatedById: { type: String, ref: "User", required: true }
}, { collection: "procurementBasketBaseRates", timestamps: true, versionKey: false, strict: "throw" });
rateSchema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1,
  mainBasketId: 1, sourceLineItemKey: 1 }, { unique: true, name: "procurement_basket_project_rate_source_unique" });

const receiptSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, ref: "Project", required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  response: { type: Schema.Types.Mixed, required: true, immutable: true },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }
}, { collection: "procurementBasketBaseRateReceipts", versionKey: false, strict: "throw" });
receiptSchema.index({ projectId: 1, idempotencyKey: 1 },
  { unique: true, name: "procurement_basket_project_rate_idempotency_unique" });

export const ProcurementBasketBaseRateModel = models.ProcurementBasketBaseRate ??
  model("ProcurementBasketBaseRate", rateSchema);
export const ProcurementBasketBaseRateReceiptModel = models.ProcurementBasketBaseRateReceipt ??
  model("ProcurementBasketBaseRateReceipt", receiptSchema);
