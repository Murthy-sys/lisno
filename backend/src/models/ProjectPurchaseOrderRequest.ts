import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const paise = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger };
const totalSchema = new Schema({ netPaise: paise, gstPaise: paise, totalPaise: paise }, { _id: false, strict: "throw" });
const sectionTotalSchema = new Schema({ sectionId: { type: String, required: true }, label: { type: String, required: true }, totals: { type: totalSchema, required: true } }, { _id: false, strict: "throw" });
const vendorTotalSchema = new Schema({ vendorId: { type: String, required: true }, code: { type: String, required: true }, name: { type: String, required: true }, terms: { type: String, required: true }, totals: { type: totalSchema, required: true } }, { _id: false, strict: "throw" });
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
  idempotencyKey: { type: String, required: true },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  revisionId: { type: String, required: true },
  recordedAt: { type: Date, required: true }
}, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  projectName: { type: String, required: true, immutable: true },
  requestNumber: { type: String, required: true, immutable: true, match: /^POR-\d{8}-[A-F0-9]{8}$/u },
  status: { type: String, required: true, enum: ["pending_approval", "changes_requested", "rejected", "approved"] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  submittedRevisionId: { type: String, required: true },
  approvedOrderIds: { type: [String], default: [] },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  preparationDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  approvedEstimatePaise: paise,
  committedPaise: paise,
  committedGstPaise: paise,
  committedTotalPaise: paise,
  totals: { type: totalSchema, required: true },
  sectionTotals: { type: [sectionTotalSchema], required: true },
  vendorTotals: { type: [vendorTotalSchema], required: true },
  decisions: { type: [decisionSchema], default: [] },
  receipts: { type: [receiptSchema], default: [] },
  createdById: { type: String, required: true, immutable: true },
  updatedById: { type: String, required: true }
}, { collection: "projectPurchaseOrderRequests", timestamps: true, versionKey: false, strict: "throw" });

schema.index({ projectId: 1, updatedAt: -1, _id: 1 });
schema.index({ requestNumber: 1 }, { unique: true });
schema.index({ projectId: 1 }, { unique: true, name: "project_purchase_order_request_one_active",
  partialFilterExpression: { status: { $in: ["pending_approval", "changes_requested"] } } });
schema.index({ status: 1, updatedAt: 1, _id: 1 });
export const ProjectPurchaseOrderRequestModel = models.ProjectPurchaseOrderRequest ?? model("ProjectPurchaseOrderRequest", schema);
