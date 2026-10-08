import { model, models, Schema } from "./mongoose.js";

const version = { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger };
const integrityBasisSchema = new Schema({
  kind: { type: String, required: true, enum: ["observed_unverified"] },
  activatedDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  observedDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  reason: { type: String, required: true, minlength: 10, maxlength: 2_000 },
  actorId: { type: String, ref: "User", required: true },
  acknowledgedAt: { type: Date, required: true }
}, { _id: false, strict: "throw" });
const decisionSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, ref: "Project", required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { ...version, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  sourceLineItemKey: { type: String, required: true, maxlength: 500, immutable: true },
  mainLineId: { type: String, default: null, immutable: true },
  revisionId: { type: String, default: null },
  revisionDigest: { type: String, default: null, match: /^[a-f0-9]{64}$/u },
  mode: { type: String, enum: ["pmc", "sub_vendor", "in_house", null], default: null },
  quantity: { type: String, default: null, maxlength: 64 },
  discountBps: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger },
  markupBasis: { type: String, enum: ["starting", "minimum"], required: true },
  exceptionReason: { type: String, default: null, maxlength: 2_000 },
  integrityBasis: { type: integrityBasisSchema, default: undefined },
  version,
  createdById: { type: String, ref: "User", required: true, immutable: true },
  updatedById: { type: String, ref: "User", required: true }
}, { collection: "projectPurchaseOrderModeDecisions", timestamps: true, versionKey: false, strict: "throw" });

decisionSchema.index({ projectId: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1, sourceLineItemKey: 1 },
  { unique: true, name: "project_purchase_order_mode_source_unique" });
decisionSchema.index({ projectId: 1, estimateReviewRoundId: 1, sourceLineItemKey: 1 });

const receiptSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, ref: "Project", required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  decisionId: { type: String, required: true, immutable: true },
  response: { type: Schema.Types.Mixed, required: true, immutable: true },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }
}, { collection: "projectPurchaseOrderModeDecisionReceipts", versionKey: false, strict: "throw" });
receiptSchema.index({ projectId: 1, idempotencyKey: 1 }, { unique: true, name: "project_purchase_order_mode_idempotency_unique" });

export const ProjectPurchaseOrderModeDecisionModel = models.ProjectPurchaseOrderModeDecision ??
  model("ProjectPurchaseOrderModeDecision", decisionSchema);
export const ProjectPurchaseOrderModeDecisionReceiptModel = models.ProjectPurchaseOrderModeDecisionReceipt ??
  model("ProjectPurchaseOrderModeDecisionReceipt", receiptSchema);
