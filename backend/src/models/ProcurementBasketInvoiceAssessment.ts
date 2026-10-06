import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const id = { type: String, required: true, trim: true, minlength: 1, maxlength: 500, immutable: true };
const money = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger, immutable: true };

const currentSchema = new Schema({
  _id: id, projectId: id, orderId: id, awardId: id,
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currentRevisionId: { type: String, required: true },
  updatedById: { type: String, required: true }
}, { collection: "procurementBasketInvoiceAssessments", strict: "throw", versionKey: false, timestamps: true });
currentSchema.index({ orderId: 1 }, { unique: true });
currentSchema.index({ projectId: 1, awardId: 1 });
export const ProcurementBasketInvoiceAssessmentModel = models.ProcurementBasketInvoiceAssessment ??
  model("ProcurementBasketInvoiceAssessment", currentSchema);

const revisionSchema = new Schema({
  _id: id, assessmentId: id, projectId: id, orderId: id, awardId: id,
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  invoiceNumber: { type: String, required: true, trim: true, minlength: 1, maxlength: 120, immutable: true },
  invoiceDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/u, immutable: true },
  invoiceEvidenceReference: { type: String, required: true, trim: true, minlength: 4, maxlength: 500, immutable: true },
  invoiceTotalPaise: money,
  tdsBasisPaise: money,
  tdsRateBasisPoints: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger, immutable: true },
  tdsPaise: money,
  netPayablePaise: money,
  withholdingEffectiveDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/u, immutable: true },
  withholdingRuleReference: { type: String, required: true, trim: true, minlength: 4, maxlength: 500, immutable: true },
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 2_000, immutable: true },
  digest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  idempotencyKey: { type: String, required: true, minlength: 8, maxlength: 128, immutable: true },
  assessedAt: { type: Date, required: true, immutable: true }, assessedById: id
}, { collection: "procurementBasketInvoiceAssessmentRevisions", strict: "throw", versionKey: false, timestamps: false });
revisionSchema.index({ assessmentId: 1, revision: 1 }, { unique: true });
revisionSchema.index({ orderId: 1, idempotencyKey: 1 }, { unique: true });
export const ProcurementBasketInvoiceAssessmentRevisionModel = models.ProcurementBasketInvoiceAssessmentRevision ??
  model("ProcurementBasketInvoiceAssessmentRevision", revisionSchema);
