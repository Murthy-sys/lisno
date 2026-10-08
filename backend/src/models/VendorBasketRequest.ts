import { model, models, Schema } from "./mongoose.js";

const vendorBasketRequestSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  requesterId: { type: String, ref: "User", required: true, immutable: true },
  vendorId: { type: String, ref: "AiEstimatorKnowledgeVendor", default: null, immutable: true },
  vendorKey: { type: String, required: true, immutable: true },
  vendorName: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  vendorNameNormalized: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  proposedName: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  proposedNameNormalized: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  status: { type: String, enum: ["pending", "fulfilled", "rejected"], required: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", default: null },
  subBasketId: { type: String, ref: "AiEstimatorKnowledgeSubBasket", default: null },
  mainLineId: { type: String, ref: "AiEstimatorKnowledgeMainLine", default: null },
  reason: { type: String, default: null, maxlength: 1000 },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestFingerprint: { type: String, required: true, immutable: true },
  decisionIdempotencyKey: { type: String, default: null },
  decisionFingerprint: { type: String, default: null },
  createdAt: { type: Date, required: true, immutable: true },
  decidedAt: { type: Date, default: null },
  decidedById: { type: String, ref: "User", default: null }
}, { collection: "vendorBasketRequests", strict: "throw", versionKey: false });

vendorBasketRequestSchema.index({ requesterId: 1, idempotencyKey: 1 }, { unique: true });
vendorBasketRequestSchema.index({ vendorKey: 1, proposedNameNormalized: 1 }, {
  unique: true, partialFilterExpression: { status: "pending" }
});
vendorBasketRequestSchema.index({ vendorNameNormalized: 1, proposedNameNormalized: 1 }, {
  unique: true, partialFilterExpression: { status: "pending" }
});
vendorBasketRequestSchema.index({ status: 1, createdAt: -1, _id: 1 });
vendorBasketRequestSchema.index({ requesterId: 1, createdAt: -1, _id: 1 });

export const VendorBasketRequestModel = models.VendorBasketRequest ?? model("VendorBasketRequest", vendorBasketRequestSchema);
