import { model, models, Schema } from "./mongoose.js";

const receiptSchema = new Schema({
  kind: { type: String, required: true, enum: ["progress", "submit", "image"] },
  idempotencyKey: { type: String, required: true, maxlength: 128 },
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  resultId: { type: String, default: null },
  recordedAt: { type: Date, required: true }
}, { _id: false, strict: "throw" });

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  vendorId: { type: String, required: true, immutable: true, ref: "AiEstimatorKnowledgeVendor" },
  orderId: { type: String, required: true, immutable: true, ref: "ProjectPurchaseOrder" },
  orderRevision: { type: Number, required: true, min: 1, immutable: true },
  lineId: { type: String, required: true, immutable: true },
  procurementItemId: { type: String, required: true, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  sourceSectionId: { type: String, required: true, immutable: true },
  sourceLineItemKey: { type: String, required: true, immutable: true },
  roomName: { type: String, required: true, immutable: true },
  itemName: { type: String, required: true, immutable: true },
  scopeType: { type: String, enum: ["supply", "execution", "supply_and_execution"], immutable: true },
  description: { type: String, required: true, immutable: true, maxlength: 2_000 },
  targetDate: { type: String, immutable: true },
  deliveryLocation: { type: String, immutable: true, maxlength: 500 },
  status: { type: String, required: true, enum: ["awaiting_vendor_access", "ready", "in_progress", "submitted_for_client", "changes_requested", "client_approved", "superseded"] },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  progress: { type: Number, required: true, min: 0, max: 100, validate: Number.isSafeInteger },
  currentRound: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  note: { type: String, required: true, default: "", maxlength: 2_000 },
  lastUpdatedById: { type: String, default: null },
  submittedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  receipts: { type: [receiptSchema], default: [] }
}, { collection: "vendorWorkAssignments", timestamps: true, versionKey: false, strict: "throw" });

schema.index({ orderId: 1, orderRevision: 1, lineId: 1 }, { unique: true });
schema.index({ vendorId: 1, status: 1, targetDate: 1, _id: 1 });
schema.index({ projectId: 1, status: 1, sourceSectionId: 1, _id: 1 });

export const VendorWorkAssignmentModel = models.VendorWorkAssignment ?? model("VendorWorkAssignment", schema);
