import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const amount = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger };
const draftLineSchema = new Schema({
  id: { type: String, required: true },
  procurementItemId: { type: String, required: true },
  procurementItemVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  quantityMilliUnits: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger },
  unitPricePaise: { ...amount, min: 1 },
  gstBasisPoints: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger },
  scopeType: { type: String, required: true, enum: ["supply", "execution", "supply_and_execution"] },
  description: { type: String, required: true, maxlength: 2_000 },
  targetDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/u },
  deliveryLocation: { type: String, required: true, maxlength: 500 }
}, { _id: false, strict: "throw" });

const decisionSchema = new Schema({
  id: { type: String, required: true, immutable: true },
  revisionId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  decision: { type: String, required: true, enum: ["approve", "request_changes", "reject"], immutable: true },
  actorId: { type: String, required: true, immutable: true },
  reason: { type: String, default: null, maxlength: 2_000, immutable: true },
  budgetOverrideReason: { type: String, default: null, maxlength: 2_000, immutable: true },
  decidedAt: { type: Date, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true }
}, { _id: false, strict: "throw" });

const receiptSchema = new Schema({
  kind: { type: String, required: true, enum: ["update", "submit", "amend", "cancel"] },
  idempotencyKey: { type: String, required: true, maxlength: 128 },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  revisionId: { type: String, default: null },
  recordedAt: { type: Date, required: true }
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  orderNumber: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  projectRequestId: { type: String, default: null, immutable: true },
  projectRequestRevisionId: { type: String, default: null, immutable: true },
  vendorId: { type: String, required: true, immutable: true, ref: "AiEstimatorKnowledgeVendor" },
  vendorCode: { type: String, required: true },
  vendorName: { type: String, required: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  status: { type: String, required: true, enum: ["draft", "pending_approval", "changes_requested", "rejected", "approved", "cancelled"] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  revision: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  terms: { type: String, required: true, maxlength: 4_000 },
  draftLines: { type: [draftLineSchema], required: true, validate: (value: unknown[]) => value.length > 0 && value.length <= 100 },
  draftNetPaise: amount,
  draftGstPaise: amount,
  draftTotalPaise: amount,
  submittedRevisionId: { type: String, default: null },
  approvedRevisionId: { type: String, default: null },
  approvedRevision: { type: Number, default: null, min: 1, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  approvedNetPaise: { type: Number, default: null, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  approvedGstPaise: { type: Number, default: null, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  approvedTotalPaise: { type: Number, default: null, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  approvedAt: { type: Date, default: null },
  amendmentOfRevision: { type: Number, default: null, min: 1, validate: (value: number | null) => value === null || Number.isSafeInteger(value) },
  amendmentReason: { type: String, default: null, maxlength: 2_000 },
  cancelledAt: { type: Date, default: null },
  cancelledById: { type: String, default: null },
  cancellationReason: { type: String, default: null, maxlength: 2_000 },
  decisions: { type: [decisionSchema], default: [] },
  receipts: { type: [receiptSchema], default: [] },
  createIdempotencyKey: { type: String, required: true },
  createRequestDigest: { type: String, required: true },
  createdById: { type: String, required: true, immutable: true },
  updatedById: { type: String, required: true }
}, { collection: "projectPurchaseOrders", timestamps: true, versionKey: false, strict: "throw" });

schema.index({ projectId: 1, vendorId: 1, createdAt: -1, _id: 1 }, { name: "project_purchase_order_vendor_list" });
schema.index({ orderNumber: 1 }, { unique: true });
schema.index({ projectId: 1, createIdempotencyKey: 1 }, { unique: true });
schema.index({ status: 1, updatedAt: -1, _id: 1 });
schema.index({ projectId: 1, approvedRevisionId: 1, cancelledAt: 1 });
schema.index({ projectRequestId: 1, projectRequestRevisionId: 1, vendorId: 1 }, { unique: true, partialFilterExpression: { projectRequestId: { $type: "string" } } });

export const ProjectPurchaseOrderModel = models.ProjectPurchaseOrder ?? model("ProjectPurchaseOrder", schema);
